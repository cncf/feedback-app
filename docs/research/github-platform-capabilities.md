# GitHub platform capabilities vs. the 2024 proposal

Research date: **2026-09-16**. Scope: does GitHub in 2026 still require the Issue→Discussion sync App that the 2024 proposal designed, or has the platform absorbed it?

Verification note (read this before trusting a "yes"): this document was **researched** in a read-only, no-shell environment, then its execution half was **completed in the parent session** on the same day against the real repo. Doc-grounded claims cite official GitHub sources — the schema-generated GraphQL reference, the REST/OpenAPI-generated app-permission reference, docs.github.com articles, and the github.blog changelog. Claims marked *executed* below were run live with `gh api` against `cncf/feedback-app` (the repo was renamed and transferred from `castrojo/cncf-feedback` to the `cncf` org after the research ran). One residual gap remains — the App-token permission mapping — and it is tracked, not hand-waved. Anything not traceable to a primary source or an executed call is marked **unverified**.

---

## What has changed since the 2024 proposal

Only genuine deltas are listed. Everything else in the proposal's platform assumptions still holds.

1. **The `Discussion` type now implements `Closable`, `Labelable` and `Votable`.** The 2024 proposal cited only `LabelConnection` (a read field) and the `labeled` webhook event as evidence that labels on discussions exist. The schema-generated reference now lists `Discussion` as `implements Closable, Comment, Deletable, Labelable, Lockable, Node, Reactable, RepositoryNode, Subscribable, Updatable, Votable`, and `Labelable`'s "Implemented by" list is `Discussion, Issue, PullRequest`. That makes `addLabelsToLabelable` / `removeLabelsFromLabelable` / `clearLabelsFromLabelable` valid on a discussion node ID — a **write** path, not just a read field.
   Sources: <https://docs.github.com/en/graphql/reference/discussions>, <https://docs.github.com/en/graphql/reference/issues>
2. **`closeDiscussion` / `reopenDiscussion` exist, with a `DiscussionCloseReason` enum (`DUPLICATE`, `OUTDATED`, `RESOLVED`).** The proposal's "Closing a Feedback Discussion" step assumed the bot would close a discussion; there is now a first-class mutation and a state reason (`DiscussionStateReason`: `DUPLICATE`, `OUTDATED`, `REOPENED`, `RESOLVED`). Source: <https://docs.github.com/en/graphql/reference/discussions>
3. **Organization-level discussions now exist.** GitHub Discussions is no longer repository-only: "You can use **repository** discussions to discuss topics that are specific to one repository and **organization** discussions for broader conversations that span multiple repositories." Organization discussions are backed by a designated *source repository*, and org owners control who may create them. This partially overlaps the proposal's "one repo per project in a dedicated org" structure — but only *within* a single org, not across the 175+ project orgs.
   Sources: <https://docs.github.com/en/discussions/collaborating-with-your-community-using-discussions/about-discussions>, <https://docs.github.com/en/discussions/managing-discussions-for-your-community/managing-discussions>, <https://docs.github.com/en/organizations/managing-organization-settings/managing-discussion-creation-for-repositories-in-your-organization>
4. **The native "bulk convert issues to discussions based on labels" feature was deprecated and removed (2025).** This is the single most important delta, because it is the closest native analogue to the proposal's core trigger ("maintainer applies `feedback: yes` label → issue becomes a discussion"). GitHub added a deprecation notice to `managing-discussions.md` on **2025-05-23** (github/docs PR #55754), removed the expired content on **2025-06-10** (PR #55979), and removed the last reference on **2025-08-27** (PR #40050). The current docs describe only a **per-issue, UI-only** "Convert to discussion" action.
   Sources: <https://github.com/github/docs/commit/ae09b4e8e9a316791053aecbcd6df119d3c8e7cb>, <https://github.com/github/docs/commit/2dfe8c94d8b0f9f30cafd47dc2f916b5ae9b6513>, <https://github.com/github/docs/commit/722c7c2146c8b384c915f17b7cc86af4066f0140>, <https://docs.github.com/en/discussions/managing-discussions-for-your-community/moderating-discussions>
5. **"Post as Admin" shipped (2025-12-11).** Repository administrators can post and comment in Discussions behind an "Admin" badge, explicitly to remove "the need for separate admin accounts — a common workaround that introduces security risks". Relevant to the proposal's bot-posting identity model, though it is an *admin human* affordance, not an App affordance. Source: <https://github.blog/changelog/2025-12-11-post-as-admin-now-available-in-github-discussions/>
6. **"Verified answers" went GA in Discussions (2025-09-11).** Source: <https://github.blog/changelog/2025-09-11-verified-answers-generally-available-in-github-discussions>
7. **The Issues side of the proposal gained a lot of native structure that did not exist in 2024:** org-level **issue types** (`createIssueType`, `updateIssueIssueType`, `IssueType`), **sub-issues** (`addSubIssue`, `removeSubIssue`, `reprioritizeSubIssue`, `subIssuesSummary`), **issue dependencies** (`addBlockedBy`, `removeBlockedBy`, `blockedBy`/`blocking` connections, `issueDependenciesSummary`), and **issue fields** (`issueFieldValues`, `setIssueFieldValue`). `transferIssue` also gained `createLabelsIfMissing`. None of these are available on `Discussion`. Source: <https://docs.github.com/en/graphql/reference/issues>
8. **Agentic "pending suggestion" plumbing was added to the label/type mutations.** `AddLabelsToLabelableInput` now accepts `labels: [LabelUpdateInput!]` with an optional `rationale` and a `suggest` flag that "stores the addition as a pending suggestion" for human review; `IssueTypeUpdateInput` has the same shape plus a `confidence` level. `IssueEventRationale` is deprecated in favour of `intent` (`IssueUpdateIntent`). A sync bot can now propose rather than apply. Source: <https://docs.github.com/en/graphql/reference/issues>
9. **Discussions webhooks are still labelled "public preview and subject to change"** — unchanged status, but worth restating as a risk for a load-bearing integration. Source: <https://docs.github.com/en/webhooks/webhook-events-and-payloads>

**What has *not* changed, and is the answer to the headline question:** there is still **no REST API for repository discussions**, still **no cross-org discussion transfer**, still **no cross-repo/org discussion aggregation surface**, and still **no API for converting an issue to a discussion**. The App the proposal designed is still required. GitHub has absorbed none of the cross-org glue; if anything it removed the one native label-triggered conversion path (delta 4).

---

## Capability table

| Capability | Available? | API surface | Permission required | Source |
|---|---|---|---|---|
| Create a discussion | Yes | GraphQL `createDiscussion(input: CreateDiscussionInput!)` — required `repositoryId: ID!`, `categoryId: ID!`, `title: String!`, `body: String!`; returns `discussion` | App repo permission `discussions: write` | [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions), [rest/apps/apps](https://docs.github.com/en/rest/apps/apps) |
| Create a discussion **via REST** | **No** | None. `discussions` appears nowhere in the REST "Permissions required for GitHub Apps" endpoint mapping, and the Discussions docs point exclusively at GraphQL | n/a | [permissions-required-for-github-apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps), [graphql/guides/using-the-graphql-api-for-discussions](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions) |
| Edit a discussion (title/body) | Yes | GraphQL `updateDiscussion` (`discussionId`, `title`, `body`) | `discussions: write` | [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions) |
| Re-categorize a discussion | Yes, same-repo only | GraphQL `updateDiscussion(categoryId:)` — "a discussion category **within the same repository**" | `discussions: write` | [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions) |
| Close a discussion (with reason) | Yes | GraphQL `closeDiscussion(discussionId, reason: DiscussionCloseReason)` | `discussions: write` | [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions) |
| Reopen a discussion | Yes | GraphQL `reopenDiscussion(discussionId)` | `discussions: write` | [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions) |
| Delete a discussion | Yes | GraphQL `deleteDiscussion(id)` | `discussions: write` | [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions) |
| **Add labels to a discussion** | **Yes** (executed) | GraphQL `addLabelsToLabelable(labelableId, labelIds \| labels)` — `Discussion` implements `Labelable`; `Labelable` is implemented by `Discussion, Issue, PullRequest`. Executed successfully with a **user-scoped `gh` credential** 2026-09-16 | App permission **unverified pending [#14](https://github.com/cncf/feedback-app/issues/14)** — the `discussions` permission is documented as covering "discussions and related comments **and labels**", but GitHub publishes no GraphQL permission map, and no App-token execution has been run. Do not treat `discussions: write` as sufficient until #14 resolves | [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions), [graphql/reference/issues](https://docs.github.com/en/graphql/reference/issues), [rest/apps/apps](https://docs.github.com/en/rest/apps/apps) |
| Remove / clear labels on a discussion | Yes (schema) | GraphQL `removeLabelsFromLabelable`, `clearLabelsFromLabelable` — same `Labelable` interface as row 41 | App permission **unverified pending [#14](https://github.com/cncf/feedback-app/issues/14)** — identical shared-label authorization question to row 41, and **not** covered by the executed add-label proof. Sync drift correction depends on remove/clear, so #14 must exercise add, remove, and clear, not just add | [graphql/reference/issues](https://docs.github.com/en/graphql/reference/issues) |
| Label set is shared with issues/PRs | Yes | n/a — "Each repository has one shared set of labels for issues, pull requests, and discussions" | n/a | [managing-discussions](https://docs.github.com/en/discussions/managing-discussions-for-your-community/managing-discussions) |
| Lock / unlock a discussion | Yes | GraphQL `lockLockable(lockableId, lockReason)` / `unlockLockable(lockableId)` — `Lockable` is implemented by `Discussion, Issue, PullRequest` | `discussions: write` (**unverified**: no doc maps `lockLockable` to a specific App permission; see "Permission mapping" below) | [graphql/reference/issues](https://docs.github.com/en/graphql/reference/issues), [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions) |
| Comment on a discussion / threaded reply | Yes | GraphQL `addDiscussionComment(discussionId, body, replyToId)` | `discussions: write` | [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions) |
| Edit / delete a discussion comment | Yes | GraphQL `updateDiscussionComment`, `deleteDiscussionComment` | `discussions: write` | [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions) |
| Mark / unmark an answer | Yes | GraphQL `markDiscussionCommentAsAnswer`, `unmarkDiscussionCommentAsAnswer` (category must have `isAnswerable: true`) | `discussions: write` | [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions) |
| **Transfer a discussion** | **No API** | UI only. Constraints: "You can only transfer discussions between repositories owned by the **same user or organization account**" and not private→public. No `transferDiscussion` mutation exists in the Discussions schema category | n/a | [managing-discussions](https://docs.github.com/en/discussions/managing-discussions-for-your-community/managing-discussions), [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions) |
| **Convert an issue to a discussion** | **No API** | UI only ("In the right margin of an issue, click **Convert to discussion**"). GraphQL exposes only the read-side `ConvertedToDiscussionEvent` timeline item — there is no `convertIssueToDiscussion` mutation | n/a | [moderating-discussions](https://docs.github.com/en/discussions/managing-discussions-for-your-community/moderating-discussions), [graphql/reference/issues](https://docs.github.com/en/graphql/reference/issues) |
| Bulk convert issues → discussions by label | **Removed** | Deprecated 2025-05-23, content removed 2025-06-10 / 2025-08-27 | n/a | [github/docs #55754](https://github.com/github/docs/commit/ae09b4e8e9a316791053aecbcd6df119d3c8e7cb), [#55979](https://github.com/github/docs/commit/2dfe8c94d8b0f9f30cafd47dc2f916b5ae9b6513), [#40050](https://github.com/github/docs/commit/722c7c2146c8b384c915f17b7cc86af4066f0140) |
| Pin / unpin a discussion | Yes (UI documented; `PinnedDiscussion` object in schema) | **unverified** whether a `pinDiscussion` mutation exists — not present in the Discussions reference category; `pinned`/`unpinned` webhook actions do fire | n/a | [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions), [webhook-events-and-payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads) |
| Upvotes (read + write) | Yes | Read: `Discussion.upvoteCount`, `viewerHasUpvoted`, `viewerCanUpvote` (`Votable` interface). Write: `addUpvote` / `removeUpvote` (`subjectId` = discussion or comment) | `discussions: write` for the mutations; note these act **as the App**, which is a poor fit for a metrics product — see Policy constraints §4 | [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions) |
| Reactions (read) | Yes | `Discussion.reactions`, `reactionGroups`; `Discussion` implements `Reactable` | `discussions: read` | [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions) |
| Discussion polls | Yes (read + vote) | `Discussion.poll` → `DiscussionPoll` / `DiscussionPollOption` with `totalVoteCount`; `addDiscussionPollVote(pollOptionId)`. **No mutation to create a poll** — polls are UI-created | `discussions: write` to vote | [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions) |
| Query discussions in a repo | Yes | `Repository.discussions(first, after, categoryId, answered, orderBy)`, `Repository.discussion(number)`, `Repository.discussionCategories` (max **25 categories per repository**), `Repository.pinnedDiscussions` | `discussions: read` | [graphql/guides/using-the-graphql-api-for-discussions](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions) |
| **Cross-repo / org-wide discussion aggregation** | **No** | No org-level or global discussion connection exists. The only cross-repo surfaces are `Organization.repositoryDiscussions` / `User.repositoryDiscussions` (`RepositoryDiscussionAuthor` interface) — i.e. *discussions an actor authored*, optionally filtered by `repositoryId`. That is an author-centric index, not a project-centric one. A dashboard must fan out per repository | `discussions: read` | [graphql/reference/discussions](https://docs.github.com/en/graphql/reference/discussions) |
| Organization discussions | Yes (product feature) | Backed by a designated source repository; org owners control creation permissions. **unverified** whether the GraphQL API exposes org discussions distinctly from the source repository's discussions | n/a | [about-discussions](https://docs.github.com/en/discussions/collaborating-with-your-community-using-discussions/about-discussions), [managing-discussion-creation…](https://docs.github.com/en/organizations/managing-organization-settings/managing-discussion-creation-for-repositories-in-your-organization) |
| Issue side: org issue types | Yes | `createIssueType`, `updateIssueType`, `deleteIssueType`, `updateIssueIssueType`, `Issue.issueType` | `issues: write` (**unverified** for GraphQL) | [graphql/reference/issues](https://docs.github.com/en/graphql/reference/issues) |
| Issue side: sub-issues | Yes | `addSubIssue`, `removeSubIssue`, `reprioritizeSubIssue`, `Issue.subIssues`, `subIssuesSummary` | `issues: write` (**unverified** for GraphQL) | [graphql/reference/issues](https://docs.github.com/en/graphql/reference/issues) |
| Issue side: dependencies / blocking | Yes | `addBlockedBy`, `removeBlockedBy`, `Issue.blockedBy`, `Issue.blocking`, `issueDependenciesSummary` | `issues: write` (**unverified** for GraphQL) | [graphql/reference/issues](https://docs.github.com/en/graphql/reference/issues) |
| Issue transfer across orgs | **No** | `transferIssue` transfers "to a different repository" and gained `createLabelsIfMissing`. GitHub's documented transfer rules do not permit cross-account transfer; the discussion equivalent is explicitly same-owner-only | n/a | [graphql/reference/issues](https://docs.github.com/en/graphql/reference/issues), [managing-discussions](https://docs.github.com/en/discussions/managing-discussions-for-your-community/managing-discussions) |

### Webhook events (item 4 of the brief)

Both events are **available to `repository`, `organization`, and `app` webhooks**, and both require **at least read-level access for the "Discussions" repository permission**. Both are still flagged: "Webhook events for GitHub Discussions are currently in public preview and subject to change."

| Event | Actions |
|---|---|
| `discussion` | `answered`, `category_changed`, `closed`, `created`, `deleted`, `edited`, `labeled`, `locked`, `pinned`, `reopened`, `transferred`, `unanswered`, `unlabeled`, `unlocked`, `unpinned` |
| `discussion_comment` | `created`, `deleted`, `edited` |

Source: <https://docs.github.com/en/webhooks/webhook-events-and-payloads>

Design note: the `labeled` / `unlabeled` / `category_changed` / `transferred` actions give the sync app everything it needs to detect drift on the discussion side. The proposal's trigger on the *issue* side uses the `issues` event with action `labeled`, which requires `issues: read`.

#### Executed probe: do Actions triggers match the webhook action list?

The webhook page above lists **15** `discussion` actions. The Actions page
[`events-that-trigger-workflows`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
lists **13** for `on: discussion`, omitting `closed` and `reopened`. Webhook
delivery and Actions triggering are separate surfaces, so a documented subset
would have been legitimate and the page count alone could not settle it.

Settled by execution on `cncf/feedback-app`, 2026-09-16. Probe workflow
`.github/workflows/probe-discussion-triggers.yml` registered on
`types: [created, closed, reopened, labeled]` in commit
[`bdb530d`](https://github.com/cncf/feedback-app/commit/bdb530d); each transition
was then driven via GraphQL and `github.event.action` read from the run log.

| Transition driven | Run | Conclusion | `github.event.action` |
|---|---|---|---|
| `createDiscussion` | [35130741076](https://github.com/cncf/feedback-app/actions/runs/35130741076) | success | `created` |
| `addLabelsToLabelable` | [35130753888](https://github.com/cncf/feedback-app/actions/runs/35130753888) | success | `labeled` |
| `closeDiscussion` | [35130771057](https://github.com/cncf/feedback-app/actions/runs/35130771057) | success | **`closed`** |
| `reopenDiscussion` | [35130867499](https://github.com/cncf/feedback-app/actions/runs/35130867499) | success | **`reopened`** |

**Conclusion: the hand-maintained Actions table does not reflect current
behaviour.** `on: discussion` triggers on `closed` and `reopened` today, so the
13-type list is not a narrower supported subset. The webhooks page carries
`autogenerated: webhooks` in its frontmatter and tracks the schema; the Actions
page is hand-maintained. This is a `github/docs` bug and has not been reported
upstream.

Not established: **when or why** the divergence arose. The probe demonstrates
present-day disagreement between the page and the platform, nothing about its
history. Any claim that the page was missed during a particular feature rollout
would need `github/docs` commit history to support it, which was not examined.

Scope of the claim: this proves Actions *trigger* support for those two types on
a public repo at that date. It does not test `deleted`, `transferred`, or the
remaining documented types, which were not in doubt.

Cleanup: probe workflow removed via PR
[#16](https://github.com/cncf/feedback-app/pull/16); probe discussion deleted;
repository `discussions.totalCount` back to `0`; no workflows remain in the repo.

Design consequence: an event-triggered Actions carrier has **no known
activity-type gap** on the discussion side. Carrier choice therefore turns on
private-key custody and latency, not on missing events — see
`docs/skills/github-discussions-api.md`.

### Permission mapping caveat

GitHub does **not** publish a permission map for GraphQL. The official guidance is: "For GraphQL requests, you should test your app to ensure that it has the required permissions for the GraphQL queries and mutations that you want to make. If your app makes a GraphQL API query or mutation with insufficient permissions, the API will return a `401` response."
Source: <https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app#choosing-permissions-for-graphql-api-access>

The strongest primary anchor for the Discussions permission is the REST/OpenAPI-generated app schema, which defines the repository permission `discussions` with enum `read | write` and the description: *"The level of permission to grant the access token for discussions and related comments **and labels**."*
Source: <https://docs.github.com/en/rest/apps/apps>

That sentence is the documentation that makes the proposal's label-on-discussion dependency safe. Everything narrower (which *specific* mutation needs which level) is **unverified from docs** and must be confirmed by execution against a real installation.

### Documentation hazard

The hand-written guide "Using the GraphQL API for Discussions" is **stale**: it still prints `type Discussion implements Comment & Deletable & Lockable & Node & Reactable & RepositoryNode & Subscribable & Updatable` — omitting `Closable`, `Labelable` and `Votable`, and it documents no close/label mutations. The schema-generated reference at `/graphql/reference/discussions` is authoritative; the guide is not. Anyone re-deriving this design from the guide will wrongly conclude labels are read-only.
Stale page: <https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions> · Authoritative: <https://docs.github.com/en/graphql/reference/discussions>

---

## Rate limits for a sync app across 175+ repos

All figures from <https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api> (GraphQL is the only surface for Discussions, so these are the limits that matter).

**Primary (points/hour):**
- GitHub App installation **not** on an Enterprise Cloud org: **5,000 points/hour per installation**, **+50 points/hour per repository above 20**, **+50 points/hour per user above 20**, hard-capped at **12,500 points/hour**.
- GitHub App installation **on** an Enterprise Cloud org: **10,000 points/hour per installation**.
- User tokens: 5,000/hour (10,000 if the App is owned by an Enterprise Cloud org).

The critical structural fact: the limit is **per installation**, and the proposal installs the App into each project's own org. 175+ projects means 175+ separate installations, each with its own 5,000–12,500 point budget. Primary rate limiting is therefore *not* the binding constraint on the read/sync side — the central feedback org is a single installation and is the one to watch, and it is the one that would benefit from being under an Enterprise Cloud org (10,000 vs 5,000 base).

**Secondary limits — these are the ones that bite:**
- **No more than 100 concurrent requests**, shared across REST and GraphQL.
- **No more than 2,000 points/minute to the GraphQL endpoint** (secondary-limit points are a different scale: a GraphQL request **with mutations costs 5**, without mutations costs 1). 2,000 ÷ 5 = **400 mutations/minute** ceiling from this rule alone.
- **Content creation: no more than 80 content-generating requests per minute and no more than 500 per hour.** This counts web-UI actions *and* REST *and* GraphQL together. **This is the hard ceiling on the design**: creating a discussion, posting the back-link comment on the discussion, and posting the back-link comment on the source issue is *three* content-generating requests per synced issue. At 500/hour that is **~166 issue syncs per hour per account**, and the back-pressure is on the identity doing the writing, not on the repository.
- No more than 90 seconds of CPU time per 60 seconds real time (≤60s of it GraphQL).
- GitHub's own guidance: "pause at least 1 second between mutative requests and avoid concurrent requests", and "Continuing to make requests while you are rate limited may result in the banning of your integration."

**Other limits:** connection arguments `first`/`last` must be 1–100; a single call may not request more than 500,000 nodes; requests taking >10s are terminated with 502/504. A 175-repo dashboard crawl must be paginated and chunked, not issued as one deep query.

---

## Policy constraints

What a GitHub App may and may not do across 175+ third-party orgs. Every quote is from the governing document.

**1. Installation is not unilateral — each org must opt in.**
"Organization owners can install GitHub Apps on their organization." Repository admins may install an app in the owning org only "if the app does not request any organization permissions nor the 'repository administration' permission", and "Organization owners can restrict GitHub App installation by repository admins." Members who cannot install may only *request* installation, and "The 'app manager' role does not give a person the ability to install a GitHub App on the organization."
→ Consequence for the proposal: the "project GitHub admins must first authorize the Sync App" step is a hard, per-org, human gate repeated 175+ times. It cannot be centrally provisioned by the CNCF.
Source: <https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party#requirements-to-install-a-github-app>

**2. Scope of the grant is chosen by the installing org, not by the app.**
"When you install an app that requests repository permissions, you will also choose which repositories to grant the GitHub App access to" and "The app will always have at least read-only access to all public repositories on GitHub."
→ The proposal's per-project `sources:` allow-list in the config file is therefore a *second* layer on top of, not a substitute for, the installation scope chosen by each org.
Source: same as above.

**3. API Terms (ToS Section H, effective 2026-04-27).**
"Abuse or excessively frequent requests to GitHub via the API may result in the temporary or permanent suspension of your Account's access to the API. GitHub, in our sole discretion, will determine abuse or excessive usage of the API." Also: "You may not share API tokens to exceed GitHub's rate limitations" and "You may not use the API to download data or Content from GitHub for spamming purposes, including for the purposes of selling GitHub users' personal information."
→ The dashboard's affiliation/member-tier enrichment is a *use-of-information* question, not just an API question. Read item 4 with it.
Source: <https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#h-api-terms>

**4. Acceptable Use Policies — automated bulk activity and information usage.**
Prohibited: "automated excessive bulk activity and coordinated inauthentic activity", "inauthentic interactions, such as fake accounts and automated inauthentic activity", "rank abuse, such as automated starring or following", and "using our servers for any form of excessive automated bulk activity, to place undue burden on our servers through automated means".
→ Two concrete design constraints: (a) an automated cross-posting fan-out across 175+ orgs must be rate-shaped and genuinely maintainer-initiated, not generated; (b) **the App must never cast upvotes on a user's behalf** — `addUpvote` exists, but automated upvoting is squarely "rank abuse", and upvote counts are the proposal's headline engagement metric, so they must be organic or the metric is both worthless and a policy violation.
On the dashboard: "You may use information from our Service for the following reasons… Researchers may use public, non-personal information from the Service for research purposes, only if any publications resulting from that research are open access." and "Your use of information from the Service must comply with the GitHub Privacy Statement" and "If you collect any personal information from the Service, you agree that you will only use that personal information for the purpose for which that User has authorized it."
→ The proposal's "filter feedback by commenter affiliation and CNCF member tier, for OSS PMs to find their customers" is a personal-information processing purpose. The purpose-limitation sentence above is the governing text and should be designed against explicitly (disclosure at point of participation, in the feedback org's README / pinned rules).
Source: <https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies> (§4 Spam and Inauthentic Activity, §7 Information Usage Restrictions, §8 Privacy)

**5. Bot / machine-account rules.**
"You must be a human to create an Account. Accounts registered by 'bots' or other automated methods are not permitted. We do permit machine accounts: A machine account is an Account set up by an individual human who accepts the Terms on behalf of the Account… and is responsible for its actions… You may maintain no more than one free machine account in addition to your free Personal Account."
→ If the design ever reaches for a PAT-driven machine account instead of a GitHub App (e.g. to get a friendlier posting identity), that account must be owned and accepted by a named human — and only one free one per person. A GitHub App is the correct vehicle; the 2025 "Post as Admin" feature exists precisely to kill the separate-admin-account workaround.
Source: <https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#3-account-requirements>

**6. Advertising / vendor participation.**
"the primary focus of the Content posted in or through your Account to the Service should not be advertising or promotional marketing" and "You may not advertise in other Users' Accounts, such as by posting monetized or excessive bulk content in issues."
→ The proposal's "Encouraging Vendor Engagement" section — inviting vendors to reply with instructions for enabling a feature in their commercial product — sits close to this line. The proposal's own PoC guideline ("it should -NEVER- be used for a marketing outlet") is the right mitigation and is aligned with the governing text; it should be a moderation rule with teeth, not a norm.
Source: <https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies> (§10 Advertising on GitHub)

**7. Marketplace listing rules.** The proposal does not require a Marketplace listing — an App can be installed directly from the owner ("This article describes how to install a GitHub App directly from the app owner instead of from GitHub Marketplace"). A direct-install, CNCF-owned App avoids Marketplace listing requirements entirely. Marketplace-specific listing criteria were **not** reviewed for this document and remain **unverified**.
Source: <https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party>

**8. Beta Preview terms apply to the Discussions webhooks.** Since the `discussion` and `discussion_comment` webhook events are in public preview, ToS Section K applies: "Beta Previews may not be supported and may be changed at any time without notice… By using a Beta Preview, you use it at your own risk."
Sources: <https://docs.github.com/en/webhooks/webhook-events-and-payloads>, <https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#k-beta-previews>

---

## Lifecycle signal on GitHub Discussions itself

No deprecation or sunset notice for GitHub Discussions was found. Evidence of continued active investment, not wind-down:

- 2025-09-11 — Verified answers GA: <https://github.blog/changelog/2025-09-11-verified-answers-generally-available-in-github-discussions>
- 2025-12-11 — Post as Admin: <https://github.blog/changelog/2025-12-11-post-as-admin-now-available-in-github-discussions/>
- Organization discussions are documented as a current product surface: <https://docs.github.com/en/discussions/collaborating-with-your-community-using-discussions/about-discussions>
- The github/docs Discussions docset is still actively maintained (most recent touch reviewed: 2026-09-03, github/docs PR #63003).

Two caveats, both real:
- The **webhook** events remain in public preview — the *automation* surface is less committed than the product surface.
- One adjacent Discussions capability was actively **retired** in 2025 (label-based bulk issue→discussion conversion). GitHub is willing to remove Discussions automation features.

**unverified:** an exhaustive sweep of every changelog entry tagged for Discussions was not possible — web search was unavailable during this research, so the changelog was traversed by year/label archive pages only (2025 `community-engagement` and `collaboration-tools`, 2026 index). Additional Discussions entries may exist under other tags.

---

## Execution proof: what was run

The research agent had no shell, so the parent session ran the execution half on **2026-09-16** against `cncf/feedback-app` (same repo as `castrojo/cncf-feedback`, since transferred to the `cncf` org and renamed). Discussions were enabled on it first — the research-time observation `"has_discussions": false` is therefore obsolete, not a standing blocker.

**Executed — live schema introspection:**

- `{ __type(name:"Labelable"){ possibleTypes{ name } } }` → `Discussion`, `Issue`, `PullRequest`. Confirms a discussion node id is a valid `labelableId`.
- `{ __type(name:"Discussion"){ interfaces{ name } } }` → `Closable Comment Deletable Labelable Lockable Node Reactable RepositoryNode Subscribable Updatable Votable`. Confirms the schema-generated reference and refutes the stale hand-written guide.
- `{ __type(name:"Mutation"){ fields{ name } } }` filtered to discussions → `addDiscussionComment addDiscussionPollVote closeDiscussion createDiscussion deleteDiscussion deleteDiscussionComment markDiscussionCommentAsAnswer reopenDiscussion unmarkDiscussionCommentAsAnswer updateDiscussion updateDiscussionComment`. **No `convertIssueToDiscussion`, no `transferDiscussion`** — the table's two most consequential "No" rows are now proven by introspection rather than inferred from absent docs.
- `Discussion` field probe → `category`, `closed`, `closedAt`, `labels`, `upvoteCount`, `viewerCanUpvote`, `viewerHasUpvoted`. The proposal's ranking signal is queryable.

**Executed — write path, end to end:**

`createDiscussion(repositoryId, categoryId, title, body)` returned a discussion node id; `addLabelsToLabelable(labelableId: <that id>, labelIds: [...])` then returned the discussion with the label attached. Both succeeded **with a user-scoped `gh` credential** (the `gh` CLI's own OAuth token from `gh auth login`, held in the system keyring — not a personal access token; this project forbids PATs).

Scope of that claim, precisely: the **mutation path** is proven — the API accepts a discussion node id as a `labelableId` and attaches the label. The **App authorization path is not proven**, and the sync app will run as an App, not as a user. Until [#14](https://github.com/cncf/feedback-app/issues/14) resolves, the proposal's label-on-discussion dependency is proven for a user identity only.

Cleanup: the test discussion was removed with `deleteDiscussion`; the repo's `discussions.totalCount` is back to `0`. Research proof left nothing behind in the product surface.

**Residual gap — the one thing still unverified.**

All of the above ran with a **user-scoped `gh` credential**, not with an App installation token. It does not prove the App path, and GitHub publishes no permission map for GraphQL, so no document can settle it. The open question is whether `discussions: write` alone carries `addLabelsToLabelable`, or whether `issues: write` is additionally required because labels are a shared repository resource.

Note on credentials: this project forbids personal access tokens — automation uses the GitHub App token pattern. The user-scoped credential above was used only to interrogate the API during research and to run a self-cleaning proof; it is **not** an accepted deployment path, and no design in this repo may depend on a PAT.

Tracked as [#14 — Verify discussion label writes with a GitHub App installation token](https://github.com/cncf/feedback-app/issues/14), wired as a blocker of [#3](https://github.com/cncf/feedback-app/issues/3) and of the carrier decision [#6](https://github.com/cncf/feedback-app/issues/6). The test: register a minimal App with `discussions: write` and nothing else, install it, mint an installation token, repeat the create→label sequence, and expect a `401` if the permission is insufficient.
