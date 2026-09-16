# Metrics & Prior Art — what already exists, and is the dashboard buildable?

> Research date: **2026-09-16**. Every URL below was fetched on that date unless a different date is stated inline.
> Source discipline: official docs, live schemas, public LF/CNCF repos, and foundation-owned sites only. Claims that could not be traced to a primary source are marked **UNVERIFIED**.
> Subject: the archived proposal at `docs/proposal-2024-killen.md` (Bob Killen, created 2023-10-14, last changelog entry 2024-09-05).

## Bottom line

1. **The named blocker is gone.** LFX Insights ingests GitHub Discussions today as first-class `discussion-started` / `discussion-comment` Collaboration activity — **VERIFIED-CLEARED**.
2. **The dashboard still is not buildable as specified.** Insights tracks no reactions/upvotes (the proposal's ranking signal), has no CNCF member-tier dimension, and has no public API — the public API is an explicit *draft plan* and requires an API key plus a closed-alpha allowlist.
3. **Member orgs and tiers are solved.** `cncf/landscape` `landscape.yml` plus the daily-generated `landscape.cncf.io/data/stats.json` give 722 members across six named tiers, free and machine-readable.
4. **Affiliation data got worse, not better.** DevStats now ships an official banner saying its contribution counts are undercounted; the live login→employer source of record is LFX My Profile (openprofile.dev), which has no verified public API.
5. **The sync App is greenfield.** No maintained issue↔discussion sync App/Action exists; GitHub's native "convert issue to discussion" closes the issue and cannot cross repos, and cross-repo discussion creation provably needs an App/PAT.

---

## 1. LFX Insights and GitHub Discussions — verdict

### Verdict: **VERIFIED-CLEARED** (for the literal blocker), with three residual gaps that block the proposal's actual dashboard

The proposal's Stage 2 line reads: *"Engage LFX for metrics / dashboard implementation … NOTE: Blocked by ingestion of GitHub discussion metrics."* That ingestion now exists.

**Evidence — open-source code.** `linuxfoundation/insights` (MIT; relaunched and open-sourced June 2025) defines, in the block commented `// The ones below are for Github`:

```ts
ISSUE_COMMENT = 'issue-comment',
DISCUSSION_STARTED = 'discussion-started',
DISCUSSION_COMMENT = 'discussion-comment',
```

- https://raw.githubusercontent.com/linuxfoundation/insights/main/libs/types/src/activity-types.ts (fetched 2026-09-16)
- Repo: https://github.com/linuxfoundation/insights

**Evidence — production documentation.** The live "Code contributions & Collaborations" page lists, under *Tracked Collaboration types → GitHub*:

> `discussion-started` – Started a new GitHub Discussion.
> `discussion-comment` – Commented on a discussion.

- https://insights.linuxfoundation.org/docs/introduction/contributions/
- Source: https://raw.githubusercontent.com/linuxfoundation/insights/main/frontend/docs/introduction/contributions/index.md

**Ingestion platform.** The upstream collector is the LFX Community Data Platform, formerly crowd.dev, Apache-2.0, acquired by the Linux Foundation in April 2024 — https://github.com/CrowdDotDev/crowd.dev (now serves as `linuxfoundation/crowd.dev`).

**Coverage caveat.** Insights states it covers "1,000+ open source projects hosted by the Linux Foundation", tracks **public repositories only**, and warns that "the majority of our data sources require privileged access." A new CNCF feedback org would need onboarding (requested via https://github.com/linuxfoundation/insights/discussions/categories/project-onboardings).

- https://insights.linuxfoundation.org/docs/introduction/what-is-insights/
- https://insights.linuxfoundation.org/docs/introduction/data-sources/

### The three gaps that still block the proposal's dashboard

**(a) No reactions or upvotes — the proposal's core ranking signal is not ingested.**
The proposal states *"Posts can be upvoted to signal priority"* and asks the dashboard to show *"rank"*. `ActivityTypes` contains no reaction, upvote, or vote member (full enum fetched 2026-09-16). A repo-wide code search for `reaction` in `linuxfoundation/insights` returns exactly two hits, both incidental substring matches on the Vue component `LfxShareActions` — no reaction feature exists. **Upvote/rank metrics would have to be collected independently of LFX Insights.**

**(b) No CNCF member-tier dimension.** Insights surfaces contributor and organization affiliation ("see contributor affiliations and organization-level insights"), but no membership-tier filter appears anywhere in its documentation or configuration. Filtering engagement by Platinum/Gold/Silver/End User is **not a feature of Insights**; it would have to be joined externally against the landscape data in §3. (Stated as not-found; I did not find a doc that denies it, so treat "never" as UNVERIFIED.)

**(c) No public API — this is the hard one.** The API architecture doc in the repo is explicit:

> "Draft plan for review. Not yet broken out into Jira tickets."
> "Today, all `/api/*` endpoints live inside the Nuxt frontend … They were designed as **internal** endpoints for the insights UI: Authenticated via Auth0 OIDC cookie (browser session) or a single shared Bearer secret … No per-customer concept, no usage tiers, no SLAs, no public documentation, no contract guarantees."

- https://raw.githubusercontent.com/linuxfoundation/insights/main/api/docs/arch/PUBLIC_API_PLAN.md

And the governing decision for the planned API:

> "All endpoints, including those that expose public project data (Endpoint Groups 1–4), require a valid API key. There is no unauthenticated access path."

- ADR-0009: https://raw.githubusercontent.com/linuxfoundation/insights/main/api/docs/arch/adr/0009-api-key-required-for-all-requests.md
- Plan also defines a *closed-alpha org allowlist* for `/v1-alpha`; keys from non-allowlisted orgs receive 403 (task T-089).

**⇒ A Feedback Discussion Dashboard cannot be built on top of an LFX Insights public API today.** Options are: (i) partner directly with the Insights team for a bespoke view, (ii) query the GitHub GraphQL API directly for discussion metrics and join affiliation/tier yourself, or (iii) wait for the public API to leave draft.

### Do not confuse "Community Voice" with Discussions

Insights has a **Community Voice** tab on project pages. Its in-product attribution is "Community Voice data powered by Octolens" (`links.octolens = 'https://octolens.com/'`), i.e. third-party social listening / sentiment — **not** GitHub Discussions.

- https://raw.githubusercontent.com/linuxfoundation/insights/main/frontend/app/config/links.ts
- Components: `frontend/app/components/modules/project/components/community/sections/{filter-area,results-area}.vue`

---

## 2. Affiliation sources named in the proposal — status in 2026

The proposal names four: **devstats**, **gitdm**, **devprofile**, **GitHub Profile**.

| Source | Live 2026-09-16? | Queryable? | Notes |
|---|---|---|---|
| **DevStats** — https://devstats.cncf.io | Yes | Yes — REST API at https://devstats.cncf.io/api/v1 | **Now carries an official accuracy warning.** |
| **cncf/gitdm** — https://github.com/cncf/gitdm | Yes | Yes — flat files in a public repo | Email→employer, not login→employer. |
| **"devprofile"** → **LFX My Profile** — https://openprofile.dev | Yes | **No public API verified** | Authoritative but gated. |
| **GitHub profile `company`** | Yes | Yes (REST/GraphQL) | Self-declared free text; reliability UNVERIFIED. |

### DevStats — live, but self-declared undercounting (new since the proposal)

The DevStats landing page now opens with:

> ⚠️ **Data accuracy warning:** DevStats uses the public GH Archive dataset, which is missing a significant number of GitHub events (notably in recent months), so contributions data shown here is undercounted. Please do not treat those numbers as 100% accurate or complete, see cncf/devstats#147 for details.

- https://devstats.cncf.io/ (fetched 2026-09-16)
- Provenance: https://github.com/cncf/devstats/issues/147 — opened **2026-08-11** by @BenTheElder ("the gh archive dataset is missing a LOT of events this year… We know people are making decisions based on this data"), banner shipped and issue closed **2026-08-26** by @lukaszgryglicki. DevStats also completed an infrastructure switchover in that window.
- API docs: https://github.com/cncf/devstatscode#api
- Scope as of 2026-09-16: Graduated 39, Incubating 37, Sandbox 152, Archived 27, Merged 1.

**Implication for the proposal:** DevStats-derived affiliation seeding still works (affiliation mapping is unaffected by event loss), but any *engagement volume* metric sourced from DevStats is now officially unreliable. Do not build the dashboard's counting layer on DevStats.

### cncf/gitdm — live, email-keyed, batch-synced

- https://github.com/cncf/gitdm (README fetched 2026-09-16)
- "This repository is used as a source of affiliations for all DevStats projects."
- "*New affiliations are imported into DevStats about once per 4 weeks.*"
- Final artifact: **https://github.com/cncf/devstats/blob/master/github_users.json** — "The final affiliations JSON … is periodically imported by the DevStats project."
- Mapping files: `src/cncf-config/email-map` (direct email→employer), `src/github_users.json`, `developers_affiliations{1..10}.txt` (hand-edited), `company_developers{1..12}.txt` (computed derivatives).
- Requires **current *and* historical* emails**, because it processes GH Archive events as-of-time.
- Opt-out path documented: https://github.com/cncf/gitdm/blob/master/FORBIDDEN_DATA.md

### "devprofile" is now LFX My Profile / openprofile.dev

The page title at https://openprofile.dev/ is literally *"Individual Dashboard | The Linux Foundation"*, product label "LF My Profile", docs link `https://docs.linuxfoundation.org/lfx/my-profile`.

Querying the LF docs directly (GitBook `?ask=` endpoint, https://docs.linuxfoundation.org/lfx/my-profile.md, 2026-09-16):

- **Employer affiliation:** connecting LinkedIn populates work history and "the dashboard uses that employment history to affiliate your open-source contributions"; users also manage **Current Organization** under Settings → Basic Information. (Sources: `/lfx/my-profile/profile.md`, `/lfx/my-profile/settings/update-profile-information.md`, `/lfx/my-profile/settings/my-work-history.md`)
- **GitHub identity:** "The dashboard supports linking GitHub accounts for contribution claiming, and it ties displayed contributions to the usernames/email addresses you use after linking."
- **Public API:** *"I cannot find information in the docs that confirms whether employer/affiliation data from the Individual Dashboard is available publicly via an API."* → **UNVERIFIED / assume not public.**

### Recommended current source for GitHub login → employer

**For anything you must run yourself today: `https://github.com/cncf/devstats/blob/master/github_users.json`**, refreshed from `cncf/gitdm` roughly every 4 weeks. It is the only machine-readable, publicly-fetchable, GitHub-login-keyed affiliation artifact in the CNCF estate.

Everything better (LFX identity resolution, LinkedIn-derived work history, self-asserted current organization) lives behind LFX authentication and would require an LF partnership, not a public fetch. The proposal's 2024 sequencing — "seed from devstats, and new users pull from devprofile, or GitHub Profile as a fallback" — is still directionally right, but note the 4-week staleness and that the devprofile leg needs an LF data agreement, not an API call.

---

## 3. CNCF members and tiers as machine-readable data — **YES**

### The file

**https://github.com/cncf/landscape/blob/master/landscape.yml** — 1,144,432 bytes as of 2026-09-16 (verified via https://api.github.com/repos/cncf/landscape/contents/). Licensed Apache-2.0, with the landscape and `landscape.yml` alternatively available under CC-BY-4.0; Crunchbase-derived data is carved out (see repo README). Regenerated into the site daily.

> **Practical warning:** the file exceeds GitHub code search's file-size index limit, so `search_code`/`gh search code` silently returns zero hits for member names. Fetch the raw file or use git. Naive HTTP readers may also truncate it.

### Proof of the member data and the exact field names

From the merged PR **cncf/landscape#5066, "Member updates 8.27.26"** (merged **2026-09-11**, commit `add2c18b14d9366b1c10268ad85af552ec5766ad`, commit body "Add new members to landscape.yml"), diff hunk at `landscape.yml:15075`:

```yaml
          - item:
            name: centron (member)
            homepage_url: https://www.centron.de
            logo: centron.svg
            crunchbase: https://www.crunchbase.com/organization/centron-3fff
            joined: '2026-09-01'
```

and at `landscape.yml:16839`:

```yaml
          - item:
            name: PatapscoAI (member)
            homepage_url: https://patapsco.ai
            logo: patapscoai.svg
            crunchbase: https://www.crunchbase.com/organization/patapsco-ai
            joined: '2026-09-01'
```

**Exact field names you asked for:**

| What you want | Field | Notes |
|---|---|---|
| Organization name | `name` | Convention: member entries are suffixed `" (member)"` to disambiguate from the same company's product entry elsewhere in the landscape. **Strip that suffix before matching.** |
| **Membership tier** | **none — it is the enclosing `subcategories[].name`** under `categories[].name: CNCF Members` | Tier is *structural*, not a field. Parse the YAML tree, do not grep for a `tier:` key. |
| End-user flag | `enduser` (boolean, item level) | Optional per-item override; otherwise derived from the tier subcategory (see below). |
| Join date | `joined` | `'YYYY-MM-DD'` string. |
| Others | `homepage_url`, `logo`, `crunchbase`, `description`, `extra.*` | |

Schema of record (the `$schema` reference at the top of `landscape.yml`):
- https://github.com/cncf/landscape2/blob/main/docs/config/data.yml — documents `categories[].name`, `categories[].subcategories[].name`, `items[].name`, `items[].homepage_url`, `items[].logo`, `items[].joined` ("Date at which the member joined the foundation… only expected on items that represent a foundation's member"), `items[].enduser` ("Indicate if the item corresponds to an end user… must be a boolean").
- JSON Schema: https://raw.githubusercontent.com/cncf/landscape2/refs/heads/main/docs/config/schema/data.schema.json

### The tier vocabulary (authoritative, and different from the proposal)

From https://raw.githubusercontent.com/cncf/landscape2-sites/main/cncf/settings.yml (fetched 2026-09-16):

```yaml
categories:
  - name: CNCF Members
    subcategories:
      - Platinum
      - Gold
      - Silver
      - End User Supporter and Contributor
      - Nonprofit
      - Academic
...
enduser:
  - category: CNCF Members
    subcategories:
      - End User Supporter and Contributor
...
groups:
  - name: Members
    alias: members
    categories:
      - CNCF Members
```

**The proposal's tier list is stale.** It lists "All Tiers / Platinum / Gold / Silver / Supporter / Academic". The real vocabulary has `End User Supporter and Contributor` (not "Supporter") and adds `Nonprofit`. The proposal's separate "CNCF End Users" datapoint is satisfied by the `enduser` mapping above — end users are not a parallel list, they are a tier.

### Public machine-readable endpoints (no auth, no scraping)

`landscape2 build` emits datasets to `data/` (`crates/cli/src/build/mod.rs` writes `full.json`; `crates/wasm/overlay/src/lib.rs` hardcodes `const FULL_DATASET_PATH: &str = "data/full.json"`). On the CNCF site:

- **https://landscape.cncf.io/data/stats.json** — small, ideal for tier counts. Fetched 2026-09-16:

```json
"members": {
  "members": 722,
  "subcategories": {
    "Academic": 3,
    "End User Supporter and Contributor": 76,
    "Gold": 17,
    "Nonprofit": 24,
    "Platinum": 19,
    "Silver": 583
  }
}
```
  It also carries `members.joined_at` and `members.joined_at_rt` monthly time series from 2015-11 to 2026-09.

- **https://landscape.cncf.io/data/full.json** — the full item dataset the web app itself loads (`ui/webapp/src/utils/itemsDataGetter.ts`). Large; use for the actual org→tier mapping if you do not want to parse YAML.

**⇒ Building "filter this discussion's participants by CNCF member tier" needs no LF partnership at all** — it needs `landscape.yml`/`full.json` for org→tier, and a login→org mapping from §2. The tier half is the easy half; the affiliation half is the hard half.

---

## 4. Prior art — issue ↔ discussion sync

### GitHub's native capability does not implement the proposal's model

Converting an issue to a discussion is built in, but it is **one-way, terminal, and same-repo**:

> **`converted_to_discussion`** — "The issue was **closed** and converted to a discussion. This event is available for issues."
> — https://docs.github.com/en/rest/using-the-rest-api/issue-event-types

> "If you have triage permissions for a repository, you can help moderate that repository's discussions by … converting issues to discussions when an idea is still in the early stages of development."
> — https://docs.github.com/en/discussions/managing-discussions-for-your-community/moderating-discussions

(Retrieved via Context7, library ID **`/websites/github_en`**, 2026-09-16; each snippet carries its docs.github.com source URL above.)

The proposal requires the source issue to **stay open and stay owned by the project**, with a mirrored discussion in a *different org*. Native conversion does neither. **It is not a shortcut; it is a different feature.**

### The cross-repo constraint you will hit on day one

Documented by GitHub's own `github-community-projects` org:

> "**`GITHUB_TOKEN` only works when the discussion is created in the same repository the workflow runs in.** If `repository-id` points at a different repository, the GraphQL call returns `Resource not accessible by integration` regardless of the declared permissions. To post a discussion in another repository, use one of: …"
> — https://github.com/github-community-projects/contributors (README)

**⇒ The proposal's topology (project repo → central feedback org) rules out `GITHUB_TOKEN`. Cross-repo discussion creation needs a GitHub App installation token or a PAT, and since this project forbids PATs, the *identity* must be an App installation.** That is a statement about the **credential, not the runtime**: a plain Actions workflow can mint a cross-owner installation token via [`actions/create-github-app-token`](https://github.com/actions/create-github-app-token) (`owner:` plus optional `repositories:`), so Actions-as-carrier with App-as-identity remains available. The carrier choice belongs to [#6](https://github.com/cncf/feedback-app/issues/6) and should turn on inbound webhooks and latency — an Action cannot receive `discussion` events for a repo it does not live in — not on the credential.

### What exists that you could reuse

| Thing | What it does | Licence / state | URL |
|---|---|---|---|
| **`abirismyname/create-discussion`** | GitHub Action; creates a discussion via the GraphQL `createDiscussion` mutation given `repository-id` + `category-id`. **One-shot creator, not a sync.** Actively referenced, including by `github-community-projects`. | Licence **UNVERIFIED** (not fetched); repo id 468492223, live 2026-09-16 | https://github.com/abirismyname/create-discussion |
| `matrix-org/matrix-hookshot` | Bridges GitHub webhooks (incl. `issues.opened`, `IssuesLabeledEvent`) to Matrix. Nearest maintained "label an issue → mirror it elsewhere" art; wrong destination. | Apache-2.0 | https://github.com/matrix-org/matrix-hookshot |
| `wesleyscholl/discussion-auto-responder` | Auto-responds inside discussions. Adjacent, not sync. | Licence UNVERIFIED | https://github.com/wesleyscholl/discussion-auto-responder |
| `giscus` pattern | Uses Discussions as a comment backend for static sites. Different problem. | — | — |

### What does **not** exist

**No actively-maintained, general-purpose issue↔discussion sync App or Action was found.** Searches run 2026-09-16 via the GitHub MCP tools:

- `search_repositories`: `issue-to-discussion OR discussion-sync OR sync-discussions in:name` → 5 results, all unrelated, archived, or throwaway test repos (`kekekeks/test-repo-to-check-issue-discussion-interaction`, `joblib/test-convert-discussion-to-issue`, etc.).
- `search_repositories`: `topic:github-discussions sync` → 1 result, a Giscus-based static site.
- `search_repositories`: `github issue to discussion sync` → 3 results, none relevant.
- `search_code`: `"createDiscussion" "issues" "labeled" language:TypeScript` → 28 results, all generated GraphQL type definitions, unrelated bridges, or ad-hoc agent workflows. No sync bot.
- `search_code`: `"abirismyname/create-discussion"` → 100 results, all *consumers* of that Action (release notes, contributor "thank you" posts). Confirms it is the de-facto community primitive for programmatic discussion creation.

**GitHub Marketplace: UNVERIFIED.** `https://github.com/marketplace?type=apps` requires authentication/JS for search; I could not enumerate listings from the primary source and will not guess. Worth a manual check by a signed-in human before committing to build.

**⇒ Plan to build the Issue-Discussion Sync App from scratch.** The only reusable pieces are the `createDiscussion` GraphQL mutation shape and the webhook plumbing pattern. Budget accordingly; there is nothing to fork.

---

## 5. Prior art — centralized cross-project feedback at other foundations

### Apache Software Foundation — **YES, and it is the closest analogue**

One Jira instance covers every ASF project:

> "The ASF and many of its projects use Jira to keep track of work to be done."
> "**Any person with an ASF Jira account can open a ticket for any ASF project.**"
> — https://infra.apache.org/jira-guidelines.html (© 2026, fetched 2026-09-16); tracker at https://issues.apache.org/jira

**The cautionary tale is in the same document, and it is the single most relevant prior-art lesson for this proposal:**

> "In November, 2022, due to an influx of false Jira accounts creating a flood of spam tickets, **Infra ended public signups to ASF Jira accounts.**"

Accounts are now requested through a self-serve portal and **approved or rejected by the PMC of the project the requester names**:
- https://selfserve.apache.org/jira-account.html
- Policy: https://infra.apache.org/jira-approve-account.html
- Rationale blog: https://infra.apache.org/blog/jira-public-signup-disabled.html

Confirmed live 2026-09-16: `https://issues.apache.org/jira/secure/Dashboard.jspa` renders "Public signup for this instance is disabled. Go to our Self serve sign up page to request an account."

**Read-across:** the proposal's "Engaging the Wrong Audience" risk is not hypothetical. A single low-friction front door for 175+ projects became a spam magnet within a few years and had to be gated at the identity layer. GitHub accounts are harder to mint at scale than Jira accounts, which helps — but the moderation burden the proposal assigns to "aggressive moderation" is a real, recurring staffing cost, and ASF chose identity gating over moderation headcount.

Secondary ASF surface: **https://lists.apache.org** — a single central Ponymail archive across all list domains. Note it is an *archive*; participation is still per-project mailing lists. A central read surface over decentralized write surfaces is a materially cheaper design than a central write surface, and worth considering as an alternative shape.

### Eclipse Foundation — **NO, and it used to; the central forum was shut down**

`https://www.eclipse.org/forums/` (fetched 2026-09-16) returns:

> **Service has been shutdown.**
> "The Eclipse Foundation service you are trying to reach has been shutdown. If you're looking for project specific information, try searching for the Eclipse Project and looking at the Developer Resources tab."
> (redirects toward https://projects.eclipse.org/)

**Read-across:** Eclipse ran exactly the thing this proposal proposes — one forum, many projects — and retired it in favour of per-project developer resources. The "Lack of Engagement" risk in the proposal is the failure mode that actually killed a peer foundation's central surface. This is the strongest available evidence that the central-surface bet is not free, and it argues hard for the proposal's own mitigation: seed with committed projects and named end users *before* going wide.

### OpenJS Foundation — **initiative exists, dormant since 2021**

- https://github.com/openjs-foundation/user-feedback — "OpenJS Foundation initiative to facilitate user feedback surveys for projects", created 2020-01-07.
- README in full: `# OpenJS Foundation User Feedback Initiative` / `TODO: update after move to OpenJS Foundation Github Org.`
- 3 issues total (fetched 2026-09-16): #2 "Node.js unhandled Promise rejections" (closed, last touched 2022-01-14), #6 "Translation for surveys ?" (open, 2021-03-25), #3 "make sure surveys go to member companies" (open, 2020-05-28).

**Read-across:** approach was *surveys*, not a persistent discussion surface — and note issue #3, "make sure surveys go to member companies": OpenJS hit the same member-targeting requirement this proposal encodes as tier filtering. It has been dormant for ~4.5 years. Cross-project feedback initiatives die quietly.

### OpenSSF — **none found**

Repository search `org:ossf feedback` (2026-09-16) returned no central feedback surface. OpenSSF organizes by working-group repos under https://github.com/ossf. **UNVERIFIED that no such surface exists** — none was discovered, which is not the same as proving absence.

---

## What this means for the 2026 design conversation

1. **Stop citing the LFX ingestion blocker.** It cleared. Cite instead: *no public Insights API, no reactions/upvotes, no member-tier dimension.* Those are the live constraints, and they are different in kind — they are product-scope gaps, not pipeline gaps, so "wait for LFX" is no longer the right posture.
2. **The dashboard is buildable without LFX**, using three public inputs: GitHub GraphQL for discussion/reaction/comment data, `landscape.cncf.io/data/full.json` for org→tier, and `cncf/devstats/github_users.json` for login→org. The weak link is affiliation coverage, exactly as the proposal's "Unreliable Affiliation Data" risk predicted — and DevStats has since gotten *less* reliable, not more.
3. **The sync App is a real build.** No prior art, and cross-org discussion creation forces a GitHub App with an installation on every participating project org.
4. **Update the tier vocabulary** in any spec: `Platinum, Gold, Silver, End User Supporter and Contributor, Nonprofit, Academic` — 722 orgs, of which 76 are end users.
5. **Weigh Eclipse's shutdown and Apache's spam gate before committing to a central org.** One peer foundation retired this exact design; another kept it and paid for it with identity gating. Both outcomes are documented above and both are within the proposal's own stated risk register.

---

## Unverified / open items

- GitHub Marketplace app listings for discussion sync — could not enumerate from the primary listing (auth/JS required).
- Whether LFX Insights will ever expose a member-tier filter — not documented either way.
- Whether LFX My Profile affiliation is reachable via any API under an LF data agreement — LF docs do not say.
- `abirismyname/create-discussion` licence — not fetched.
- Whether OpenSSF operates any central feedback surface — searched, none found, absence not proven.
