---
name: github-discussions-api
description: >-
  Working with the GitHub Discussions API and cross-repo automation. Use when
  creating, labelling, closing, or syncing discussions; when choosing between a
  GitHub App, an Action, and a poller for cross-repo writes; or when a GitHub
  doc page and the live schema disagree.
metadata:
  context7-sources:
    - /github/docs
    - /actions/create-github-app-token
---

# GitHub Discussions API

Discussions are not issues with a different name. They are GraphQL-only, their
documentation contradicts itself in two places, and the default workflow
credential cannot reach across repositories. Each of those costs a redesign if
discovered late.

## When to Use

- Creating, updating, labelling, closing, or deleting discussions from code
- Syncing content between repositories, orgs, or between issues and discussions
- Choosing a carrier (App / Action / poller) for any cross-repo write
- Reading a GitHub doc page that states an API shape you are about to depend on

## When NOT to Use

- Issue-only or PR-only automation with no cross-repo hop — the REST issues API
  is well-trodden and none of the hazards below apply
- Reading public discussion content, which the GraphQL read API serves plainly

## Core Process

1. **Verify the shape against the live schema, never against a guide.** Run
   introspection before writing a mutation:
   ```bash
   gh api graphql -f query='{ __type(name:"Labelable"){ possibleTypes{ name } } }'
   gh api graphql -f query='{ __type(name:"Discussion"){ interfaces{ name } } }'
   gh api graphql -f query='{ __type(name:"Mutation"){ fields{ name } } }'
   ```
2. **Enable Discussions on the target repo first.** `createDiscussion` fails
   regardless of credentials while `has_discussions` is false:
   ```bash
   gh api --method PATCH repos/OWNER/REPO -F has_discussions=true --jq '.has_discussions'
   ```
3. **Resolve node IDs before mutating.** `createDiscussion` takes a
   `repositoryId` and a `categoryId`, not names:
   ```bash
   gh api graphql -f query='{repository(owner:"O",name:"R"){id discussionCategories(first:25){nodes{id name isAnswerable}}}}'
   ```
4. **Settle identity and carrier separately** (see below). The credential
   question and the runtime question are independent; answering one does not
   answer the other.
5. **Prove write paths by execution, one mutation at a time.** A mutation that
   exists in the schema is not a mutation your credential may call.
6. **Clean up test content.** `deleteDiscussion` exists; use it. Verify with
   `discussions{totalCount}`.

## Documentation Hazards

Two official GitHub pages will mislead you. Both are current, both are wrong for
this purpose, and the misleading one is the more discoverable in each case.

| Hazard | Wrong source | Authoritative source |
|---|---|---|
| `Discussion` interfaces | The hand-written guide *Using the GraphQL API for Discussions* omits `Closable`, `Labelable`, and `Votable`, implying labels are read-only | [`/graphql/reference/discussions`](https://docs.github.com/en/graphql/reference/discussions) — schema-generated |
| `discussion` webhook actions | *Events that trigger workflows* lists 13 actions, omitting `closed` and `reopened` — that page documents the narrower **Actions-trigger** subset | [`/webhooks/webhook-events-and-payloads`](https://docs.github.com/en/webhooks/webhook-events-and-payloads) — 15 actions |

Rule: **schema-generated references beat hand-written guides**, and the webhooks
reference beats the Actions reference whenever you are consuming webhooks rather
than triggering a workflow.

## Facts Worth Knowing Before Designing

- **No REST API for repository discussions.** GraphQL only.
- **`Discussion` implements** `Closable`, `Comment`, `Deletable`, `Labelable`,
  `Lockable`, `Node`, `Reactable`, `RepositoryNode`, `Subscribable`,
  `Updatable`, `Votable`. Labels and upvotes are therefore writable via
  `addLabelsToLabelable` and `addUpvote`.
- **There is no `convertIssueToDiscussion` and no `transferDiscussion`.**
  GitHub also removed native label-based bulk issue→discussion conversion in
  2025. The platform is moving away from this use case, not toward it.
- **`updateDiscussion(categoryId:)` is same-repository only.** Discussions do
  not move between repos or orgs.
- **Labels are one shared repository set** across issues, PRs, and discussions,
  and a label must exist in the target repo before it can be applied.

## The Cross-Repo Constraint

`GITHUB_TOKEN` is scoped to the repository whose workflow is running. A
discussion created in *another* repository fails with
`Resource not accessible by integration` no matter what permissions the workflow
declares.

So any project-repo → hub-repo topology needs a credential that is **not**
`GITHUB_TOKEN`. GitHub offers two: a **GitHub App installation token** or a PAT.
Where PATs are forbidden, that resolves to App installation — but read the next
section before concluding anything about runtime.

### Identity is not carrier

These are two independent choices, and collapsing them produces a wrong design:

| Axis | Options |
|---|---|
| **Identity** — who the API calls run as | App installation token, PAT, user token |
| **Carrier** — what runtime executes the sync | Hosted webhook service, GitHub Actions workflow, scheduled poller |

A no-PAT rule constrains **identity only**. It does not select a carrier,
because a plain Actions workflow can mint an App installation token — including
one scoped to a *different* owner — via the official
[`actions/create-github-app-token`](https://github.com/actions/create-github-app-token):

```yaml
- uses: actions/create-github-app-token@v3
  id: app-token
  with:
    client-id: ${{ vars.APP_CLIENT_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}
    owner: target-org          # omit `repositories` for all repos in the installation
    repositories: |
      hub-repo
- run: gh api graphql -f query='...'
  env:
    GH_TOKEN: ${{ steps.app-token.outputs.token }}
```

The action calls `POST /app/installations/{installation_id}/access_tokens`,
returns a token valid for one hour, and revokes it in its `post` step. `owner`
without `repositories` scopes to every repo in that installation; omitting both
scopes to the current repo.

So "must be an App" is a statement about the **token**, not about running a
hosted service. Actions-as-carrier with App-as-identity is a real option and is
usually the cheapest one — no server, no webhook endpoint, no hosting. What you
give up is inbound webhooks: an Action cannot receive `discussion` events for a
repo it doesn't live in, so hub-side drift detection needs a poll or a webhook
relay. That tradeoff — not the credential — is what should decide the carrier.

## Permission Mapping Is Undocumented

GitHub publishes **no permission map for the GraphQL API**. Official guidance is
to test the app and expect `401` on insufficient permission. Consequences:

- Never record a GraphQL mutation's required App permission as settled fact from
  documentation alone. Mark it unverified until an installation token has run it.
- A proof run with a user credential establishes the **mutation path only** — it
  says nothing about App authorization, and production runs as an App.
- Test each mutation you depend on. `addLabelsToLabelable` succeeding does not
  establish `removeLabelsFromLabelable`, and sync drift correction needs both.

## Credential Terminology

The `gh` CLI's keyring token from `gh auth login` is an **OAuth user-scoped
token**, not a personal access token. Calling it a PAT in a report is wrong, and
in a project with a no-PAT rule it wrongly reads as a policy violation. Check
`gh auth status` and describe what is actually there.

## Adjacent API Gotchas

- **Sub-issues and issue dependencies take the numeric database `id`**, not the
  `#number` and not the `node_id`:
  ```bash
  gh api repos/O/R/issues/<n> --jq .id   # database id
  gh api --method POST repos/O/R/issues/<parent>/sub_issues -F sub_issue_id=<db-id>
  gh api --method POST repos/O/R/issues/<child>/dependencies/blocked_by -F issue_id=<db-id>
  ```
- **Repository transfer preserves issues, issue numbers, labels, and
  sub-issue/dependency edges.** Transferring then renaming is safe, and cheaper
  than recreating a tracker. Update the git remote afterwards.
- **Secondary rate limits bite backfills, not steady state**: 80
  content-generating requests per minute, 500 per hour; GraphQL mutations cost 5
  points, queries 1.
- **Discussion webhooks are public preview**, so Beta Preview terms apply.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The GraphQL guide shows the Discussion type — that's authoritative." | It is hand-written and stale. It omits three interfaces, including `Labelable`. Use the schema-generated reference. |
| "The permission is documented as covering labels, so `discussions: write` is enough." | No GraphQL permission map exists. Documented prose is not an authorization test. Run it. |
| "I proved create-and-label works, so the label path is proven." | You proved it for that credential and that one mutation. Remove and clear are separate, and an App is not a user. |
| "I'll use an Action with `GITHUB_TOKEN`, it's simpler." | `GITHUB_TOKEN` cannot write to another repository — but the Action still can, using an App installation token from `actions/create-github-app-token`. Reject the credential, not the carrier. |
| "PATs are banned, so it has to be a hosted App." | Banning PATs settles *identity*, not *runtime*. A workflow can mint an App installation token scoped to another owner. Decide the carrier on webhooks and latency instead. |
| "The workflow-events page lists the discussion actions." | It lists the Actions-trigger subset. Webhook consumers need the webhooks reference. |

## Red Flags

- A capability table asserting a required App permission for a GraphQL mutation
  with no executed result behind it
- The words "proven" or "verified" attached to a mutation nobody ran
- A design that reaches for a PAT to solve a cross-repo write
- Treating a credential rule as if it selected a runtime — "no PATs, therefore a
  hosted App"
- Copying an API shape out of a prose guide without introspecting
- Test discussions, issues, or labels left behind in a real repository
- A webhook action list with 13 entries

## Verification

- [ ] Every mutation the design depends on was introspected, not recalled
- [ ] `has_discussions` is true on the target before any `createDiscussion`
- [ ] Each write path was executed, and the credential type used is stated
- [ ] App-token authorization tested separately from user-token, or explicitly
      marked unverified
- [ ] Identity and carrier decided separately, each on its own evidence
- [ ] Cross-repo writes use an App installation token, whatever the runtime
- [ ] Doc claims cite schema-generated references, not hand-written guides
- [ ] Test content deleted; `discussions{totalCount}` confirms it

## Sources

Verified via Context7 `/github/docs` plus live GraphQL introspection. Re-verify
with `resolve-library-id` → `query-docs` before trusting any API shape here; the
schema moves and this file does not follow it automatically.
