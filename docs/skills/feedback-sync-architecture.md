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
   create discussion in hub, routed by group label to its category
        |
   +-- comment on discussion  -> links to the issue
   +-- comment on the issue   -> links to the discussion   (once, never updated)
        |
   issue edited      -> mirror block + title to the discussion
   labels changed    -> mirror prefixed labels, stripped, to the discussion
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

### Labels mirror, prefix-stripped

`labelPrefixes` in `config.json` selects which source labels cross over. The
prefix is maintainer vocabulary and is dropped on the way: `area/api` becomes
`api`.

Unprefixed labels never mirror. `lgtm`, `needs-rebase`, `do-not-merge/hold` and
the feedback label itself are process signals, and publishing them on the
end-user surface is the implementation noise the hub exists to keep out. An
empty `labelPrefixes` disables the path entirely, including its label queries.

**The hub label must already exist in the hub repo.** Labels are per-repo and
`addLabelsToLabelable` takes ids, not names — there is no create-if-missing.
A missing one is reported once per run and skipped. The sync does not call
`createLabel`: label creation is a repository-shaped write, and the hub App
holds `discussions: write` precisely so it cannot reshape the repo.

Removal converges too, but only within the **vocabulary**: every hub name that
source repo's labels could produce. Once the prefix is stripped, a label the
sync applied and one a moderator applied by hand are indistinguishable on the
discussion, so the vocabulary is the only thing that separates them. A
hand-added `pinned` survives; a mirrored `api` whose `area/api` is gone does not.

Labels move in the discovery phase only. Reconciliation closes a discussion
whose label is gone; it does not strip the mirrored labels off it, because the
closed thread should still say what it was about.

Verified by execution that `discussions: write` alone carries both
`addLabelsToLabelable` and `removeLabelsFromLabelable` — see
`github-discussions-api.md`. No `issues` permission is involved, even though
labels are a shared repository resource.

### Category routing by group label

A project may declare `routes`: an ordered list of `{label, categoryName,
categoryId}`. An issue whose labels include `label` lands in that category;
no match falls back to the project's default `hub.categoryId`; no `routes` at
all is exactly the old single-category behaviour. This is the
kubernetes/enhancements shape — one source repo, one `feedback` label, per-SIG
categories so end users hone in on their group.

**Config order is the priority.** Multi-group issues are the norm there, not
the edge (`sig/network` + `sig/node` on one KEP), and the owning group is not
derivable from labels — kubernetes keeps it in `kep.yaml`. First matching route
wins and the run says so: `(matches sig/network + sig/node; config order wins)`.

**Routing follows the label.** Swap the group label and the *same* discussion
moves category via `updateDiscussion(categoryId)` — verified by execution;
thread and comments survive. Announcements cannot move between *repositories*,
but category-within-repo is fine.

The index trusts markers in **any configured category** (default plus routes),
and only those. Each routed category should be announcement-format, and that
cannot be read from the API — verify each one in the UI.

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

1. the discussion is in a configured category (default or route) — restricted,
   so only maintainers and the App can post there
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
| "Mirror all the issue's labels." | Triage vocabulary is for maintainers. End users get the prefixed subset, stripped. |
| "Create the label in the hub if it's missing." | That is a repo-shaped write the hub App deliberately cannot make. Report it and skip. |

## Red Flags

- Any new source of truth for the mapping outside the discussion body
- A close path that can fire without a positive observation of a missing label
- Comment scanning with a fixed window used for idempotency
- A provenance check that passes when identity is unknown
- Writes into source repos beyond the single backlink comment
- Label writes on a discussion outside the mirrored vocabulary
- "Private" or "hidden" used to describe marker-excluded text

## Verification

- [ ] Runs twice in a row produce no second discussion and no second backlink
- [ ] State deleted entirely → index rebuilds, adopts, posts nothing
- [ ] Unlabel closes, relabel reopens the same discussion
- [ ] Block edit and title edit both mirror
- [ ] Group label swapped → same discussion moves to the routed category
- [ ] Prefixed label added and removed on the issue → mirrored and retracted
- [ ] A label applied by hand in the hub survives a source-side removal
- [ ] Marker in an unconfigured category → ignored, logged
- [ ] Markers removed → refuses to overwrite, warns
- [ ] Marker planted in an open category → ignored, logged
- [ ] Unreadable source → nonzero exit
- [ ] Missing credentials → clean skip, not failure
- [ ] Discussion and its comments authored by the App, not a human
