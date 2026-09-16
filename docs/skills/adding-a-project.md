---
name: adding-a-project
description: >-
  Onboard a CNCF project to the feedback system end to end. Use when a project
  asks to join, when provisioning their feedback repo, when they need the issue
  template, or when auditing existing feedback repos for drift.
metadata:
  context7-sources:
    - /github/docs
---

# Adding a project to the feedback system

Onboarding has to be cheap or it will not happen. The 2024 attempt stalled partly
because every step was manual and staff time ran out. Everything below that can
be a command **is** a command.

Target: **under ten minutes per project**, most of it waiting on a maintainer to
click Install.

## When to Use

- A project asks to join, or you are recruiting one
- Provisioning or re-provisioning a feedback repo
- Auditing existing feedback repos for configuration drift

## When NOT to Use

- Changing sync behaviour → `feedback-sync-architecture.md`
- Debugging a run that is already configured → `operating-feedback-sync.md`

## The rule these repos follow

**A feedback repo hosts discussions and nothing else.**

| Feature | State | Why |
|---|---|---|
| Discussions | **on** | the entire purpose |
| Issues | **off** | an issue tracker here splits the conversation the hub exists to consolidate, and collects support tickets aimed at a repo with no code |
| Wiki | **off** | unowned documentation surface, drifts immediately |
| Projects | **off** | planning belongs in the project's own org |
| Forking | **off** | nothing to fork; a fork only creates a confusing lookalike |
| Pull requests | *cannot be disabled* | keep the repo **empty** — with no default branch there is nothing to open a PR against |

Pull requests have no GitHub setting. Emptiness is the control. **Do not add a
README to a feedback repo**; it creates a branch and with it a PR surface.

## Onboarding

### 1. Provision the repo

```bash
./scripts/provision-project.sh <project>
```

Idempotent, verifies rather than assumes, and prints the repository and category
IDs you need next. Run it against several projects at once, or against every
existing repo periodically to correct drift.

### 2. Confirm the category format

The script cannot do this: **GraphQL does not expose category format.**

Open the repo's discussion settings and confirm the target category is
**announcement format** — only maintainers and the App may start threads, anyone
may reply. That property is what keeps support questions out of the feedback
stream. `Announcements` ships announcement-format on every new repo; a
hand-created category may be open-ended and silently void the guarantee.

Leave one open category (`Ideas`) so end users can still raise their own topics.

### 3. Record access

Access to hub-org repos is declared in `org-admin/access-control.yaml` and
reconciled by [CLOWarden](https://github.com/cncf/clowarden), which revokes
anything granted by other means. Add the project's maintainer team by pull
request:

```yaml
repositories:
  - name: <project>
    teams:
      <project>-maintainers: maintain
```

`maintain` lets them moderate their own discussions without administering the
repo. Do not grant access through the UI — CLOWarden will take it away.

### 4. The project installs the source App

Send the maintainer one link: `https://github.com/apps/<source-app>/installations/new`

They install on their own org, scoped to the repos they want synced. They can
revoke at any time. What they are granting:

| Permission | Why |
|---|---|
| `issues: read` | see labelled issues and their content |
| `issues: write` | post one backlink comment per synced issue |
| `metadata: read` | required by GitHub for any repository access |

Nothing touching code, releases, actions, or settings. Say so plainly — the size
of this ask is the adoption argument.

### 5. Register the project

Add their repo to `config.json`:

```json
"sources": ["cncf/feedback-app", "<their-org>/<their-repo>"]
```

### 6. Create the label

```bash
gh label create feedback \
  --color 0e8a16 \
  --description "Sync this issue to the CNCF feedback hub" \
  --repo <their-org>/<their-repo>
```

### 7. Give maintainers the issue template

The shared region is marker-delimited. Everything between the markers is
mirrored; everything outside stays only in the issue.

```markdown
Maintainer notes, links, implementation detail. Not mirrored.

<!-- BEGIN-BLOCK -->
## <feature> — feedback wanted

**What it does:** <plain description, no internal jargon>

**What we'd like to know:**
- <question about their environment>
- <question about whether this changes how they operate>

You do not need to run it to answer.
<!-- END-BLOCK -->

More maintainer notes. Also not mirrored.
```

**Tell maintainers plainly: the markers curate, they do not conceal.** Text
outside the block remains fully visible in the issue, which is public. Nothing
sensitive belongs in either place.

## Verifying an onboarding

```bash
GH_TOKEN=$(gh auth token) bun run src/sync.mjs --dry-run
```

Their labelled issues should appear under a `source <org>/<repo>` heading. Then
label one issue for real and confirm:

- [ ] Discussion created in the right repo and category
- [ ] Discussion **authored by the App**, not a person
- [ ] Backlink comment on the issue, authored by the App
- [ ] Second run posts nothing
- [ ] Removing the label closes the discussion; re-adding reopens the same one

## Auditing drift

Anyone with admin can flip a setting. Re-run provisioning across every repo; it
is idempotent and fails loudly when settings do not apply:

```bash
./scripts/provision-project.sh $(gh api orgs/cncf-projects/repos --paginate \
  --jq '.[] | select(.name|test("^(org-admin|guidelines)$")|not) | .name')
```

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll add a README so the repo looks welcoming." | It creates a branch and a PR surface. Put the welcome in a pinned discussion. |
| "Leave issues on, people might file useful ones." | They will file support requests in a repo with no code and no maintainers watching. |
| "The category is called Project Feedback so it must be the feedback one." | Name is not format. Verify in settings or lose the moderation guarantee. |
| "I'll grant repo access in the UI, it's quicker." | CLOWarden reconciles it away. Use the PR. |
| "Onboarding is a handful of clicks." | Times every project. Script it the first time. |

## Red Flags

- A feedback repo with issues, a wiki, or a README
- A category chosen by name without checking its format
- Repo access granted outside `access-control.yaml`
- A project installing the App with broader permissions than the four listed
- Onboarding steps done by hand that the script already does

## Verification

- [ ] `provision-project.sh` exits 0 and reports `true,false,false,false`
- [ ] Repo has no branches
- [ ] Target category confirmed announcement-format in settings
- [ ] Access recorded in `access-control.yaml` via merged PR
- [ ] Source App installed by the project, not by staff on their behalf
- [ ] Repo added to `sources` in `config.json`
- [ ] Label exists in their repo
- [ ] One issue synced end to end, App-authored on both sides
