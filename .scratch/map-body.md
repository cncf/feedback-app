## Destination

A working issue→discussion sync app living in `cncf/feedback-app`, plus a decision record stating what the 2024 CNCF feedback-loop proposal got right, what the platform has since obsoleted, and what must change before it goes back to the End User TAB. Demo-able end to end. Adoption by a real third-party project is not on the route.

## Notes

**Domain.** Reviving "Creating a Better Feedback Loop" (Bob Killen, drafted 2023-10-14, last updated 2024-09-05). Archived verbatim at `docs/proposal-2024-killen.md`. The design: maintainers label an issue in their project repo → an app mirrors it into a GitHub Discussion in a dedicated central CNCF feedback org (one repo per project) → end users give feedback in one place → a dashboard reports engagement filtered by affiliation and CNCF member tier.

**Status of the effort it revives** (verified 2026-09-16, `docs/research/proposal-status.md`): a **parked, still-owned effort, not a duplicate**. It reached the End User TAB as the `area/feedback-loops` workstream (`cncf/tab` #52/#53/#54, Jan 2025), then was explicitly parked — #54 closed 2025-12-01 and #52 closed 2025-12-08, both "Closing for now. Once we get more time in the TAB we get back to it." A KubeCon EU 2026 Maintainer Summit slot (`cncf/tab#103`) closed 2026-04-27, "We didn't make this in time." Nothing shipped: no `cncf/feedback` repo, no feedback org, no sync app, no PoC in Istio, OpenTelemetry, Argo, Envoy, or cert-manager. Bob Killen is still at the LF and active, but not on this. The End User TAB still exists under the same name and charter.

**Standing constraints.**
- The app lives in `cncf/feedback-app`. The driver holds `admin` on the `cncf` org, so creating and transferring repos needs no external approval — but work here is visible to the whole foundation, and a parked TAB workstream has an owner who is not the driver.
- Prototype cast is synthetic repos, not a real third-party project. Explicitly not Bluefin.
- Execution override: this map permits building, not only deciding. The prototype ticket produces running code.
- Proof discipline: anything executed against a real surface cleans up after itself. Test discussions get deleted.

**Mandatory sources.** Context7 (`/github/docs`) for any GitHub platform claim; GitHub MCP tools for live repo facts. No API shapes from recall. Every platform claim cites a doc URL or a schema introspection result. The design must respect GitHub's documented rate limits, App permission model, and Acceptable Use Policies.

**Verified platform facts** (live introspection + execution against `cncf/feedback-app`, 2026-09-16):
- `Discussion` implements `Closable Comment Deletable Labelable Lockable Node Reactable RepositoryNode Subscribable Updatable Votable`. Labels and upvotes are API-writable — the 2024 doc's largest unverified assumption holds, proven by `createDiscussion` → `addLabelsToLabelable` executed end to end with a user PAT.
- Discussion mutation set is exactly: `addDiscussionComment addDiscussionPollVote closeDiscussion createDiscussion deleteDiscussion deleteDiscussionComment markDiscussionCommentAsAnswer reopenDiscussion unmarkDiscussionCommentAsAnswer updateDiscussion updateDiscussionComment`. **No `convertIssueToDiscussion`. No `transferDiscussion`.**
- `createDiscussion` is GraphQL-only, requires `repositoryId` + `categoryId`. There is still no REST API for repository discussions. [source](https://github.com/github/docs/blob/main/content/graphql/guides/using-the-graphql-api-for-discussions.md)
- **GitHub removed native label-based bulk issue→discussion conversion in 2025** — the closest native analogue to this design's trigger. The platform moved away from this use case, not toward it.
- `discussion` webhook fires on `created`, `edited`, `deleted`, `transferred`, `pinned`, `unpinned`, `labeled`, `unlabeled`, `locked`, `unlocked`, `category_changed`, `answered`, `unanswered`.
- Secondary rate limits: 80 content-generating requests/minute, 500/hour; GraphQL mutations cost 5 points. Any backfill must be designed against this.
- `GITHUB_TOKEN` is scoped to its own repository, so a plain Action in a source repo **cannot** create a discussion in the hub. Cross-repo creation needs an App installation or a PAT.
- Still unproven: whether the App `discussions: write` permission alone carries `addLabelsToLabelable`. GitHub publishes no GraphQL permission map. Tracked as a blocker.

**Skills.** `/grilling` + `/domain-modeling` on grilling tickets. `/research` subagents on research tickets. `/prototype` on prototype tickets.

## Decisions so far

<!-- one line per closed ticket: gist, then zoom the link for detail -->

- [What actually happened to the 2024 feedback loop proposal?](https://github.com/cncf/feedback-app/issues/2) — parked, not dead and not duplicated: reached the End User TAB as `area/feedback-loops`, parked Dec 2025, missed KubeCon EU 2026; nothing of the design shipped. Revival justified; coordinating with the TAB owner is a route item, not an afterthought.
- [Metrics, affiliation data, and prior art](https://github.com/cncf/feedback-app/issues/4) — the 2024 dashboard blocker is **cleared** (LFX Insights ingests discussion activity) but the specified dashboard still is not buildable: no upvote signal, no member-tier dimension, no public API. Member tiers are public in `cncf/landscape`; affiliation data has **degraded** (DevStats undercounting warning, 2026-08-26). Issue↔discussion sync has effectively no prior art — this is greenfield.

## Not yet specified

- **Where the feedback hub lives.** The 2024 design needs a dedicated org with one repo per project. `cncf/feedback-app` is the app, not the hub. New org, a repo in `cncf`, or something smaller for the prototype — open again now that this is CNCF-hosted.
- **Cross-org installation.** A real deployment installs into project orgs the driver does not control: App permission scope, approval flow, and foundation policy all land here.
- **Re-engaging the TAB.** The workstream has an owner and a parked state. When and how this surfaces back to them is a real decision, but it needs something demo-able first.
- **Config file schema.** The 2024 doc sketches `Sources`, `FeedbackLabel`, `Labels`, `Categories`, `Managed`, `AllowedAuthors`. Whether the prototype needs a config file at all sharpens once the carrier is chosen.
- **Label sync semantics.** Labels must exist in the target repo before they can be applied. Who creates them, what happens on drift.
- **Backfill and rate-limit strategy.** Steady-state sync is cheap; seeding an existing repo is not.
- **Feedback flowing back to the maintainer.** The original design is deliberately one-way for content, which risks maintainers never reading the feedback they asked for.

## Out of scope

- Validation by a real third-party project or maintainer.
- Building the LFX Insights dashboard, or any LFX integration work.
- Outreach, marketing, KubeCon assets, PoC stakeholder recruitment — Stages 1 and 3 of the original implementation plan.
- Submitting a v2 proposal to the TOC or TAB. The decision record is written to make that easy; filing it is a separate act.
