# feedback-app

Syncs designated project issues into GitHub Discussions in a central feedback
hub, so end users have one place to give feedback and maintainers keep their
implementation thread.

Originally proposed by Bob Killen (2023-10-14 → 2024-09-05). It reached the CNCF
End User TAB as the `area/feedback-loops` workstream, then was parked in
December 2025 with nothing shipped. This repo is the revival.

## Layout

| Path | What |
|---|---|
| `src/sync.mjs` | the sync engine |
| `config.json` | hub target, label, label prefixes, category routes, source repos, bot logins |
| `.github/workflows/sync-feedback.yml` | 5-minute poll, guarded on credentials |
| `docs/skills/` | **start here** — how it works and how to run it |
| `docs/research/` | primary-source findings behind the design |
| `docs/proposal-2024-killen.md` | the original proposal, archived verbatim |

## Topology

- **`cncf/feedback-app`** — this repo: engine, workflow, credentials
- **`cncf-projects/<project>`** — the hub: discussions end users see
- participating project orgs — the issues maintainers label

## Quick start

```bash
GH_TOKEN=$(gh auth token) bun run src/sync.mjs --dry-run
```

Deployment, onboarding, and troubleshooting live in
[`docs/skills/operating-feedback-sync.md`](docs/skills/operating-feedback-sync.md).

## Agent skills

Read the matching project skill **before** any global skill or training-data
recall. Index: [`docs/skills/README.md`](docs/skills/README.md).

| Area | Skill |
|---|---|
| Sync behaviour, design rationale, reviewing changes | `docs/skills/feedback-sync-architecture.md` |
| Onboarding a project, provisioning repos, auditing drift | `docs/skills/adding-a-project.md` |
| Deploy, configure, debug a run | `docs/skills/operating-feedback-sync.md` |
| GitHub App registration, tokens, key custody | `docs/skills/github-app-credentials.md` |
| Discussions API, category formats, webhooks | `docs/skills/github-discussions-api.md` |

### Issue tracker

Issues live in GitHub Issues on `cncf/feedback-app`, driven with the `gh` CLI
and the GitHub MCP tools. See `docs/agents/issue-tracker.md`. The route and every
decision taken so far are on [the map](https://github.com/cncf/feedback-app/issues/1).

### Triage labels

`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.
See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root, ADRs under `docs/adr/`.
See `docs/agents/domain.md`.

## Source discipline

No GitHub API shape from memory. Context7 (`/github/docs`) or the live GraphQL
schema, every time, cited at the claim. The design must respect GitHub's
documented rate limits, App permission model, and Acceptable Use Policies.

Two official GitHub pages actively mislead on this subject, and a mutation
existing in the schema does not mean your credential may call it. Both traps are
documented in `docs/skills/github-discussions-api.md`.

Probe in a disposable repo, never the product surface, and delete test content
afterwards.

Research subagents here have no filesystem write access: they return the finished
document in their result payload and the parent writes it to `docs/research/`.
Reconcile any such report against work done after it was drafted — a report
committed verbatim can contradict later findings.
