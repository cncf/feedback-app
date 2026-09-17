# feedback-app

Syncs designated project issues into GitHub Discussions in a central feedback
hub. End users get one place to give feedback per project; maintainers keep
their implementation thread and never leave their issue.

A maintainer labels an issue in their project repo. A discussion appears in the
hub. Both sides get a backlink. Edits mirror; removing the label closes the
discussion; re-adding it reopens the same one.

## How it works

```
maintainer labels an issue with `feedback`
        |
   scheduled poll (every 5 minutes)
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

Only content between the markers is mirrored, so tracking notes stay out of the
end-user surface (they remain public in the source issue — the markers curate,
they do not conceal):

```markdown
Internal notes up here are not mirrored.

<!-- BEGIN-BLOCK -->
## The part end users see
<!-- END-BLOCK -->
```

There is no state file. The issue→discussion mapping lives in the discussions
themselves and is rebuilt from the hub on every run, so runs are idempotent and
nothing can silently fail to persist.

## Usage for maintainers

1. Have your org admin install the source App (one click, once per org).
2. Put the shared block in the issue, between the markers.
3. Apply the `feedback` label when the proposal is ready for feedback.
4. Remove the label when the feedback window closes.

Everything else — mirroring, backlinks, labels, category, close/reopen — is the
sync's job.

## Configuration

`config.json` is a routing table: each project's source repos map to that
project's hub repo.

```json
{
  "feedbackLabel": "feedback",
  "labelPrefixes": ["area/", "kind/"],
  "hubOrg": "cncf-projects",
  "projects": [
    {
      "name": "cert-manager",
      "sources": ["cert-manager/cert-manager"],
      "hub": {
        "repo": "cncf-projects/cert-manager",
        "repositoryId": "R_...",
        "categoryName": "Announcements",
        "categoryId": "DIC_..."
      },
      "routes": [
        { "label": "sig/network", "categoryName": "Network", "categoryId": "DIC_..." }
      ]
    }
  ]
}
```

| Knob | Effect |
|---|---|
| `feedbackLabel` | the one control maintainers touch; drives create/close/reopen |
| `labelPrefixes` | source labels matching a prefix mirror to the discussion with the prefix stripped (`area/api` → `api`); the label must already exist in the hub repo; `[]` disables |
| `sources` | repos polled for the label; empty = provisioned but not yet syncing |
| `hub` | the project's hub repo and default discussion category |
| `routes` | optional, ordered: an issue carrying `label` lands in that category; first match wins, no match falls back to the default (the kubernetes/enhancements pattern — one repo, per-SIG categories) |

## Running

```bash
# local, read-only plan
GH_TOKEN=$(gh auth token) bun run src/sync.mjs --dry-run

# production shape: split identities
GH_HUB_TOKEN=<hub installation token> \
SOURCE_APP_ID=<id> SOURCE_APP_PRIVATE_KEY="$(cat source.pem)" \
bun run src/sync.mjs
```

Bun, no dependencies. A single `GH_TOKEN` is accepted for local testing only,
and the run says so.

## Deployment

`.github/workflows/sync-feedback.yml` polls every 5 minutes using two GitHub
Apps: the **hub App** (`discussions: write`, installed on the hub org) and the
**source App** (`issues: write`, installed by each participating project on
their own org). Set on this repo:

| Kind | Name |
|---|---|
| var | `HUB_APP_ID` |
| secret | `HUB_APP_PRIVATE_KEY` |
| var | `SOURCE_APP_ID` |
| secret | `SOURCE_APP_PRIVATE_KEY` |

While any of the four is missing the workflow skips cleanly with a notice
naming them, rather than failing every 5 minutes.

## Docs

| Question | Doc |
|---|---|
| Why is it shaped this way? | [`docs/skills/feedback-sync-architecture.md`](docs/skills/feedback-sync-architecture.md) |
| Deploy, onboard, debug a run | [`docs/skills/operating-feedback-sync.md`](docs/skills/operating-feedback-sync.md) |
| Onboarding a project | [`docs/skills/adding-a-project.md`](docs/skills/adding-a-project.md) |
| App registration and keys | [`docs/skills/github-app-credentials.md`](docs/skills/github-app-credentials.md) |
| Discussions API traps | [`docs/skills/github-discussions-api.md`](docs/skills/github-discussions-api.md) |
| The 2024 proposal this revives | [`docs/proposal-2024-killen.md`](docs/proposal-2024-killen.md) |

## License

[Apache 2.0](LICENSE)
