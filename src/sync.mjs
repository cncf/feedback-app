#!/usr/bin/env bun
/**
 * CNCF feedback loop sync.
 *
 * A maintainer labels an issue in a participating project repo; a discussion
 * appears in the hub; both sides get a backlink. Editing the issue's shared
 * block mirrors to the discussion. Removing the label closes the discussion;
 * re-adding it reopens the same one.
 *
 * Content flows one way. The only write into a project repo is the backlink
 * comment, posted once and never updated.
 *
 * NOTE ON THE MARKERS: text outside BEGIN-BLOCK/END-BLOCK is NOT private. It
 * stays fully visible in the source issue, which is public. The markers are
 * curation - they choose what is worth mirroring to end users in the hub - not
 * confidentiality. Never describe them as hiding anything.
 *
 * There is NO local state. The mapping lives in the hub discussions themselves,
 * as a marker in each body, and is rebuilt every run. A state file would be a
 * second source of truth that can fail to persist (protected branches, failed
 * pushes, fresh runners) and silently lose the ability to detect unlabelling.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createSign } from "crypto";

const ROOT = join(import.meta.dir, "..");
const CONFIG = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const DRY = process.argv.includes("--dry-run");

const BEGIN = "<!-- BEGIN-BLOCK -->";
const END = "<!-- END-BLOCK -->";
const FOOTER = "\n\n---\n*Mirrored from ";
// The marker carries the source repo as well as the issue id: reconciliation
// happens after the label is gone, so the index is the only thing that knows
// which installation token can still see that issue.
const marker = (issueId, repo) => `<!-- cncf-feedback:issue=${issueId} repo=${repo} -->`;
const backlinkMark = (kind, id) => `<!-- cncf-feedback:backlink:${kind}=${id} -->`;
const MARKER_RE = /<!-- cncf-feedback:issue=([A-Za-z0-9_\-=]+)(?: repo=([^\s>]+))? -->/;

// ------------------------------------------------------------------ auth
// Split identities: the hub App holds discussions:write on the hub; the source
// App is installed separately by each participating project on its own org.
// An installation token covers ONE installation, so the source side enumerates
// installations and mints a token per owner. Hence a key, not a token.

const HUB_TOKEN = process.env.GH_HUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const SOURCE_APP_ID = process.env.SOURCE_APP_ID;
const SOURCE_APP_KEY = process.env.SOURCE_APP_PRIVATE_KEY;
const FALLBACK = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!HUB_TOKEN) throw new Error("need GH_HUB_TOKEN (or GH_TOKEN for local runs)");
const appMode = !!(SOURCE_APP_ID && SOURCE_APP_KEY);

function appJwt() {
  const now = Math.floor(Date.now() / 1000);
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = b({ alg: "RS256", typ: "JWT" });
  const pl = b({ iat: now - 60, exp: now + 540, iss: String(SOURCE_APP_ID) });
  const sg = createSign("RSA-SHA256");
  sg.update(`${h}.${pl}`);
  sg.end();
  return `${h}.${pl}.${sg.sign(SOURCE_APP_KEY).toString("base64url")}`;
}

async function rest(path, token, init = {}) {
  const r = await fetch("https://api.github.com" + path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "cncf-feedback-sync",
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.json();
}

const tokenCache = new Map();
let installations = null;

async function sourceTokenFor(owner) {
  if (!appMode) return FALLBACK;
  const key = owner.toLowerCase();
  if (tokenCache.has(key)) return tokenCache.get(key);
  if (!installations) {
    // paginated: an App installed across many orgs exceeds one page
    installations = new Map();
    const jwt = appJwt();
    for (let page = 1; ; page++) {
      const batch = await rest(`/app/installations?per_page=100&page=${page}`, jwt);
      for (const i of batch) installations.set(i.account.login.toLowerCase(), i.id);
      if (batch.length < 100) break;
    }
    console.log(`  source App installed on: ${[...installations.keys()].join(", ") || "(none)"}`);
  }
  const id = installations.get(key);
  if (!id) throw new Error(`source App not installed on "${owner}" - the project must install it`);
  const t = await rest(`/app/installations/${id}/access_tokens`, appJwt(), { method: "POST" });
  tokenCache.set(key, t.token);
  return t.token;
}

async function gqlWith(token, query, variables = {}) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "cncf-feedback-sync",
    },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors.map((e) => e.message).join("; "));
  return j.data;
}

const hub = (q, v) => gqlWith(HUB_TOKEN, q, v);
const src = async (owner, q, v) => gqlWith(await sourceTokenFor(owner), q, v);

/**
 * Provenance checks must never fail open. If we cannot establish who we are,
 * we cannot tell our own discussions and comments from an impostor's, so the
 * run aborts rather than silently trusting everything.
 *
 * Installation tokens cannot resolve `viewer`, so App mode requires the bot
 * login to be configured (`<app-slug>[bot]`).
 */
let _hubWho;
async function hubIdentity() {
  if (_hubWho !== undefined) return _hubWho;
  if (CONFIG.hub.botLogin) return (_hubWho = CONFIG.hub.botLogin);
  try {
    _hubWho = (await hub(`{ viewer { login } }`)).viewer.login;
  } catch (e) {
    throw new Error(
      `cannot establish hub identity (${e.message.slice(0, 60)}). ` +
        `Set hub.botLogin in config.json to the App's bot login, e.g. "cncf-feedback[bot]". ` +
        `Refusing to run without provenance checks.`
    );
  }
  if (!_hubWho) throw new Error("hub identity resolved empty - refusing to run");
  return _hubWho;
}

const _srcWho = new Map();
async function sourceIdentity(owner) {
  if (_srcWho.has(owner)) return _srcWho.get(owner);
  if (CONFIG.source?.botLogin) {
    _srcWho.set(owner, CONFIG.source.botLogin);
    return CONFIG.source.botLogin;
  }
  let who;
  try {
    who = (await src(owner, `{ viewer { login } }`)).viewer.login;
  } catch (e) {
    throw new Error(
      `cannot establish source identity for "${owner}" (${e.message.slice(0, 60)}). ` +
        `Set source.botLogin in config.json. Refusing to run without provenance checks.`
    );
  }
  if (!who) throw new Error(`source identity for "${owner}" resolved empty - refusing to run`);
  _srcWho.set(owner, who);
  return who;
}

// --------------------------------------------------------------- content

/** Fail closed: no markers means nothing is shared, never a truncated body. */
export function extractBlock(body) {
  if (!body) return null;
  const i = body.indexOf(BEGIN);
  const j = body.indexOf(END);
  if (i === -1 || j === -1 || j < i) return null;
  const inner = body.slice(i + BEGIN.length, j).trim();
  return inner.length ? inner : null;
}

/** The block as it currently stands in a discussion, so edits diff cleanly. */
function blockFromDiscussion(body) {
  if (!body) return null;
  let s = body.replace(MARKER_RE, "").trimStart();
  const f = s.indexOf(FOOTER.trimStart());
  if (f !== -1) s = s.slice(0, f);
  return s.trim() || null;
}

const discussionBody = (block, issue) =>
  `${marker(issue.id, issue.repo)}\n${block}${FOOTER}[${issue.repo}#${issue.number}](${issue.url}). Edits to the source issue appear here.*`;

// ----------------------------------------------------------------- index

/**
 * Rebuild issue -> discussion from the hub itself. Only discussions in the
 * configured category and authored by us are trusted: the marker is public
 * text, so anyone could paste it into an open category to hijack adoption.
 */
async function buildIndex(log) {
  const us = await hubIdentity();
  const [owner, name] = CONFIG.hub.repo.split("/");
  const index = new Map();
  let cursor = null,
    page = 0,
    rejected = 0;

  for (;;) {
    const d = await hub(
      `query($o:String!,$n:String!,$c:String){ repository(owner:$o,name:$n){
        discussions(first:100,after:$c){
          pageInfo{ hasNextPage endCursor }
          nodes{ id number title url closed body author{ login } category{ id name } }
        }
      }}`,
      { o: owner, n: name, c: cursor }
    );
    const conn = d.repository.discussions;
    page++;
    for (const n of conn.nodes) {
      const m = n.body?.match(MARKER_RE);
      if (!m) continue;
      if (n.category?.id !== CONFIG.hub.categoryId) {
        rejected++;
        log(`  ignoring #${n.number}: marker in category "${n.category?.name}"`);
        continue;
      }
      if (n.author?.login !== us) {
        rejected++;
        log(`  ignoring #${n.number}: authored by @${n.author?.login}, not @${us}`);
        continue;
      }
      index.set(m[1], {
        issueId: m[1],
        repo: m[2] || null,
        discussionId: n.id,
        number: n.number,
        title: n.title,
        url: n.url,
        closed: n.closed,
        block: blockFromDiscussion(n.body),
      });
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  log(`index: ${index.size} tracked across ${page} page(s)${rejected ? `, ${rejected} rejected` : ""}`);
  return index;
}

// -------------------------------------------------------------- queries

async function labelledIssues(repo, label) {
  const [owner, name] = repo.split("/");
  const d = await src(
    owner,
    `query($o:String!,$n:String!,$l:String!){ repository(owner:$o,name:$n){
      issues(first:100,states:OPEN,labels:[$l],orderBy:{field:UPDATED_AT,direction:DESC}){
        nodes{ id number title body url }
      }
    }}`,
    { o: owner, n: name, l: label }
  );
  return d.repository.issues.nodes.map((n) => ({ ...n, repo }));
}

/** {ok,issue} - never conflates "cannot see it" with "label removed". */
async function issueById(id, owner) {
  try {
    const d = await src(
      owner,
      `query($id:ID!){ node(id:$id){ ... on Issue {
        id number title body url
        repository{ nameWithOwner }
        labels(first:100){ nodes{ name } }
      }}}`,
      { id }
    );
    if (!d.node) return { ok: false, reason: "not visible" };
    return {
      ok: true,
      issue: {
        ...d.node,
        repo: d.node.repository.nameWithOwner,
        labels: d.node.labels.nodes.map((l) => l.name),
      },
    };
  } catch (e) {
    return { ok: false, reason: e.message.slice(0, 80) };
  }
}

// ------------------------------------------------------------ mutations

const createDiscussion = (t, b) =>
  hub(
    `mutation($r:ID!,$c:ID!,$t:String!,$b:String!){ createDiscussion(input:{repositoryId:$r,categoryId:$c,title:$t,body:$b}){ discussion{ id number url } } }`,
    { r: CONFIG.hub.repositoryId, c: CONFIG.hub.categoryId, t, b }
  ).then((d) => d.createDiscussion.discussion);

const updateDiscussion = (id, t, b) =>
  hub(`mutation($id:ID!,$t:String!,$b:String!){ updateDiscussion(input:{discussionId:$id,title:$t,body:$b}){ discussion{ id } } }`, { id, t, b });

const closeDiscussion = (id) =>
  hub(`mutation($id:ID!){ closeDiscussion(input:{discussionId:$id,reason:OUTDATED}){ discussion{ closed } } }`, { id });

const reopenDiscussion = (id) =>
  hub(`mutation($id:ID!){ reopenDiscussion(input:{discussionId:$id}){ discussion{ closed } } }`, { id });

const commentOnDiscussion = (id, body) =>
  hub(`mutation($id:ID!,$b:String!){ addDiscussionComment(input:{discussionId:$id,body:$b}){ comment{ id } } }`, { id, b: body });

const commentOnIssue = (owner, id, body) =>
  src(owner, `mutation($id:ID!,$b:String!){ addComment(input:{subjectId:$id,body:$b}){ clientMutationId } }`, { id, b: body });

// -------------------------------------------------------------- backlinks

/**
 * A comment body is attacker-controlled, so a bare marker is not proof: any
 * commenter could suppress the real backlink. Require the marker keyed to THIS
 * target, and that we wrote it.
 */
async function ensureBacklinks(issue, rec, log) {
  const owner = issue.repo.split("/")[0];
  const q = `query($id:ID!){ node(id:$id){
    ... on Issue { comments(last:100){ nodes{ body author{ login } } } }
    ... on Discussion { comments(last:100){ nodes{ body author{ login } } } }
  }}`;
  const mine = (d, mark, who) =>
    (d?.node?.comments?.nodes || []).some(
      (c) => c.body?.includes(mark) && c.author?.login === who
    );

  const [i, dsc, srcWho, hubWho] = await Promise.all([
    src(owner, q, { id: issue.id }),
    hub(q, { id: rec.discussionId }),
    sourceIdentity(owner),
    hubIdentity(),
  ]);

  if (!mine(dsc, backlinkMark("issue", issue.id), hubWho)) {
    if (DRY) log(`  would backlink -> discussion`);
    else {
      await commentOnDiscussion(
        rec.discussionId,
        `${backlinkMark("issue", issue.id)}\nTracking issue: [${issue.repo}#${issue.number}](${issue.url})\n\nThis thread is for **end-user feedback**. Implementation discussion belongs on the issue.`
      );
      log(`  backlink -> discussion`);
    }
  }
  if (!mine(i, backlinkMark("discussion", rec.discussionId), srcWho)) {
    if (DRY) log(`  would backlink -> issue`);
    else {
      await commentOnIssue(
        owner,
        issue.id,
        `${backlinkMark("discussion", rec.discussionId)}\nFeedback discussion opened: ${rec.url}\n\nEnd users can comment there without following this issue's implementation detail.`
      );
      log(`  backlink -> issue`);
    }
  }
}

// ------------------------------------------------------------------ run

async function run() {
  const log = console.log;
  log(appMode ? "auth: hub token + source App (per-installation tokens)" : "auth: single token - LOCAL TESTING ONLY");
  log(`hub: ${CONFIG.hub.repo} category=${CONFIG.hub.categoryName}`);
  log(`label: ${CONFIG.feedbackLabel}${DRY ? "  (DRY RUN)" : ""}\n`);

  const index = await buildIndex(log);
  const seen = new Set();
  const failures = [];

  // 1. discovery - issues currently carrying the label
  for (const repo of CONFIG.sources) {
    log(`\nsource ${repo}`);
    let issues;
    try {
      issues = await labelledIssues(repo, CONFIG.feedbackLabel);
    } catch (e) {
      // A source we cannot read is a failed run, not a quiet one. Keep going so
      // other sources still sync, but the process must exit nonzero - otherwise
      // a missing installation shows up as a green scheduled run that synced
      // nothing at all.
      log(`  ERROR reading ${repo}: ${e.message}`);
      failures.push(`${repo}: ${e.message}`);
      continue;
    }
    log(`  ${issues.length} labelled issue(s)`);

    for (const issue of issues) {
      seen.add(issue.id);
      const block = extractBlock(issue.body);
      let rec = index.get(issue.id);

      if (!block) {
        log(`  ${issue.repo}#${issue.number}: no ${BEGIN} block${rec ? " - refusing to overwrite live discussion" : " - skipped"}`);
        continue;
      }

      if (!rec) {
        if (DRY) {
          log(`  would create discussion: "${issue.title}"`);
          continue;
        }
        const d = await createDiscussion(issue.title, discussionBody(block, issue));
        rec = { discussionId: d.id, number: d.number, title: issue.title, url: d.url, closed: false, block };
        index.set(issue.id, rec);
        log(`  created discussion #${d.number} -> ${d.url}`);
      } else if (rec.closed) {
        if (!DRY) await reopenDiscussion(rec.discussionId);
        rec.closed = false;
        log(`  relabelled -> reopened discussion #${rec.number}`);
      }

      // Title is copied at creation, so it has to track edits too - otherwise a
      // renamed issue leaves the discussion advertising the old name forever.
      const titleChanged = rec.title !== undefined && rec.title !== issue.title;
      if (rec.block !== block || titleChanged) {
        const what = [rec.block !== block && "body", titleChanged && "title"].filter(Boolean).join("+");
        if (DRY) log(`  would mirror ${what} -> #${rec.number}`);
        else {
          await updateDiscussion(rec.discussionId, issue.title, discussionBody(block, issue));
          log(`  mirrored ${what} -> discussion #${rec.number}`);
        }
        rec.block = block;
        rec.title = issue.title;
      }

      await ensureBacklinks(issue, rec, log);
    }
  }

  // 2. reconciliation - a search for *labelled* issues can never return one
  //    whose label was removed, so closure is only visible from the index.
  log(`\nreconciling ${index.size} tracked discussion(s)`);
  for (const [issueId, rec] of index) {
    if (seen.has(issueId) || rec.closed) continue;
    // owner comes from the marker, not from a guess at the first source
    if (!rec.repo) {
      log(`  #${rec.number}: legacy marker without repo - re-label the issue to upgrade it`);
      continue;
    }
    const res = await issueById(issueId, rec.repo.split("/")[0]);

    // Losing sight of an issue is not evidence the label was removed. A
    // revoked installation, a repo gone private, or a transient error all look
    // like "not found". Uninstalling stops writes; it does not retract
    // feedback. Only ever close on a positive observation.
    if (!res.ok) {
      log(`  #${rec.number}: issue not visible (${res.reason}) - leaving discussion untouched`);
      continue;
    }
    if (!res.issue.labels.includes(CONFIG.feedbackLabel)) {
      if (DRY) log(`  would close #${rec.number}`);
      else {
        await closeDiscussion(rec.discussionId);
        log(`  ${res.issue.repo}#${res.issue.number}: label gone -> closed discussion #${rec.number}`);
      }
    }
  }
  if (failures.length) {
    log(`\nFAILED: ${failures.length} source(s) could not be processed`);
    for (const f of failures) log(`  - ${f}`);
    process.exit(1);
  }
  log(`\ndone`);
}

if (import.meta.main) await run();
