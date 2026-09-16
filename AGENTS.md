# feedback-app

Reviving the CNCF end-user feedback loop: an app that syncs designated project issues into GitHub Discussions in a central feedback surface, so end users have one place to give feedback.

Originally proposed by Bob Killen (drafted 2023-10-14, last updated 2024-09-05). It reached the CNCF End User TAB as the `area/feedback-loops` workstream, then was parked in December 2025. Nothing of the design shipped. This repo is the revival.

- Source proposal, archived verbatim: `docs/proposal-2024-killen.md` — a historical artifact, not current truth.
- Primary-source research: `docs/research/`
- The route: [the wayfinder map](https://github.com/cncf/feedback-app/issues/1)

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `cncf/feedback-app`, driven with the `gh` CLI and the GitHub MCP tools. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root, ADRs under `docs/adr/`. See `docs/agents/domain.md`.

### Project skills

Read the matching project skill **before** any global skill or training-data recall.

| Area | Skill |
|---|---|
| Discussions API, cross-repo writes, carrier choice, GitHub doc conflicts | `docs/skills/github-discussions-api.md` |

## Source discipline

No GitHub API shape from memory. Context7 (`/github/docs`) or the live GraphQL schema, every time, cited at the claim. The design must respect GitHub's documented rate limits, App permission model, and Acceptable Use Policies — this is well-documented territory and there is no excuse for guessing.

Two official GitHub pages actively mislead on this subject, and a mutation existing in the schema does not mean your credential may call it. Both traps are documented in `docs/skills/github-discussions-api.md`; read it before designing anything that writes to a discussion.

Research subagents in this repo have no filesystem write access. They return the finished document in their result payload and the parent session writes it to `docs/research/`. Expect to do that write yourself, and reconcile the report against anything you executed afterwards — a report committed verbatim can contradict work done after it was drafted.
