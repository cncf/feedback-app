---
name: feedback-sync-architecture
description: >-
  How the CNCF feedback loop sync works and why it is shaped this way. Use when
  changing src/sync.mjs, reviewing its behaviour, onboarding to this repo, or
  proposing a design change that touches mirroring, lifecycle, state, or
  provenance.
metadata:
  context7-sources:
    - /github/docs
---

# Feedback sync architecture

A maintainer labels an issue in their project repo. A discussion appears in the
central feedback hub. End users comment there. The maintainer never leaves their
issue, and end users never wade through implementation detail.

That is the whole product. Everything below exists to make it true without
surprising anyone.

## When to Use

- Modifying `src/sync.mjs` or the sync workflow
- Reviewing a change for correctness against the decided contract
- Proposing a design change to mirroring, lifecycle, state, or provenance
- Understanding why an apparently simpler approach was rejected

## When NOT to Use

- Operating a running deployment → `operating-feedback-sync.md`
- GitHub Discussions API mechanics → `github-discussions-api.md`
- App registration, tokens, key custody → `github-app-credentials.md`

## Topology

| Component | Location | Purpose |
|---|---|---|
| Sync engine + workflow | `cncf/feedback-app` | the code, its schedule, its credentials |
| Feedback hub | `cncf-projects/<project>` | discussions end users see |
| Source repos | participating project orgs | issues maintainers label |

Code and hub are deliberately different repositories. The hub holds no code and
the code repo holds no discussions.

## The flow

```
maintainer labels an issue
        |
   scheduled poll (5 min)
        |
   create discussion in hub, announcement-format category
        |
   +-- comment on discussion  -> links to the issue
   +-- comment on the issue   -> links to the discussion   (once, never updated)
        |
   issue edited      -> mirror block + title to the discussion
   label removed     -> close discussion (OUTDATED)
   label re-added    -> reopen the SAME discussion
```

## Contract

### Content is one-way

Issue → discussion. Feedback never flows back as content. The only write into a
project repo is the backlink comment.

This preserves the original separation rationale: end-user feedback stays out of
the maintainers' implementation thread. Mirroring feedback back would recreate
the noise problem the hub exists to solve, and would drag in cross-org
attribution, deletion propagation, and Code-of-Conduct questions that a
backlink-only design simply does not have.

### The shared region is marker-delimited

Only content between `<!-- BEGIN-BLOCK -->` and `<!-- END-BLOCK -->` is
mirrored. Maintainers keep tracking notes in the same issue, outside the block.

**The markers are curation, not confidentiality.** Text outside the block stays
fully visible in the source issue, which is public. Never describe it as
private — a maintainer who believes otherwise will put something sensitive
there.

### Mirror, not snapshot

Edits to the block propagate, so one thread survives alpha → beta → GA. The
accepted cost: a late edit can leave existing replies answering text that no
longer appears. Mitigated by syncing only the designated block, so routine
edits elsewhere never churn the discussion.

Title changes mirror too. The title is copied at creation, so leaving it frozen
would advertise a stale name forever.

### Label-only lifecycle

One control, the label:

| Maintainer action | System behaviour |
|---|---|
| applies label | discussion created, both backlinks posted |
| edits block or title | discussion updated |
| removes label | discussion closed, reason `OUTDATED` |
| re-applies label | **same** discussion reopened, never a second one |

The 2024 design also carried a `FeedbackState` field inside the issue body. It
was dropped: it lived inside the parse-fragile marker region, so a malformed
marker could close or fail to close a live discussion. The label sits outside
the body, cannot be malformed, and is what maintainers already touch.

### Announcement-format category

Synced threads land in an **announcement-format** category, where only
maintainers and the App can start threads while anyone may reply. Support
questions therefore cannot appear as new threads in the feedback stream — a
structural answer rather than a moderation-labour one.

User-initiated input has a separate open category (`Ideas`).

Verified by execution: an App installation token **can** create in an
announcement-format category, despite docs phrasing the restriction in terms of
*users* with maintain/admin permissions.

Constraint to remember: **announcements cannot be transferred between
repositories.** Moving a thread later is foreclosed.

### Backlink posted once, never updated

The comment states a durable fact — this issue has a feedback discussion, here
it is — which stays true whether the discussion is open or closed. GitHub renders
live state at the link.

An app that edits its own comments on every state change generates timeline
noise in repositories the foundation does not own. That is the fastest route to
being uninstalled.

## Why there is no state file

The mapping lives in the **discussion body**:

```
<!-- cncf-feedback:issue=<node-id> repo=<owner/name> bl=di -->
```

- `issue=` — the source issue's node id
- `repo=` — its repository, needed because reconciliation happens *after* the
  label is gone, and only this tells the sync which installation token can still
  see that issue
- `bl=` — which backlinks exist: `d` discussion side, `i` issue side

The index is rebuilt from the hub on every run. A committed state file was tried
and removed: pushing it requires write access to a protected branch, so a failed
push would silently lose the ability to detect unlabelling — the close path would
never fire in production while every run looked green.

Anything that can fail to persist cannot be the source of truth.

### Why `bl=` and not a comment scan

Scanning comments for a marker breaks on busy issues: once the marker ages out
of any bounded window, the sync re-posts the backlink **every run, forever**, in
someone else's repo. The flag is O(1) and cannot age out.

Because a comment and the marker update are writes to two resources, they cannot
be atomic. Two mitigations:

1. the marker is persisted immediately after **each** comment, so the crash
   window is one write wide
2. when the marker says a backlink is missing, the sync **paginates and verifies**
   before posting — closing the window entirely, at a cost paid only when
   something is genuinely incomplete

## Two-phase sweep

Discovery alone is not enough:

1. **Discovery** — issues currently carrying the label. Finds new work.
2. **Reconciliation** — every discussion in the index, whatever its issue's
   labels are now. Finds removals.

A query for *labelled* issues can never return one whose label was just removed.
Without phase 2 the close path cannot exist. This is why the index must be
durable and enumerable.

## Provenance: nothing is trusted on appearance

The marker is public text. Anyone can paste it into a discussion they open.
Adoption therefore requires **both**:

1. the discussion is in the configured category — restricted, so only
   maintainers and the App can post there
2. it was authored by us

Backlink markers are **keyed to the specific issue or discussion** and
author-checked, so nobody can suppress a real backlink by pasting a marker.

Provenance checks **fail closed**. If identity cannot be established, the run
aborts rather than trusting everything. Normalise `[bot]` before comparing —
`viewer.login` and `author.login` spell the same App differently.

## Failure behaviour

| Situation | Behaviour | Why |
|---|---|---|
| Markers missing on a previously-synced issue | refuse to update, warn | never overwrite a live discussion people replied to with a truncated body |
| Issue not visible (revoked install, private repo, API error) | leave the discussion untouched | invisibility is not evidence of unlabelling; uninstalling stops writes, it does not retract feedback |
| A source repo cannot be read | log, continue other sources, **exit nonzero** | a missing installation must not look like a green run that synced nothing |
| Credentials absent | workflow skips cleanly with a notice | an unwired cron that fails every 5 minutes trains people to ignore red crons |

## Rate limits

- Reads are cheap. A GraphQL sweep costs ~1 point per installation against a
  ≥5,000/hour budget — well under 1% at the 5-minute floor.
- **Writes are the constrained side**: content-generating limits are 80/minute
  and 500/hour. Steady state is fine; a backfill or mass-labelling event is not.
  Seeding an existing project needs throttling.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Just keep a state file, it's simpler." | It cannot be pushed to a protected branch, and losing it silently disables the close path. |
| "Search for the backlink comment each run." | It ages out on busy issues and you re-post forever. |
| "If we can't see the issue, the label must be gone." | It usually means access was revoked. Closing on that retracts feedback users gave in good faith. |
| "The marker proves it's our discussion." | The marker is public text. Category and author must both check out. |
| "Mirror the feedback back to the issue." | That recreates the noise the hub exists to remove, plus attribution and deletion problems. |
| "Text outside the block is private." | It is public in the issue. The markers curate; they do not conceal. |

## Red Flags

- Any new source of truth for the mapping outside the discussion body
- A close path that can fire without a positive observation of a missing label
- Comment scanning with a fixed window used for idempotency
- A provenance check that passes when identity is unknown
- Writes into source repos beyond the single backlink comment
- "Private" or "hidden" used to describe marker-excluded text

## Verification

- [ ] Runs twice in a row produce no second discussion and no second backlink
- [ ] State deleted entirely → index rebuilds, adopts, posts nothing
- [ ] Unlabel closes, relabel reopens the same discussion
- [ ] Block edit and title edit both mirror
- [ ] Markers removed → refuses to overwrite, warns
- [ ] Marker planted in an open category → ignored, logged
- [ ] Unreadable source → nonzero exit
- [ ] Missing credentials → clean skip, not failure
- [ ] Discussion and its comments authored by the App, not a human
