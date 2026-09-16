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

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error("GH_TOKEN or GITHUB_TOKEN required");

const ROOT = join(import.meta.dir, "..");
const CONFIG = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const STATE_PATH = join(ROOT, CONFIG.statePath);
const DRY = process.argv.includes("--dry-run");

const BEGIN = "<!-- BEGIN-BLOCK -->";
const END = "<!-- END-BLOCK -->";

// ---------------------------------------------------------------- api

async function gql(query, variables = {}) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      "user-agent": "cncf-feedback-sync",
    },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors.map((e) => e.message).join("; "));
  return j.data;
}

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

function discussionBody(block, issue) {
  return `${block}

---
*Mirrored from [${issue.repo}#${issue.number}](${issue.url}). Edits to the source issue appear here. Last synced ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.*`;
}

// ---------------------------------------------------------------- queries

async function labelledIssues(repo, label) {
  const [owner, name] = repo.split("/");
  const d = await gql(
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

async function issueById(id) {
  const d = await gql(
    `query($id:ID!){ node(id:$id){ ... on Issue {
      id number title body url state
      repository{ nameWithOwner }
      labels(first:50){ nodes{ name } }
    }}}`,
    { id }
  );
  const n = d.node;
  if (!n) return null;
  return {
    ...n,
    repo: n.repository.nameWithOwner,
    labels: n.labels.nodes.map((l) => l.name),
  };
}

// ---------------------------------------------------------------- mutations

async function createDiscussion(title, body) {
  const d = await gql(
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
  gql(
    `mutation($id:ID!,$t:String!,$b:String!){ updateDiscussion(input:{discussionId:$id,title:$t,body:$b}){ discussion{ id } } }`,
    { id, t: title, b: body }
  );

const closeDiscussion = (id) =>
  gql(
    `mutation($id:ID!){ closeDiscussion(input:{discussionId:$id,reason:OUTDATED}){ discussion{ closed } } }`,
    { id }
  );

const reopenDiscussion = (id) =>
  gql(`mutation($id:ID!){ reopenDiscussion(input:{discussionId:$id}){ discussion{ closed } } }`, { id });

const commentOnDiscussion = (id, body) =>
  gql(
    `mutation($id:ID!,$b:String!){ addDiscussionComment(input:{discussionId:$id,body:$b}){ comment{ id } } }`,
    { id, b: body }
  );

const commentOnIssue = (id, body) =>
  gql(`mutation($id:ID!,$b:String!){ addComment(input:{subjectId:$id,body:$b}){ clientMutationId } }`, {
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

  if (DRY) {
    log(`  would create discussion: "${title}"`);
    return;
  }

  const disc = await createDiscussion(title, body);
  log(`  created discussion #${disc.number} -> ${disc.url}`);

  await commentOnDiscussion(
    disc.id,
    `Tracking issue: [${issue.repo}#${issue.number}](${issue.url})\n\nThis thread is for **end-user feedback**. Implementation discussion belongs on the issue.`
  );
  await commentOnIssue(
    issue.id,
    `Feedback discussion opened: ${disc.url}\n\nEnd users can comment there without following this issue's implementation detail.`
  );
  log(`  backlinks posted both ways`);

  state.synced[issue.id] = {
    repo: issue.repo,
    number: issue.number,
    issueUrl: issue.url,
    discussionId: disc.id,
    discussionNumber: disc.number,
    discussionUrl: disc.url,
    closed: false,
    lastBlock: block,
    syncedAt: new Date().toISOString(),
  };
}

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
      }
    }
  }

  // 2. reconciliation - everything we have synced, whatever its labels are now.
  //    a query for *labelled* issues can never return one whose label was removed,
  //    so closure is only detectable from our own records.
  log(`\nreconciling ${Object.keys(state.synced).length} known discussion(s)`);
  for (const [issueId, rec] of Object.entries(state.synced)) {
    if (seen.has(issueId) || rec.closed) continue;
    const issue = await issueById(issueId);
    const gone = !issue || issue.state === "CLOSED" || !issue.labels.includes(label);
    if (gone) {
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
