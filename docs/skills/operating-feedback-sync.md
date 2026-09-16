---
name: operating-feedback-sync
description: >-
  Runbook for deploying, configuring, onboarding projects to, and debugging the
  CNCF feedback sync. Use when setting up credentials, adding a participating
  project, investigating a failed or silent run, or handing the system to
  someone else.
metadata:
  context7-sources:
    - /github/docs
    - /actions/create-github-app-token
---

# Operating the feedback sync

## When to Use

- Standing the system up for the first time
- Onboarding a new participating project
- A scheduled run failed, or worse, succeeded while doing nothing
- Rotating credentials or handing over ownership

## When NOT to Use

- Changing sync behaviour → `feedback-sync-architecture.md`
- Registering Apps from scratch → `github-app-credentials.md`

## Moving parts

| Piece | Where | Notes |
|---|---|---|
| Sync engine | `cncf/feedback-app` · `src/sync.mjs` | Bun, no dependencies |
| Schedule | `.github/workflows/sync-feedback.yml` | 5-minute cron + `workflow_dispatch` |
| Config | `config.json` | hub target, label, source repos, bot logins |
| Hub | `cncf-projects/<project>` | Discussions on, Issues/Wiki/Projects off |
| Hub App | `discussions: write`, `metadata: read` | installed on the hub org |
| Source App | `issues: write`, `metadata: read` | installed by each participating project |

Both Apps must be **public** so orgs other than the owner can install them.

## Configuration

One repo per project means the config is a **routing table**: each project's
source repos map to that project's own hub repo.

```json
{
  "feedbackLabel": "feedback",
  "hubOrg": "cncf-projects",
  "hubBotLogin": "cncf-feedback[bot]",
  "sourceBotLogin": "cncf-feedback-source[bot]",
  "projects": [
    {
      "name": "cert-manager",
      "sources": ["cert-manager/cert-manager"],
      "hub": {
        "repo": "cncf-projects/cert-manager",
        "repositoryId": "R_...",
        "categoryName": "Announcements",
        "categoryId": "DIC_..."
      }
    }
  ]
}
```

**An empty `sources` array means provisioned but not syncing** — the hub repo
exists and is locked down, but the project has not installed the source App yet.
The run reports these as skipped rather than treating them as errors, so a
half-onboarded project is visible without being noisy.

Resolve IDs with the user credential, never with the App token:

```bash
gh api graphql -f query='{repository(owner:"OWNER",name:"REPO"){
  id discussionCategories(first:25){nodes{id name}}
}}'
```

`botLogin` is only consulted when `viewer` cannot be resolved. The sync prefers
what the token actually is, so local user-token runs still work with bot logins
configured.

### Category format cannot be read from the API

GraphQL exposes `isAnswerable` but **not** category format. `Announcements` is
announcement-format by default on every repo; a hand-created category may not
be. Check the repo's discussion settings in the UI before pointing the config at
a nicer-sounding category, or the moderation guarantee silently does not hold.

## Repository vars and secrets

Set on the repo running the workflow (`cncf/feedback-app`):

| Kind | Name |
|---|---|
| var | `HUB_APP_ID` |
| secret | `HUB_APP_PRIVATE_KEY` |
| var | `SOURCE_APP_ID` |
| secret | `SOURCE_APP_PRIVATE_KEY` |

```bash
gh variable set HUB_APP_ID --body "<id>" --repo cncf/feedback-app
gh secret   set HUB_APP_PRIVATE_KEY < app.pem --repo cncf/feedback-app
```

The workflow **skips cleanly** when any of the four is missing, logging a notice
that names them. A silent skip is intentional: an unwired cron failing every
five minutes teaches people to ignore failures.

## Onboarding a project

1. Create the project's feedback repo in the hub org from the template;
   Discussions **on**, Issues/Wiki/Projects **off**.
2. Record access in the org's CLOWarden `access-control.yaml` via PR — that file
   is the declared desired state and reconciles away anything granted by other
   means.
3. Confirm the target category is announcement-format.
4. Have the project install the **source App** on their org.
5. Add their repo to `sources` in `config.json`.
6. Create the feedback label in their repo.
7. Give maintainers the issue template carrying the marker block.

Provisioning should be a script, not a procedure. A manual setup that takes an
afternoon per project does not survive contact with many projects.

## Running by hand

```bash
# plan only, no writes
GH_TOKEN=$(gh auth token) bun run src/sync.mjs --dry-run

# real run, split identities
GH_HUB_TOKEN=<hub installation token> \
SOURCE_APP_ID=<id> SOURCE_APP_PRIVATE_KEY="$(cat source.pem)" \
bun run src/sync.mjs
```

A single `GH_TOKEN` is accepted for local testing only, and the run says so.

## Reading a run

```
index: 12 tracked across 1 page(s)     mapping rebuilt from the hub
  ignoring #9: marker in category "Ideas"   spoof or stray, correctly rejected
source cncf/feedback-app
  3 labelled issue(s)
  created discussion #14 -> <url>
  backlink -> discussion / -> issue
  mirrored body+title -> discussion #11
reconciling 12 tracked discussion(s)
  #7: issue not visible (...) - leaving discussion untouched
  cncf/x#3: label gone -> closed discussion #8
```

## Troubleshooting

| Symptom | Cause | Action |
|---|---|---|
| Run skipped, notice lists missing vars | credentials absent | set the four vars/secrets |
| `source App not installed on "X"` | project hasn't installed it | have them install; exit code is nonzero by design |
| Duplicate discussions each run | provenance rejecting our own content | check `botLogin` and `[bot]` normalisation |
| Duplicate backlinks each run | `bl=` flag not persisting | confirm the marker updates after each comment |
| Close never fires | reconciliation not running, or index empty | check the index line; a query for labelled issues cannot see removals |
| `ignoring #N: authored by @someone` | someone planted a marker | expected; the rejection is the feature |
| Nothing happens, exit 0 | no labelled issues | confirm the label name matches `feedback-app` config exactly |
| Backfill stalls | content-generating limit (80/min, 500/hr) | throttle seeding; reads are not the problem |

## Rotation and revocation

- Rotate a private key in App settings, then update the secret. Both are
  operator-side; installers are unaffected.
- A project uninstalling stops all reads and writes for their repos. **Existing
  discussions stay untouched** — revoking access does not retract feedback end
  users gave in good faith. Archival is a separate, deliberate act.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The run was green, so it synced." | Check the index and per-source lines. A missing installation exits nonzero; a skip says so explicitly. |
| "I'll point it at the nicer category." | Format is not in the API. Verify in the UI or lose the moderation guarantee. |
| "Use one token for both sides." | Local testing only. Production is two identities with two keys. |
| "Onboarding is just a few clicks." | Times the number of projects. Script it while standing up the first one. |

## Red Flags

- Scheduled runs green for days with no discussion activity anywhere
- `botLogin` unset while running with installation tokens
- Category id pointing at a format nobody verified
- Private keys anywhere in the repo or in logs
- Backfilling an existing project without throttling

## Verification

- [ ] `--dry-run` plans the expected work and writes nothing
- [ ] A real run creates a discussion **authored by the App**
- [ ] Second run posts nothing
- [ ] Unlabel closes; relabel reopens the same discussion
- [ ] Removing a credential makes the workflow skip, not fail
- [ ] An uninstalled source produces a nonzero exit, not a silent success
- [ ] No test discussions or comments left behind
