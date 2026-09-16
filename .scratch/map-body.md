## Destination

A working issue→discussion sync prototype running entirely in the `castrojo/*` namespace, plus a decision record stating what the 2024 CNCF feedback-loop proposal got right, what is now obsolete, and what should change before anyone proposes it to a foundation again. Demo-able by one person; adoption by anyone else is explicitly not part of this.

## Notes

**Domain.** Reviving "Creating a Better Feedback Loop" (Bob Killen, drafted 2023-10-14, last updated 2024-09-05). Archived verbatim at `docs/proposal-2024-killen.md`. The original design: maintainers label an issue in their project repo → a GitHub App mirrors it into a GitHub Discussion in a dedicated central CNCF org (one repo per project) → end users give feedback in one place → a dashboard reports engagement filtered by affiliation and CNCF member tier. It never shipped; `cncf/feedback` does not exist.

**Standing constraints.**
- Prototype lives in `castrojo/*`. No CNCF org, no cross-org App installation, no Marketplace listing, no foundation approval on the route.
- Prototype cast is synthetic repos owned by the driver. Not Bluefin. Not a real third-party project.
- Execution override: this map permits building, not only deciding. The prototype ticket produces running code.

**Mandatory sources.** Context7 (`/github/docs`) for any GitHub platform claim; GitHub MCP tools for live repo facts. No API shapes from recall. Every platform claim cites a doc URL or a schema introspection result. Design must respect GitHub's documented limits and Acceptable Use Policies.

**Verified already** (schema introspection, 2026-09-16):
- `Discussion` implements `Labelable`, `Votable`, `Closable`, `Lockable` — labels and upvotes are API-writable. The 2024 doc's largest unverified assumption holds.
- `createDiscussion` is GraphQL-only, requires `repositoryId` + `categoryId`. [source](https://github.com/github/docs/blob/main/content/graphql/guides/using-the-graphql-api-for-discussions.md)
- `discussion` webhook fires on `created`, `edited`, `deleted`, `transferred`, `pinned`, `unpinned`, `labeled`, `unlabeled`, `locked`, `unlocked`, `category_changed`, `answered`, `unanswered`.
- Secondary rate limits: 80 content-generating requests/minute, 500/hour; GraphQL mutations cost 5 points. Any backfill must be designed against this.

**Skills.** `/grilling` + `/domain-modeling` on grilling tickets. `/research` subagents on research tickets. `/prototype` on prototype tickets.

## Decisions so far

<!-- one line per closed ticket: gist, then zoom the link for detail -->

## Not yet specified

- **Config file schema.** The 2024 doc sketches `Sources`, `FeedbackLabel`, `Labels`, `Categories`, `Managed`, `AllowedAuthors`. Whether the prototype needs a config file at all, and what it holds, only sharpens once the sync carrier is chosen.
- **Label sync semantics.** Labels must exist in the target repo before they can be applied. Who creates them, what happens on drift.
- **Backfill and rate-limit strategy.** Steady-state sync is cheap; seeding an existing repo is not. Shape depends on carrier.
- **Feedback flowing back to the maintainer.** The original design is deliberately one-way for content, which risks maintainers never reading the feedback they asked for. Whether a digest returns to the source issue is a real question, but it needs the sync working first.
- **Whether this generalises.** If the plumbing turns out boring and useful, it may be worth more as a general-purpose tool than as CNCF infrastructure. Revisit after the prototype runs.
- **Onboarding shape for a real project.** Deferred until the decision record is being written.

## Out of scope

- Creating a CNCF GitHub org, or any change to foundation infrastructure.
- Validation by a real third-party project or maintainer.
- Building the LFX Insights dashboard, or any LFX integration work.
- Outreach, marketing, KubeCon assets, PoC stakeholder recruitment — Stage 1 and Stage 3 of the original implementation plan.
- Submitting a v2 proposal to the TOC or TAB.
