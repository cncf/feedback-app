#!/usr/bin/env bun
/**
 * CNCF feedback loop sync.
 *
 * A maintainer labels an issue in a participating project repo; a discussion
 * appears in the hub; both sides get a backlink. Editing the issue's shared
 * block mirrors to the discussion, as do its prefixed labels, stripped of the
 * prefix. Removing the label closes the discussion; re-adding it reopens the
 * same one.
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
// `bl` records which backlinks are already posted: "d" discussion side, "i"
// issue side. Storing it here rather than re-scanning comments keeps the check
// O(1) and, more importantly, correct: a comment marker ages out of any bounded
// comment window on a busy issue, which would make the sync re-post the backlink
// on every run forever.
const marker = (issueId, repo, bl = "") =>
  `<!-- cncf-feedback:issue=${issueId} repo=${repo}${bl ? ` bl=${bl}` : ""} -->`;
const backlinkMark = (kind, id) => `<!-- cncf-feedback:backlink:${kind}=${id} -->`;
const MARKER_RE = /<!-- cncf-feedback:issue=([A-Za-z0-9_\-=]+)(?: repo=([^\s>]+))?(?: bl=([di]+))? -->/;

// ------------------------------------------------------------------ auth
// Split identities: the hub App holds discussions:write on the hub; the source
// App is installed separately by each participating project on its own org.
// An installation token covers ONE installation, so the source side enumerates
// installations and mints a token per owner. Hence a key, not a token.

const HUB_TOKEN = process.env.GH_HUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const SOURCE_APP_ID = process.env.SOURCE_APP_ID;
const SOURCE_APP_KEY = process.env.SOURCE_APP_PRIVATE_KEY;
const FALLBACK = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
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

/**
 * GitHub reports an App under two spellings: `viewer.login` gives
 * "name[bot]" while `author.login` on the content it wrote gives plain "name".
 * Comparing them naively makes the sync reject its own discussions and create
 * duplicates forever, so every provenance comparison is normalised.
 */
const sameActor = (a, b) => {
  const n = (x) => (x || "").toLowerCase().replace(/\[bot\]$/, "");
  return !!a && !!b && n(a) === n(b);
};
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
  // Prefer what the token actually is. `viewer` resolves for user tokens and
  // fails for installation tokens; only then fall back to the configured bot
  // login. Reading config first would break local runs by comparing a human
  // author against the bot name.
  try {
    _hubWho = (await hub(`{ viewer { login } }`)).viewer.login;
    if (_hubWho) return _hubWho;
  } catch {
    /* installation token - fall through to configured bot login */
  }
  if (CONFIG.hubBotLogin) return (_hubWho = CONFIG.hubBotLogin);
  try {
    throw new Error("viewer unavailable and hubBotLogin unset");
  } catch (e) {
    throw new Error(
      `cannot establish hub identity (${e.message.slice(0, 60)}). ` +
        `Set hubBotLogin in config.json to the App's bot login, e.g. "cncf-feedback[bot]". ` +
        `Refusing to run without provenance checks.`
    );
  }
  if (!_hubWho) throw new Error("hub identity resolved empty - refusing to run");
  return _hubWho;
}

const _srcWho = new Map();
async function sourceIdentity(owner) {
  if (_srcWho.has(owner)) return _srcWho.get(owner);
  let who;
  try {
    who = (await src(owner, `{ viewer { login } }`)).viewer.login;
    if (who) {
      _srcWho.set(owner, who);
      return who;
    }
  } catch {
    /* installation token */
  }
  if (CONFIG.sourceBotLogin) {
    _srcWho.set(owner, CONFIG.sourceBotLogin);
    return CONFIG.sourceBotLogin;
  }
  try {
    throw new Error("viewer unavailable and sourceBotLogin unset");
  } catch (e) {
    throw new Error(
      `cannot establish source identity for "${owner}" (${e.message.slice(0, 60)}). ` +
        `Set sourceBotLogin in config.json. Refusing to run without provenance checks.`
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

const discussionBody = (block, issue, bl = "") =>
  `${marker(issue.id, issue.repo, bl)}\n${block}${FOOTER}[${issue.repo}#${issue.number}](${issue.url}). Edits to the source issue appear here.*`;

// ----------------------------------------------------------------- index

/**
 * Rebuild issue -> discussion from the hub itself. Only discussions in a
 * configured category (default or route) and authored by us are trusted: the
 * marker is public text, so anyone could paste it into an open category to
 * hijack adoption.
 */
async function buildIndex(project, log) {
  const us = await hubIdentity();
  const [owner, name] = project.hub.repo.split("/");
  const cats = configuredCategories(project);
  const index = new Map();
  let cursor = null,
    page = 0,
    rejected = 0;

  for (;;) {
    const d = await hub(
      `query($o:String!,$n:String!,$c:String){ repository(owner:$o,name:$n){
        discussions(first:100,after:$c){
          pageInfo{ hasNextPage endCursor }
          nodes{ id number title url closed body author{ login } category{ id name } labels(first:50){ nodes{ id name } } }
        }
      }}`,
      { o: owner, n: name, c: cursor }
    );
    const conn = d.repository.discussions;
    page++;
    for (const n of conn.nodes) {
      const m = n.body?.match(MARKER_RE);
      if (!m) continue;
      if (!cats.has(n.category?.id)) {
        rejected++;
        log(`  ignoring #${n.number}: marker in category "${n.category?.name}"`);
        continue;
      }
      if (!sameActor(n.author?.login, us)) {
        rejected++;
        log(`  ignoring #${n.number}: authored by @${n.author?.login}, not @${us}`);
        continue;
      }
      index.set(m[1], {
        issueId: m[1],
        repo: m[2] || null,
        bl: m[3] || "",
        discussionId: n.id,
        number: n.number,
        title: n.title,
        url: n.url,
        closed: n.closed,
        category: n.category.id,
        block: blockFromDiscussion(n.body),
        labels: n.labels.nodes,
      });
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  log(`  index: ${index.size} tracked across ${page} page(s)${rejected ? `, ${rejected} rejected` : ""}`);
  return index;
}

// --------------------------------------------------------------- routing

/**
 * Which category this issue's discussion belongs in. Routes match on exact
 * label name; first match in config order wins - order IS the priority, and
 * the only tie-break available: the owning group is not derivable from labels
 * (kubernetes keeps it in kep.yaml, not on the issue). No matching label falls
 * back to the project's default category, and no routes at all reproduces the
 * old single-category behaviour exactly.
 */
export function categoryFor(project, issueLabels) {
  const hits = (project.routes ?? []).filter((r) => issueLabels.includes(r.label));
  const t = hits[0] ?? project.hub;
  return { categoryId: t.categoryId, categoryName: t.categoryName, ambiguous: hits.length > 1 ? hits.map((r) => r.label) : null };
}

/** Every category the config claims. The index trusts markers in any of them - and only them. */
export const configuredCategories = (project) =>
  new Set([project.hub.categoryId, ...(project.routes ?? []).map((r) => r.categoryId)]);

// -------------------------------------------------------------- queries

async function labelledIssues(repo, label) {
  const [owner, name] = repo.split("/");
  const d = await src(
    owner,
    `query($o:String!,$n:String!,$l:String!){ repository(owner:$o,name:$n){
      issues(first:100,states:OPEN,labels:[$l],orderBy:{field:UPDATED_AT,direction:DESC}){
        nodes{ id number title body url labels(first:50){ nodes{ name } } }
      }
    }}`,
    { o: owner, n: name, l: label }
  );
  return d.repository.issues.nodes.map((n) => ({ ...n, repo, labels: n.labels.nodes.map((l) => l.name) }));
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

const createDiscussion = (project, catId, t, b) =>
  hub(
    `mutation($r:ID!,$c:ID!,$t:String!,$b:String!){ createDiscussion(input:{repositoryId:$r,categoryId:$c,title:$t,body:$b}){ discussion{ id number url } } }`,
    { r: project.hub.repositoryId, c: catId, t, b }
  ).then((d) => d.createDiscussion.discussion);

const updateDiscussion = (id, t, b, c) =>
  hub(`mutation($id:ID!,$t:String!,$b:String!,$c:ID!){ updateDiscussion(input:{discussionId:$id,title:$t,body:$b,categoryId:$c}){ discussion{ id } } }`, { id, t, b, c });

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
/**
 * Look for a backlink we already posted. Only called when the marker says the
 * backlink is missing - which, after the first successful sync, means either a
 * genuinely missing backlink or a crash between "comment posted" and "marker
 * updated". Paginates, because on a busy issue the comment is not in the last
 * page.
 */
async function backlinkExists(kind, hostId, mark, expectedAuthor, useSrc, owner) {
  const q = `query($id:ID!,$c:String){ node(id:$id){
    ... on Issue { comments(first:100,after:$c){ pageInfo{hasNextPage endCursor} nodes{ body author{ login } } } }
    ... on Discussion { comments(first:100,after:$c){ pageInfo{hasNextPage endCursor} nodes{ body author{ login } } } }
  }}`;
  let cursor = null;
  for (;;) {
    const d = useSrc ? await src(owner, q, { id: hostId, c: cursor }) : await hub(q, { id: hostId, c: cursor });
    const conn = d?.node?.comments;
    if (!conn) return false;
    if (conn.nodes.some((c) => c.body?.includes(mark) && sameActor(c.author?.login, expectedAuthor))) return true;
    if (!conn.pageInfo.hasNextPage) return false;
    cursor = conn.pageInfo.endCursor;
  }
}

/**
 * Posting a comment and recording that fact are writes to two different
 * resources, so they cannot be made atomic. Two mitigations:
 *   1. the marker is updated immediately after EACH comment, so the crash
 *      window is one write wide rather than two;
 *   2. when the marker says a backlink is missing, verify against the actual
 *      comments before posting - that closes the window entirely at the cost
 *      of a scan that only runs when something is genuinely incomplete.
 */
async function ensureBacklinks(issue, rec, block, log) {
  const owner = issue.repo.split("/")[0];
  const persist = async (bl) => {
    await updateDiscussion(rec.discussionId, issue.title, discussionBody(block, issue, bl), rec.category);
    rec.bl = bl;
  };

  if (!(rec.bl || "").includes("d")) {
    const mark = backlinkMark("issue", issue.id);
    const already = await backlinkExists("discussion", rec.discussionId, mark, await hubIdentity(), false);
    if (already) {
      log(`  backlink -> discussion already present, recording it`);
      if (!DRY) await persist((rec.bl || "") + "d");
    } else if (DRY) log(`  would backlink -> discussion`);
    else {
      await commentOnDiscussion(
        rec.discussionId,
        `${mark}\nTracking issue: [${issue.repo}#${issue.number}](${issue.url})\n\nThis thread is for **end-user feedback**. Implementation discussion belongs on the issue.`
      );
      await persist((rec.bl || "") + "d");
      log(`  backlink -> discussion`);
    }
  }

  if (!(rec.bl || "").includes("i")) {
    const mark = backlinkMark("discussion", rec.discussionId);
    const already = await backlinkExists("issue", issue.id, mark, await sourceIdentity(owner), true, owner);
    if (already) {
      log(`  backlink -> issue already present, recording it`);
      if (!DRY) await persist((rec.bl || "") + "i");
    } else if (DRY) log(`  would backlink -> issue`);
    else {
      await commentOnIssue(
        owner,
        issue.id,
        `${mark}\nFeedback discussion opened: ${rec.url}\n\nEnd users can comment there without following this issue's implementation detail.`
      );
      await persist((rec.bl || "") + "i");
      log(`  backlink -> issue`);
    }
  }
}

// ----------------------------------------------------------------- labels
// Maintainer label vocabulary is prefixed (`area/`, `kind/`); end users see the
// bare term. Only prefixed labels cross over, because the unprefixed ones are
// process labels - lgtm, needs-rebase, do-not-merge/hold - and publishing those
// on the end-user surface is exactly the implementation noise the hub exists to
// keep out.

const PREFIXES = CONFIG.labelPrefixes ?? [];

/** Hub name for a source label, or null when it is not ours to mirror. */
export function stripPrefix(name, prefixes) {
  const p = prefixes.find((p) => name.length > p.length && name.startsWith(p));
  return p ? name.slice(p.length) : null;
}

/**
 * What to add, and what to retract. `vocab` is every hub name this source repo
 * COULD produce, and is the only way to tell a label the sync put there from
 * one a hub moderator added by hand: once the prefix is stripped the two are
 * indistinguishable on the discussion. Anything outside the vocabulary is
 * therefore left alone - hub-side curation survives a source-side removal.
 */
export function planLabels(issueLabels, discussionLabels, vocab, prefixes) {
  const want = new Set(issueLabels.map((n) => stripPrefix(n, prefixes)).filter(Boolean));
  const have = new Set(discussionLabels.map((l) => l.name));
  return {
    add: [...want].filter((n) => !have.has(n)),
    remove: discussionLabels.filter((l) => vocab.has(l.name) && !want.has(l.name)),
  };
}

// ponytail: one page of labels per repo. A repo with more than 100 would lose
// the tail silently, so the count is checked and reported rather than paginated
// for a case no CNCF repo is near.
async function repoLabels(repo, gql, log) {
  const [o, n] = repo.split("/");
  const d = await gql(`query($o:String!,$n:String!){ repository(owner:$o,name:$n){ labels(first:100){ totalCount nodes{ id name } } }}`, { o, n });
  const { totalCount, nodes } = d.repository.labels;
  if (totalCount > nodes.length) log(`  WARNING: ${repo} has ${totalCount} labels; only the first ${nodes.length} are considered`);
  return nodes;
}

const hubLabelCache = new Map();
/** name -> id in the hub repo. Labels are per-repo, so a mirrored name that was never created there cannot be applied. */
async function hubLabelIds(repo, log) {
  if (!hubLabelCache.has(repo)) {
    hubLabelCache.set(repo, new Map((await repoLabels(repo, hub, log)).map((l) => [l.name, l.id])));
  }
  return hubLabelCache.get(repo);
}

const vocabCache = new Map();
async function vocabularyFor(repo, log) {
  if (!vocabCache.has(repo)) {
    const owner = repo.split("/")[0];
    const names = await repoLabels(repo, (q, v) => src(owner, q, v), log);
    vocabCache.set(repo, new Set(names.map((l) => stripPrefix(l.name, PREFIXES)).filter(Boolean)));
  }
  return vocabCache.get(repo);
}

// Once per run, not once per issue: an unmirrorable label is a standing
// condition, and repeating it per issue drowns the lines that report work.
const warned = new Set();

async function syncLabels(project, issue, rec, vocab, log) {
  const { add, remove } = planLabels(issue.labels, rec.labels, vocab, PREFIXES);
  if (!add.length && !remove.length) return;

  const ids = await hubLabelIds(project.hub.repo, log);
  const wanted = [];
  for (const name of add) {
    const id = ids.get(name);
    if (id) wanted.push({ name, id });
    else if (!warned.has(name)) {
      warned.add(name);
      log(`    label "${name}" is not in ${project.hub.repo} - create it there to mirror it`);
    }
  }

  const names = (ls) => ls.map((l) => l.name).join(" ");
  if (wanted.length) {
    if (DRY) log(`    would label #${rec.number}: +${names(wanted)}`);
    else {
      await addLabels(rec.discussionId, wanted.map((l) => l.id));
      log(`    labelled #${rec.number}: +${names(wanted)}`);
    }
  }
  if (remove.length) {
    if (DRY) log(`    would unlabel #${rec.number}: -${names(remove)}`);
    else {
      await removeLabels(rec.discussionId, remove.map((l) => l.id));
      log(`    unlabelled #${rec.number}: -${names(remove)}`);
    }
  }
}

const addLabels = (id, l) =>
  hub(`mutation($id:ID!,$l:[ID!]!){ addLabelsToLabelable(input:{labelableId:$id,labelIds:$l}){ clientMutationId } }`, { id, l });

const removeLabels = (id, l) =>
  hub(`mutation($id:ID!,$l:[ID!]!){ removeLabelsFromLabelable(input:{labelableId:$id,labelIds:$l}){ clientMutationId } }`, { id, l });

// ------------------------------------------------------------------ run

async function run() {
  const log = console.log;
  if (!HUB_TOKEN) throw new Error("need GH_HUB_TOKEN (or GH_TOKEN for local runs)");
  log(appMode ? "auth: hub token + source App (per-installation tokens)" : "auth: single token - LOCAL TESTING ONLY");
  log(`label: ${CONFIG.feedbackLabel}${DRY ? "  (DRY RUN)" : ""}`);

  const failures = [];
  let active = 0;

  for (const project of CONFIG.projects) {
    if (!project.sources?.length) {
      log(`\n${project.name}: provisioned, no sources yet - skipping`);
      continue;
    }
    active++;
    log(`\n${project.name} -> ${project.hub.repo} [${project.hub.categoryName}]`);

    const index = await buildIndex(project, log);
    const seen = new Set();

    for (const repo of project.sources) {
      let issues, vocab;
      try {
        issues = await labelledIssues(repo, CONFIG.feedbackLabel);
        vocab = PREFIXES.length ? await vocabularyFor(repo, log) : null;
      } catch (e) {
        log(`  ERROR reading ${repo}: ${e.message}`);
        failures.push(`${project.name}/${repo}: ${e.message}`);
        continue;
      }
      log(`  source ${repo}: ${issues.length} labelled issue(s)`);

      for (const issue of issues) {
        seen.add(issue.id);
        const block = extractBlock(issue.body);
        let rec = index.get(issue.id);

        if (!block) {
          log(`    ${issue.repo}#${issue.number}: no ${BEGIN} block${rec ? " - refusing to overwrite live discussion" : " - skipped"}`);
          continue;
        }

        const cat = categoryFor(project, issue.labels);
        const note = cat.ambiguous ? ` (matches ${cat.ambiguous.join(" + ")}; config order wins)` : "";

        if (!rec) {
          if (DRY) { log(`    would create discussion: "${issue.title}" [${cat.categoryName}]${note}`); continue; }
          const d = await createDiscussion(project, cat.categoryId, issue.title, discussionBody(block, issue));
          rec = { discussionId: d.id, number: d.number, title: issue.title, url: d.url, closed: false, block, bl: "", labels: [], category: cat.categoryId };
          index.set(issue.id, rec);
          log(`    created discussion #${d.number} [${cat.categoryName}] -> ${d.url}${note}`);
        } else if (rec.closed) {
          if (!DRY) await reopenDiscussion(rec.discussionId);
          rec.closed = false;
          log(`    relabelled -> reopened discussion #${rec.number}`);
        }

        const titleChanged = rec.title !== undefined && rec.title !== issue.title;
        const catChanged = rec.category !== cat.categoryId;
        if (rec.block !== block || titleChanged || catChanged) {
          const what = [rec.block !== block && "body", titleChanged && "title", catChanged && `category->"${cat.categoryName}"`].filter(Boolean).join("+");
          if (DRY) log(`    would mirror ${what} -> #${rec.number}${catChanged ? note : ""}`);
          else {
            await updateDiscussion(rec.discussionId, issue.title, discussionBody(block, issue, rec.bl || ""), cat.categoryId);
            log(`    mirrored ${what} -> discussion #${rec.number}${catChanged ? note : ""}`);
          }
          rec.block = block;
          rec.title = issue.title;
          rec.category = cat.categoryId;
        }

        await ensureBacklinks(issue, rec, block, log);
        if (vocab) await syncLabels(project, issue, rec, vocab, log);
      }
    }

    // Reconciliation: a query for labelled issues can never return one whose
    // label was just removed, so closure is only visible from the index.
    for (const [issueId, rec] of index) {
      if (seen.has(issueId) || rec.closed) continue;
      if (!rec.repo) {
        log(`    #${rec.number}: legacy marker without repo - re-label the issue to upgrade it`);
        continue;
      }
      const res = await issueById(issueId, rec.repo.split("/")[0]);
      if (!res.ok) {
        log(`    #${rec.number}: issue not visible (${res.reason}) - leaving discussion untouched`);
        continue;
      }
      if (!res.issue.labels.includes(CONFIG.feedbackLabel)) {
        if (DRY) log(`    would close #${rec.number}`);
        else {
          await closeDiscussion(rec.discussionId);
          log(`    ${res.issue.repo}#${res.issue.number}: label gone -> closed discussion #${rec.number}`);
        }
      }
    }
  }

  log(`\n${active}/${CONFIG.projects.length} project(s) active`);
  if (failures.length) {
    log(`FAILED: ${failures.length} source(s) could not be processed`);
    for (const f of failures) log(`  - ${f}`);
    process.exit(1);
  }
  log("done");
}

if (import.meta.main) await run();
