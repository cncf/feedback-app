---
name: github-app-credentials
description: >-
  Registering, scoping, and authenticating GitHub Apps for cross-org automation.
  Use when creating a GitHub App, deciding public vs private, minting
  installation tokens, choosing between one shared App and split identities, or
  when an App "cannot be installed" on the org you want.
metadata:
  context7-sources:
    - /github/docs
    - /actions/create-github-app-token
---

# GitHub App credentials

Every expensive mistake in this area is made at registration time and discovered
much later, when someone cannot install the thing. Registration is a browser
form with no API, so mistakes cost a human round-trip to fix.

## When to Use

- Registering a GitHub App that other organisations will install
- Deciding where an App is *owned* versus where it is *installed*
- Minting installation tokens, especially across more than one org
- Debugging "the org I want isn't in the install list"
- Choosing between a single App and separate identities per side of a system

## When NOT to Use

- Automation confined to one repository — `GITHUB_TOKEN` is simpler and safer
- OAuth Apps for user-facing login flows; different object, different rules

## The four decisions made at registration

Get these wrong and you re-register. There is no API to edit most of them, and
no API to create an App at all.

| Decision | Consequence if wrong |
|---|---|
| **Owner** (personal / which org) | An App can only be installed on its owner unless it is public |
| **Public vs private** | **Private = installable only on the owning account.** Fatal for any multi-org design |
| **Permissions** | Requested app-wide at registration, shown to every installer, not per-installation |
| **Name/slug** | Appears as the bot author on everything it writes, in other people's repos |

### Public is not the same as Marketplace

A public App can be installed by any account. It does **not** require a
Marketplace listing, review, or approval. "Public" here means installable, not
advertised.

If the design is "many independent orgs install our App", it must be public.
Deciding this late means the App exists, looks correct, and simply cannot be
installed where it is needed.

## Owner vs installed-on

These are independent and routinely confused:

- **Owner** — the account whose settings page holds the App and its private key
- **Installed on** — the accounts that granted it access to their repositories

An App owned by `org-a` and installed on `org-b` is normal and correct, provided
it is public. The key stays with the owner; installers never receive a secret.

**Installing an App is not the same as holding its key.** An installer
authorises access and can revoke it. Only the party *minting tokens* needs the
private key. That asymmetry is what lets one operator serve many orgs without
distributing secrets.

## Registration: the manifest flow

Registration is a browser POST. There is no create-an-App API. The manifest flow
automates everything around that one click:

1. Serve a page that POSTs a `manifest` JSON to
   `https://github.com/organizations/ORG/settings/apps/new?state=RANDOM`
   (or `/settings/apps/new` for a personal account)
2. The human clicks "Create GitHub App"
3. GitHub redirects to your `redirect_url` with a one-time `code`
4. `POST /app-manifests/{code}/conversions` returns the **`id`, `pem`,
   `client_secret`, and `webhook_secret`**

Manifest fields that matter:

```json
{
  "name": "my-app",
  "url": "https://github.com/org/repo",
  "public": true,
  "default_permissions": { "discussions": "write", "metadata": "read" },
  "default_events": [],
  "redirect_url": "http://127.0.0.1:8765/cb"
}
```

### Securing the callback

That `code` exchanges for the **private key**. Treat the catcher as a credential
handler, not a convenience script:

- Bind to `127.0.0.1` explicitly. A default bind exposes it to the LAN
- Validate the `state` parameter; reject mismatches
- Never expose the code from a status endpoint
- Write the key `0600` in a `0700` directory outside the repo and outside
  world-readable temp paths
- Never echo the conversion response — it contains the key and both secrets

## Minting installation tokens

### In a workflow, single owner

`actions/create-github-app-token` handles the JWT and exchange:

```yaml
- uses: actions/create-github-app-token@v3
  id: app-token
  with:
    app-id: ${{ vars.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}
    owner: target-org          # omit `repositories` for all repos
    repositories: one-repo
```

Scoping rules, which are easy to get backwards:

- no `owner`, no `repositories` → **the current repository only**
- `owner` alone → every repo in that installation
- `owner` + `repositories` → those repos

### Across many owners

**There is no token that spans installations.** One installation, one token. A
poller serving many orgs must do the work itself:

```
JWT signed with the App private key
  -> GET /app/installations            (paginate!)
  -> POST /app/installations/{id}/access_tokens   per owner
  -> cache per owner for the run
```

Paginate `/app/installations`. A default first page silently truncates at large
N, and the failure looks like "that org isn't installed".

## Identity: the two spellings trap

GitHub reports an App under **two different logins**:

| Source | Value |
|---|---|
| `viewer.login` | `my-app[bot]` |
| `author.login` on content it wrote | `my-app` |

Comparing them naively makes provenance checks reject the App's own content.
In a sync loop that means re-creating the same object on every run, forever.

Normalise before comparing:

```js
const sameActor = (a, b) => {
  const n = (x) => (x || "").toLowerCase().replace(/\[bot\]$/, "");
  return !!a && !!b && n(a) === n(b);
};
```

Also note: **installation tokens can resolve `viewer`** and it returns the
`[bot]` form. Documentation is thin here; do not assume they cannot.

## One App or split identities

Permissions are requested **app-wide**, so every installer sees the union of
everything the App might do anywhere.

- **One App** — one registration, one key, one rotation. Every installer's
  prompt shows permissions their side never exercises.
- **Split identities** — one App per side of the system, each requesting only
  what that side uses. Installers see an honest, minimal prompt. Costs N
  registrations, N keys, N rotations.

Choose on whether the install prompt is part of your adoption story. If
independent parties must be persuaded to install, the narrower prompt is worth
real operational cost.

Token down-scoping limits runtime authority but **does not change the prompt**.

## Key custody: exposure vs impact

Two different things, routinely conflated:

- **Exposure surface** — how many trust domains hold a copy of the key
- **Compromise impact** — what an attacker gets from any one of them

A shared App key always carries whole-App impact: whoever reads it can mint
tokens for **every** installation. Concentrating the key reduces how many places
can leak it; it does not reduce what a leak costs.

| Pattern | Key lives in | Exposure | Impact |
|---|---|---|---|
| Workflow in every participating org | N orgs you don't administer | N domains | whole App |
| Central poller | 1 domain you control | 1 domain | whole App |
| One App per org | N orgs, N keys | N domains | **one org each** |

Only per-org Apps genuinely contain damage, because the keys differ. Everything
else is exposure reduction.

Realistic threats to a key in CI: a **trusted writer** editing a default-branch
workflow to print it, a **compromised action or runner** in the consuming job,
and ordinary secret sprawl. Fork-triggered workflows do **not** receive secrets,
so "someone forks it" is not the threat.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll make it public later if needed." | Nobody can install it meanwhile, and you will debug the install list instead of the design. Decide at registration. |
| "Public means listed on Marketplace." | It means installable by other accounts. No listing, no review. |
| "One token can cover all our orgs." | One installation, one token. Enumerate installations and mint per owner. |
| "The App is installed, so it holds our key." | Installing grants access. Only the operator holds the key. |
| "Down-scoping the token narrows the prompt." | The prompt reflects registration-time permissions. Only a narrower App changes it. |
| "Installation tokens can't resolve `viewer`." | They can, and it returns the `[bot]` form. |

## Red Flags

- An App registered `public: false` that other orgs are expected to install
- Permission sets chosen for convenience rather than justified one line at a time
- `create-github-app-token` without `owner` used where cross-repo access is assumed
- `/app/installations` consumed without pagination
- Author comparison against a login that might carry `[bot]`
- A private key present in any repository, temp file, or log line
- An App registered in whichever org the operator happens to administer, rather
  than the one that owns the system

## Verification

- [ ] Unauthenticated `GET /apps/<slug>` returns 200 — if 404, it is private
- [ ] Owner is the org that should own the system, not the convenient one
- [ ] Each requested permission is justifiable in one sentence to an installer
- [ ] `GET /app/installations` paginated, and every expected org appears
- [ ] An installation token was minted and exercised the real mutations
- [ ] Provenance comparisons normalise `[bot]`
- [ ] Private key `0600`, outside the repo, never echoed
- [ ] Key rotation has a documented owner

## Sources

Verified via Context7 `/github/docs` and `/actions/create-github-app-token`,
plus live execution against a real installation. Re-verify before trusting any
API shape here.
