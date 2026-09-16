#!/usr/bin/env bun
/**
 * CNCF feedback loop sync.
 *
 * Maintainer labels an issue in a participating project repo.
 * A discussion appears in the hub. Both sides get a backlink.
 * Label removed -> discussion closed. Label re-added -> reopened.
 *
 * Content flows one way (issue -> discussion). The only write into a
 * project repo is the backlink comment, posted once, never updated.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { createSign } from "crypto";

// Split identities (decision 14). The hub App holds discussions:write on the
// hub; the source App is installed separately by each participating project on
// their own org.
//
// An installation token is scoped to ONE installation. There is no token that
// spans every org, so the source side must enumerate its installations and mint
// a token per owner. That is why this script takes the source App's key rather
// than a pre-minted token.
const HUB_TOKEN = process.env.GH_HUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const SOURCE_APP_ID = process.env.SOURCE_APP_ID;
const SOURCE_APP_KEY = process.env.SOURCE_APP_PRIVATE_KEY;
const FALLBACK = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!HUB_TOKEN) throw new Error("need GH_HUB_TOKEN (or GH_TOKEN for local runs)");

const appMode = !!(SOURCE_APP_ID && SOURCE_APP_KEY);
console.log(
  appMode
    ? "auth: hub token + source App (per-installation tokens)"
    : "auth: single token - LOCAL TESTING ONLY, not the production shape"
);

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

/** owner -> installation token, minted lazily and cached for this run. */
const tokenCache = new Map();
let installations = null;

async function sourceTokenFor(owner) {
  if (!appMode) return FALLBACK;
  if (tokenCache.has(owner)) return tokenCache.get(owner);
  if (!installations) {
    const list = await rest("/app/installations", appJwt());
    installations = new Map(list.map((i) => [i.account.login.toLowerCase(), i.id]));
    console.log(`  source App installed on: ${[...installations.keys()].join(", ") || "(none)"}`);
  }
  const id = installations.get(owner.toLowerCase());
  if (!id) throw new Error(`source App is not installed on "${owner}" - project must install it`);
  const t = await rest(`/app/installations/${id}/access_tokens`, appJwt(), { method: "POST" });
  tokenCache.set(owner, t.token);
  return t.token;
}

const ROOT = join(import.meta.dir, "..");
const CONFIG = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const STATE_PATH = join(ROOT, CONFIG.statePath);
const DRY = process.argv.includes("--dry-run");

const BEGIN = "<!-- BEGIN-BLOCK -->";
const END = "<!-- END-BLOCK -->";

// ---------------------------------------------------------------- api

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

/** hub identity: discussions. */
const hub = (q, v) => gqlWith(HUB_TOKEN, q, v);
/** source identity: issues, with the token for THAT owner's installation. */
const src = async (owner, q, v) => gqlWith(await sourceTokenFor(owner), q, v);
const gql = (q, v) => gqlWith(HUB_TOKEN, q, v);

// ---------------------------------------------------------------- state

function loadState() {
  if (!existsSync(STATE_PATH)) return { version: 1, synced: {} };
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

function saveState(s) {
  if (DRY) return;
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2) + "\n");
}

// ---------------------------------------------------------------- content

/**
 * The synced region is delimited by markers. Fail closed: if an issue
 * that previously synced no longer parses, we refuse to overwrite a live
 * discussion with a truncated body.
 */
export function extractBlock(body) {
  if (!body) return null;
  const i = body.indexOf(BEGIN);
  const j = body.indexOf(END);
  if (i === -1 || j === -1 || j < i) return null;
  const inner = body.slice(i + BEGIN.length, j).trim();
  return inner.length ? inner : null;
}

const marker = (issueId) => `<!-- cncf-feedback:issue=${issueId} -->`;
const BACKLINK_MARK = "<!-- cncf-feedback:backlink -->";

/** On adoption we must not re-post backlinks that already exist. Ask both sides. */
async function existingBacklinks(issueId, discussionId, issueOwnerHint) {
  const q = `query($id:ID!){ node(id:$id){
    ... on Issue { comments(last:100){ nodes{ body } } }
    ... on Discussion { comments(last:100){ nodes{ body } } }
  }}`;
  const has = (d) => (d?.node?.comments?.nodes || []).some((c) => c.body?.includes(BACKLINK_MARK));
  const owner = issueOwnerHint || "";
  const [i, dsc] = await Promise.all([src(owner, q, { id: issueId }), hub(q, { id: discussionId })]);
  return { issue: has(i), discussion: has(dsc) };
}

function discussionBody(block, issue) {
  return `${marker(issue.id)}
${block}

---
*Mirrored from [${issue.repo}#${issue.number}](${issue.url}). Edits to the source issue appear here. Last synced ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.*`;
}

// ---------------------------------------------------------------- queries

async function labelledIssues(repo, label) {
  const [owner, name] = repo.split("/");
  const d = await src(
    owner,
    `query($owner:String!,$name:String!,$label:String!){
      repository(owner:$owner,name:$name){
        issues(first:50,states:OPEN,labels:[$label],orderBy:{field:UPDATED_AT,direction:DESC}){
          nodes{ id number title body url updatedAt }
        }
      }
    }`,
    { owner, name, label }
  );
  return d.repository.issues.nodes.map((n) => ({ ...n, repo }));
}

/** Returns {ok, issue} - never conflates "cannot see it" with "label removed". */
async function issueById(id, owner) {
  let d;
  try {
    d = await src(
      owner,
    `query($id:ID!){ node(id:$id){ ... on Issue {
      id number title body url state
      repository{ nameWithOwner }
      labels(first:50){ nodes{ name } }
    }}}`,
      { id }
    );
  } catch (e) {
    return { ok: false, reason: e.message };
  }
  const n = d.node;
  if (!n) return { ok: false, reason: "node not visible" };
  return {
    ok: true,
    issue: { ...n, repo: n.repository.nameWithOwner, labels: n.labels.nodes.map((l) => l.name) },
  };
}

/**
 * Source of truth for "does a discussion already exist for this issue" is
 * GitHub, not our state file. A fresh runner with no state, or a run whose
 * state commit was lost, must not recreate discussions.
 */
async function findExistingDiscussion(issueId) {
  const q = `repo:${CONFIG.hub.repo} in:body "${marker(issueId)}"`;
  const d = await hub(
    `query($q:String!){ search(type:DISCUSSION,query:$q,first:5){ nodes{ ... on Discussion {
      id number url closed body
    }}}}`,
    { q }
  );
  const hit = (d.search.nodes || []).find((n) => n.body?.includes(marker(issueId)));
  return hit || null;
}

// ---------------------------------------------------------------- mutations

async function createDiscussion(title, body) {
  const d = await hub(
    `mutation($r:ID!,$c:ID!,$t:String!,$b:String!){
      createDiscussion(input:{repositoryId:$r,categoryId:$c,title:$t,body:$b}){
        discussion{ id number url }
      }
    }`,
    { r: CONFIG.hub.repositoryId, c: CONFIG.hub.categoryId, t: title, b: body }
  );
  return d.createDiscussion.discussion;
}

const updateDiscussion = (id, title, body) =>
  hub(
    `mutation($id:ID!,$t:String!,$b:String!){ updateDiscussion(input:{discussionId:$id,title:$t,body:$b}){ discussion{ id } } }`,
    { id, t: title, b: body }
  );

const closeDiscussion = (id) =>
  hub(
    `mutation($id:ID!){ closeDiscussion(input:{discussionId:$id,reason:OUTDATED}){ discussion{ closed } } }`,
    { id }
  );

const reopenDiscussion = (id) =>
  hub(`mutation($id:ID!){ reopenDiscussion(input:{discussionId:$id}){ discussion{ closed } } }`, { id });

const commentOnDiscussion = (id, body) =>
  hub(
    `mutation($id:ID!,$b:String!){ addDiscussionComment(input:{discussionId:$id,body:$b}){ comment{ id } } }`,
    { id, b: body }
  );

const commentOnIssue = (owner, id, body) =>
  src(owner, `mutation($id:ID!,$b:String!){ addComment(input:{subjectId:$id,body:$b}){ clientMutationId } }`, {
    id,
    b: body,
  });

// ---------------------------------------------------------------- sync

async function publish(issue, state, log) {
  const block = extractBlock(issue.body);
  if (!block) {
    log(`  skip ${issue.repo}#${issue.number}: no ${BEGIN} block`);
    return;
  }
  const title = issue.title;
  const body = discussionBody(block, issue);

  // never create without asking GitHub first
  let disc = await findExistingDiscussion(issue.id);
  const adopted = !!disc;
  if (disc) {
    log(`  adopting existing discussion #${disc.number} (state was missing it)`);
  } else {
    if (DRY) return log(`  would create discussion: "${title}"`);
    disc = await createDiscussion(title, body);
    log(`  created discussion #${disc.number} -> ${disc.url}`);
  }

  // checkpoint BEFORE backlinks: a crash here must not orphan the discussion
  const rec = (state.synced[issue.id] = {
    repo: issue.repo,
    number: issue.number,
    issueUrl: issue.url,
    discussionId: disc.id,
    discussionNumber: disc.number,
    discussionUrl: disc.url,
    closed: !!disc.closed,
    lastBlock: block,
    backlinks: adopted
      ? await existingBacklinks(issue.id, disc.id, issue.repo.split("/")[0])
      : { discussion: false, issue: false },
    syncedAt: new Date().toISOString(),
  });
  saveState(state);

  await ensureBacklinks(issue, rec, log);
}

/** Each backlink is tracked separately so a retry posts only what is missing. */
async function ensureBacklinks(issue, rec, log) {
  if (DRY) return;
  if (!rec.backlinks?.discussion) {
    await commentOnDiscussion(
      rec.discussionId,
      `${BACKLINK_MARK}\nTracking issue: [${issue.repo}#${issue.number}](${issue.url})\n\nThis thread is for **end-user feedback**. Implementation discussion belongs on the issue.`
    );
    rec.backlinks.discussion = true;
    saveState(state_ref);
    log(`  backlink -> discussion`);
  }
  if (!rec.backlinks?.issue) {
    await commentOnIssue(
      issue.repo.split("/")[0],
      issue.id,
      `${BACKLINK_MARK}\nFeedback discussion opened: ${rec.discussionUrl}\n\nEnd users can comment there without following this issue's implementation detail.`
    );
    rec.backlinks.issue = true;
    saveState(state_ref);
    log(`  backlink -> issue`);
  }
}

let state_ref;

async function mirror(issue, rec, log) {
  const block = extractBlock(issue.body);
  if (!block) {
    log(`  WARN ${issue.repo}#${issue.number}: markers gone, refusing to overwrite live discussion`);
    return;
  }
  if (block === rec.lastBlock) return;
  if (DRY) return log(`  would update discussion #${rec.discussionNumber}`);
  await updateDiscussion(rec.discussionId, issue.title, discussionBody(block, issue));
  rec.lastBlock = block;
  rec.syncedAt = new Date().toISOString();
  log(`  mirrored edit -> discussion #${rec.discussionNumber}`);
}

async function run() {
  const log = (m) => console.log(m);
  const state = loadState();
  state_ref = state;
  const label = CONFIG.feedbackLabel;

  log(`hub: ${CONFIG.hub.repo} category=${CONFIG.hub.categoryName}`);
  log(`label: ${label}${DRY ? "  (DRY RUN)" : ""}`);

  // 1. discovery - issues currently carrying the label
  const seen = new Set();
  for (const repo of CONFIG.sources) {
    log(`\nsource ${repo}`);
    let issues;
    try {
      issues = await labelledIssues(repo, label);
    } catch (e) {
      log(`  ERROR reading ${repo}: ${e.message}`);
      continue;
    }
    log(`  ${issues.length} labelled issue(s)`);
    for (const issue of issues) {
      seen.add(issue.id);
      const rec = state.synced[issue.id];
      if (!rec) {
        await publish(issue, state, log);
      } else if (rec.closed) {
        if (!DRY) {
          await reopenDiscussion(rec.discussionId);
          rec.closed = false;
        }
        log(`  relabelled -> reopened discussion #${rec.discussionNumber}`);
        await mirror(issue, rec, log);
      } else {
        await mirror(issue, rec, log);
        await ensureBacklinks(issue, rec, log);
      }
    }
  }

  // 2. reconciliation - everything we have synced, whatever its labels are now.
  //    a query for *labelled* issues can never return one whose label was removed,
  //    so closure is only detectable from our own records.
  log(`\nreconciling ${Object.keys(state.synced).length} known discussion(s)`);
  for (const [issueId, rec] of Object.entries(state.synced)) {
    if (seen.has(issueId) || rec.closed) continue;
    const res = await issueById(issueId, rec.repo.split("/")[0]);

    // Losing sight of an issue is NOT evidence the label was removed. An App
    // installation that was revoked, a repo that went private, or a transient
    // error all look like "not found". Q13: uninstalling stops writes, it does
    // not retract feedback. So we only ever close on a POSITIVE observation.
    if (!res.ok) {
      log(`  ${rec.repo}#${rec.number}: not visible (${res.reason}) - leaving discussion untouched`);
      continue;
    }

    // Label-only lifecycle (decision 11): the issue being closed is not a
    // signal. Only the label's absence closes the discussion.
    if (!res.issue.labels.includes(label)) {
      if (!DRY) {
        await closeDiscussion(rec.discussionId);
        rec.closed = true;
      }
      log(`  ${rec.repo}#${rec.number}: label gone -> closed discussion #${rec.discussionNumber}`);
    }
  }

  saveState(state);
  log(`\nstate: ${Object.keys(state.synced).length} tracked${DRY ? " (not written)" : ""}`);
}

if (import.meta.main) await run();
