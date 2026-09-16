# Hosting and cost: the feedback-loop sync receiver

**Research date: 2026-09-16.** All GitHub documentation retrieved from `docs.github.com` on 2026-09-16. Cloudflare pricing retrieved 2026-09-16 from `developers.cloudflare.com`; the Workers pricing page self-reports "Last updated Aug 28, 2026" and the limits page "Last updated Sep 5, 2026". Volume figures measured live against `api.github.com` on 2026-09-16.

---

## Bottom line

1. **Verdict: GITHUB-ONLY POSSIBLE (poll only).** No GitHub-operated surface can receive and act on an inbound webhook POST — the decisive blocker is that a GitHub App webhook cannot be aimed at `api.github.com/repos/{owner}/{repo}/dispatches`, because deliveries carry a fixed header set with **no `Authorization` header** and a fixed body with **no `event_type` field**.
2. **But a receiver is not required.** An `on: schedule` workflow in the hub repo polling installations via GraphQL search costs **1 point per installation per sweep against a ≥5,000-point/hour per-installation budget — 0.24% utilisation** at the documented 5-minute floor. Polling is cheap, not rate-limit-constrained.
3. **Cloudflare at 25 projects: $0/month** (free plan) or **$5.00/month** (Workers Paid). Estimated ~24,310 deliveries/month ≈ 799/day, against a free-tier allowance of 100,000/day.
4. **Cloudflare at 175 projects: $0/month** (free plan) or **$5.00/month** (Workers Paid). Estimated ~126,210 deliveries/month ≈ 4,148/day — **4.1% of the free daily allowance**, a 24× headroom.
5. **Cost is not the deciding factor; operational obligations are.** GitHub **does not automatically redeliver failed deliveries**, gives the receiver **10 seconds** to return 2XX, and retains deliveries for redelivery for only **3 days**.

---

## Part A — Can this be hosted entirely on GitHub?

### A.1 Every GitHub primitive that could conceivably receive an inbound POST

| Primitive | Can it accept an inbound webhook POST? | Verdict | Source |
|---|---|---|---|
| **GitHub Pages** | No. "GitHub Pages is a static site hosting service that takes HTML, CSS, and JavaScript files straight from a repository." No server-side execution, no request handler. | **OUT** | [What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) |
| **Actions — GitHub-hosted runners** | No. Each runner is "a new virtual machine (VM) hosted by GitHub" that exists only for the duration of a job. There is no stable hostname, no public DNS record, no ingress route, and no process between runs. Inbound ICMP is blocked on the Azure VMs. | **OUT** | [GitHub-hosted runners](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners) |
| **Actions — self-hosted runners** | Technically you could run a listener on the box, but a self-hosted runner is by definition "a system that you deploy and manage". That is CNCF-operated third-party infrastructure, which fails the premise of the question. | **OUT (fails premise)** | [Self-hosted runners](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners) |
| **Actions cache** | No public HTTP ingress. Default 7-day retention, 10 GB per-repository allowance with eviction. Neither a listener nor durable state. *(Established earlier in this workstream; corroborated by the 10 GB per-repository cache allowance in [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).)* | **OUT** | as above |
| **Actions artifacts** | Storage only, written by and read from workflow runs. No inbound HTTP handler. | **OUT** | [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| **Codespaces port forwarding** | **Technically yes, operationally no.** See A.2 below — this is the only GitHub surface that can genuinely receive an unauthenticated inbound POST, and it disqualifies itself on lifetime. | **OUT** | [Forwarding ports](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace) |
| **GitHub Packages** | No. "A software package hosting service" exposing npm/RubyGems/Maven/Gradle/NuGet/Docker registry protocols, authenticated with a classic PAT. No arbitrary request handling. | **OUT** | [Introduction to GitHub Packages](https://docs.github.com/en/packages/learn-github-packages/introduction-to-github-packages) |
| **Gists** | No. Gists are git repositories for storing snippets. No execution, no POST handler. | **OUT** | — |
| **The REST/GraphQL API as the webhook target** | **No — and this is the decisive finding.** See A.3. | **OUT** | see A.3 |
| **GitHub-hosted MCP server / Copilot surfaces** | No. The GitHub MCP server is "a Model Context Protocol (MCP) server provided and maintained by GitHub". It speaks MCP over HTTP and requires you to be signed in to GitHub or to present a valid PAT with the necessary scopes. It runs GitHub's code, not yours, and — like every other `api.github.com`-family endpoint — it cannot be reached by a webhook delivery that carries no `Authorization` header (A.3). | **OUT** | [Using the GitHub MCP Server](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/use-the-github-mcp-server) |

### A.2 Codespaces port forwarding, examined properly

This deserves detail because it is the one surface that *can* receive an unauthenticated POST.

**What works:**
- A forwarded port is reachable at `https://CODESPACENAME-PORT.app.github.dev`.
- Visibility can be set to **Public**, and: "After you make a port public, anyone who knows the URL and port number can view the running application **without needing to authenticate**."

**What disqualifies it:**
- **Idle timeout.** "By default, a codespace will timeout after 30 minutes of inactivity" and "If you do not explicitly stop a codespace, it will continue to run until it times out from inactivity." A codespace **cannot run indefinitely** without interaction. Nothing in the documentation indicates that inbound HTTP traffic to a forwarded port counts as activity for the purpose of the idle timer — treat that as **unverified**, but the design cannot rest on an undocumented behaviour.
- **Auto-deletion.** "Codespaces that have been stopped and remain inactive for a specified period of time will be deleted automatically. By default, inactive codespaces are deleted after 30 days."
- **Unstable hostname.** The codespace name is embedded in the URL, so recreating the codespace changes the webhook URL and requires reconfiguring the App.
- **HTTPS conflict.** "If you update a port with public visibility to use HTTPS, the port's visibility will automatically change to private." Public forwarded ports therefore cannot be switched to HTTPS forwarding.
- **Org policy.** "Organization owners can restrict the ability to make forwarded ports available publicly or within the organization."
- **It is not free.** "Only running codespaces incur CPU charges. A stopped codespace incurs only storage costs" and storage accrues "until it is deleted".

A receiver that stops itself every 30 minutes, deletes itself after 30 days, changes its address when recreated, and bills by the hour is not a receiver.

Sources: [Forwarding ports in your codespace](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace), [Understanding the codespace lifecycle](https://docs.github.com/en/codespaces/about-codespaces/understanding-the-codespace-lifecycle).

### A.3 Can the App webhook be pointed directly at `api.github.com` to fire `repository_dispatch`?

**No.** Verified, not assumed. Three independent blockers:

**(a) No `Authorization` header, and no way to add one.** GitHub documents the complete set of headers it sends with a webhook delivery:

> `X-GitHub-Hook-ID`, `X-GitHub-Event`, `X-GitHub-Delivery`, `X-Hub-Signature`, `X-Hub-Signature-256`, `User-Agent` (always prefixed `GitHub-Hookshot/`), `X-GitHub-Hook-Installation-Target-Type`, `X-GitHub-Hook-Installation-Target-ID`

plus `Content-Type` and `Content-Length`. There is no `Authorization` header and no configuration surface to add custom headers. GitHub additionally warns explicitly against the obvious workaround: "do **not** include sensitive information in your payload URL. This includes your own API keys and other authentication credentials." `POST /repos/{owner}/{repo}/dispatches` requires a bearer token; an unauthenticated POST returns 401.

**(b) Wrong body shape.** `POST /repos/{owner}/{repo}/dispatches` requires a JSON body containing a **required** `event_type` string (with optional `client_payload`). A webhook delivery body is the fixed event payload — for `issues` that is `action`, `issue`, `repository`, `sender`, and `installation`. There is no `event_type` key and no transformation step. Result: 422.

**(c) No payload transformation exists.** Even if (a) and (b) were solved, translating an `issues` payload into a dispatch payload *is* the relay's job. There is nowhere in GitHub to run that translation.

Sources: [Webhook events and payloads — Delivery headers](https://docs.github.com/en/webhooks/webhook-events-and-payloads), [Best practices for using webhooks](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks), [Create a repository dispatch event](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event).

### A.4 Can the design avoid needing a receiver at all? (Scheduled polling)

Yes. This is the viable GitHub-only path.

#### Schedule granularity and reliability caveats

All from [Events that trigger workflows — `schedule`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows):

- **Minimum interval: 5 minutes.** "The shortest interval you can run scheduled workflows is once every 5 minutes."
- **Delays under load.** "The `schedule` event can be delayed during periods of high loads of GitHub Actions workflow runs. High load times include the start of every hour."
- **Runs can be dropped.** "If the load is sufficiently high enough, some queued jobs may be dropped." Mitigation: schedule off the hour (e.g. `7,17,27,37,47,57 * * * *`).
- **Auto-disable after inactivity.** "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days." **This is the single most dangerous property of the poll design** — a quiet hub repo silently stops syncing. Mitigation: the hub repo receives discussion activity continuously in normal operation, but a heartbeat commit is cheap insurance.
- **Default branch only.** "Scheduled workflows will only run on the default branch."
- **Queue discards.** Separately, "a workflow run is discarded if it has not been queued within 30 minutes of being triggered" and a queued run "not processed by a GitHub-hosted runner within 45 minutes" is discarded ([GitHub-hosted runners](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners)).

Net: worst-case sync latency is roughly 5 minutes plus scheduling delay, and individual sweeps can be lost. Because each sweep queries by `updated:` window rather than consuming a queue, a lost sweep self-heals on the next one provided the window overlaps. Use a lookback window of ~3× the cadence.

#### Finding labelled issues across many installations in few calls

> **Correction incorporated.** An earlier framing of this comparison characterised polling as bounded by GitHub's 80/minute and 500/hour limits. Those are the **content-generating** limits and apply to *writes only*. A read-only polling sweep does not consume them. The real bounds are the ones costed below.

The efficient shape is **one GraphQL `search` query per installation per sweep**, scoped by the label and an `updated:` window:

```graphql
query($q: String!) {
  search(query: $q, type: ISSUE, first: 100) {
    nodes { ... on Issue { id number title url repository { nameWithOwner } } }
  }
}
```

**Point cost per query.** GitHub's documented prediction method: "Add up the number of requests needed to fulfill each unique connection... Divide the number by **100** and round... The minimum point value of a call to the GraphQL API is **1**." A single `search(first: 100)` connection is 1 request → 1/100 → rounds to 0 → **floored at 1 point**.

**The rate-limit formula for a GitHub App installation** ([REST](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [GraphQL](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api) — the formulas are identical, with separate buckets):

> 5,000 points/hour per installation, **+50 points/hour for each repository above 20**, **+50 points/hour for each organization user above 20**, capped at **12,500 points/hour**. (10,000/hour flat for installations on a GitHub Enterprise Cloud organization.)

Critically, this budget is **per installation**. 175 participating projects = 175 installations = 175 independent buckets.

#### Sweep arithmetic

Per-installation consumption, at the 5-minute floor (12 sweeps/hour), 1 query each:

| | Points/sweep per installation | Points/hour per installation | Smallest possible budget | Utilisation |
|---|---|---|---|---|
| Any scenario | 1 | **12** | 5,000/hour | **0.24%** |

That is the headline number: **polling consumes a quarter of one percent of the smallest per-installation budget.** The `kubernetes` org, having far more than 20 repos and 20 users, sits at the 12,500/hour cap — 0.1% utilisation. You could sweep every 5 seconds and still use only 14% of the floor budget; `on: schedule` simply will not let you.

Aggregate per sweep, which is what the *shared* secondary limits see:

| Scenario | Queries per sweep | Points/minute if fired as one burst | vs 2,000 points/min GraphQL secondary ceiling |
|---|---|---|---|
| 5 projects | 5 | 5 | 0.25% |
| 25 projects | 25 | 25 | 1.3% |
| 175 projects | 175 | 175 | **8.8%** |

GraphQL requests without mutations cost 1 point each against the secondary limit. Comfortable at every scale.

**The two secondary limits that actually need design attention:**

1. **100 concurrent requests**, shared across REST and GraphQL. Cap sweep fan-out at ~50 concurrent.
2. **"No more than 90 seconds of CPU time per 60 seconds of real time... No more than 60 seconds of this CPU time may be for the GraphQL API,"** where CPU time is roughly estimated by total response time. At 175 queries × ~0.3s ≈ 53s, firing the whole sweep as one burst reaches **~88% of the GraphQL ceiling**. Spreading the sweep across the 5-minute window (0.58 queries/second) drops this to ~10s per 60s ≈ 17%. **This is the one genuine constraint on the poll design, and it is a scheduling detail, not a blocker.**

#### Why GraphQL and not the REST search API

The REST search endpoints have their own limit: **30 requests/minute for authenticated requests** ([Search — Rate limit](https://docs.github.com/en/rest/search/search)). 175 installations × 1 query = 175 requests ÷ 30/min = **5 minutes 50 seconds per sweep** — which does not fit inside a 5-minute cadence. REST search also caps at 1,000 results per search, limits queries to 256 characters and 5 boolean operators, searches at most 4,000 repositories per query, and can return `incomplete_results: true` on timeout. **GraphQL is required at 175 projects; REST search is adequate only up to ~25.**

#### Actions minutes cost of polling

5-minute cadence = 288 runs/day = ~8,640 runs/month.

- **Public hub repo: $0.** "GitHub Actions usage is **free**... for **public repositories** that use standard GitHub-hosted runners."
- **Private hub repo:** billed per minute. At ≥1 minute per run, 8,640 minutes/month. Linux 2-core is **$0.006/min**. On GitHub Team (3,000 minutes included): (8,640 − 3,000) × $0.006 = **$33.84/month**. On GitHub Enterprise Cloud (50,000 included): $0, but it consumes 17% of the enterprise minute pool.

Source: [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), retrieved 2026-09-16. *(The per-run minute rounding behaviour is not stated in that document; the ≥1 minute/run assumption is marked **unverified** and is the conservative direction.)*

**A private-repo polling hub therefore costs ~$34/month — roughly 7× the Cloudflare relay.** A public hub repo costs nothing and is the obvious choice.

### A.5 Verdict

> ## **GITHUB-ONLY POSSIBLE (poll only)**

**Reasoning, in two sentences.** No GitHub-operated surface can receive and act on an inbound webhook POST: Pages is static, hosted runners have no ingress and no lifetime between jobs, self-hosted runners are by definition infrastructure you operate, Codespaces public ports self-terminate after 30 minutes of inactivity and change hostname on recreation, and the API itself cannot be the webhook target because deliveries carry a fixed header set containing no `Authorization` header and a fixed body containing no `event_type` field. However the design does not require a receiver at all — a scheduled workflow in the hub repo sweeping installations with one GraphQL `search` query each costs 1 point per installation per sweep against a per-installation budget of at least 5,000 points/hour, i.e. 0.24% utilisation at the documented 5-minute floor, so polling is fully viable on GitHub alone at the cost of ~5 minutes of latency and exposure to the 60-day scheduled-workflow auto-disable rule.

---

## Part B — Cloudflare Workers cost at realistic CNCF scale

### B.1 Event volume — the thing that actually drives cost

A GitHub App receives deliveries for **every subscribed event in every installed repository**, not only the labelled issues. Volume must be estimated from total `issues` activity, not from sync-worthy activity.

#### Method

Two measured inputs, multiplied:

**Input 1 — issues created per org per month.** Measured live against the GitHub search API on 2026-09-16, for the complete month 2026-08-01..2026-08-31 (31 days). Reproduce with:

```
GET https://api.github.com/search/issues?q=org:ORG+type:issue+created:2026-08-01..2026-08-31&per_page=1
```

| Scope | `total_count` | Issues/day |
|---|---|---|
| `repo:kubernetes/kubernetes` | 164 | 5.3 |
| `org:kubernetes` (whole org) | **529** | 17.1 |
| `org:envoyproxy` | **175** | 5.6 |
| `org:prometheus` | **86** | 2.8 |
| `org:openkruise` | **53** | 1.7 |

Org-level scope is the right unit: a GitHub App installed on an org is normally installed across all its repositories, so the App sees org-wide traffic. Note `kubernetes/kubernetes` alone is only 31% of its own org's issue volume.

**Input 2 — `issues` webhook deliveries per issue (the action multiplier).** The `issues` event fires for ~15 actions, not just `opened`. Measured from two real issue event streams via `GET /repos/{owner}/{repo}/issues/{n}/events`, adding 1 for the `opened` action (which does not appear in that endpoint):

| Issue | Events observed | Deliveries |
|---|---|---|
| `kubernetes/kubernetes#141731` | 5 × `labeled`, 1 × `unlabeled`, 3 × `renamed` (→ `edited`), 1 × `closed` | 10 + 1 = **11** |
| `envoyproxy/gateway#9903` | 2 × `labeled`, 1 × `unlabeled` | 3 + 1 = **4** |

Mean 7.5 → **multiplier of 8 deliveries per issue**. Both samples are floors (body edits fire `edited` but leave no issue-event record). Kubernetes is bot-heavy — Prow applies `needs-sig`, `needs-triage`, `sig/*` automatically — so 11 is near the top of the realistic range and 4 near the bottom. The sample size is small (n=2); the multiplier is labelled a **sampled estimate**, and sensitivity is checked in B.4.

#### Arithmetic

Monthly `issues` deliveries per org = issues created × 8:

| Tier | Exemplar | Issues/mo | × 8 = deliveries/mo |
|---|---|---|---|
| Mega | kubernetes | 529 | **4,232** |
| Large | envoyproxy | 175 | **1,400** |
| Mid | prometheus | 86 | **688** |
| Small | openkruise | 53 | **424** |

Scenario composition (stated assumption — CNCF has one mega project, a handful of large ones, and a long tail of sandbox projects):

| Scenario | Composition | `issues` deliveries/month |
|---|---|---|
| **5 projects** | 1 mega + 1 large + 1 mid + 2 small | 4,232 + 1,400 + 688 + 848 = **7,168** |
| **25 projects** | 1 mega + 3 large + 8 mid + 13 small | 4,232 + 4,200 + 5,504 + 5,512 = **19,448** |
| **175 projects** | 1 mega + 10 large + 50 mid + 114 small | 4,232 + 14,000 + 34,400 + 48,336 = **100,968** |

**Plus hub-side `discussion` events.** Budgeting worst case — every created issue gets synced, producing 1 `discussion.created` + 1 `discussion_comment.created`:

| Scenario | Issues created/mo | Hub events/mo | **Total deliveries/mo** | **Per day** |
|---|---|---|---|---|
| 5 | 896 | 1,792 | **8,960** | **295** |
| 25 | 2,431 | 4,862 | **24,310** | **799** |
| 175 | 12,621 | 25,242 | **126,210** | **4,148** |

### B.2 Event-subscription reduction, and the limits of server-side filtering

**Subscribe to `issues` only (plus `discussion` on the hub). Nothing else.** GitHub's own first piece of webhook advice is "Subscribe to the minimum number of events."

**How large is the saving?** Measured, not asserted. A snapshot of `GET /repos/kubernetes/kubernetes/issues/events?per_page=100` taken 2026-09-16 returned 30 events spanning 18:07:45Z–18:27:01Z — 19 minutes 16 seconds, i.e. **2.59 events/minute ≈ 3,731/day**. Every single one of those 30 events was on a **pull request**, not an issue (`subscribed`, `mentioned`, `review_requested`, `labeled`, `unlabeled`, `ready_for_review`, `head_ref_force_pushed`, `assigned`, `added_to_project_v2`, `project_v2_item_status_changed`). Not all map 1:1 to webhook events, but the order of magnitude is the point: **adding a `pull_request` subscription on this one repository would roughly double the total traffic of all 175 projects combined** (3,731/day vs 4,148/day). Subscribing narrowly is worth more than any other single cost lever.

**Is finer-than-event-type filtering available? No — verified.** A GitHub App's subscription surface is a list of *event types*, gated by permissions: "if you would like your app to receive a webhook event payload whenever a new issue is opened... you would first need to give your app permission to access 'Issues' under 'Repository permissions.' Then under 'Subscribe to events' you can select 'Issues.'" There is no `action`-level filter. GitHub confirms that filtering is the receiver's job: "Your application should check the event type and action of a webhook payload before processing the payload. To determine the event type, you can use the `X-GitHub-Event` request header. To determine the action type, you can use the top-level `action` key in the event payload."

**This is precisely why the multiplier is 8× and not 1×.** The relay receives all ~15 `issues` actions and discards ~7 of every 8 deliveries itself.

Sources: [Using webhooks with GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/using-webhooks-with-github-apps), [Best practices for using webhooks](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks).

### B.3 Current Cloudflare Workers pricing

From [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/) (page last updated **Aug 28, 2026**) and [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) (page last updated **Sep 5, 2026**), both retrieved 2026-09-16:

| | Requests | Duration | CPU time |
|---|---|---|---|
| **Free** | **100,000 per day** (resets midnight UTC) | no charge | **10 ms per invocation** |
| **Workers Paid (Standard)** | **10 million included/month**, then **$0.30 per additional million** | no charge or limit | **30 million CPU-ms included/month**, then **$0.02 per additional million CPU-ms**; 30s default per invocation, raisable to 5 min |

- Workers Paid base: **"a minimum charge of $5 USD per month for an account"**, which includes Workers, Pages Functions, Workers KV, Hyperdrive and Durable Objects usage.
- **No data-transfer or bandwidth charges.**
- Cloudflare does not bill for subrequests the Worker makes (so the outbound `repository_dispatch` call is free).
- Exceeding the free daily limit returns **Error 1027**; routes can be configured **fail open** (bypass the Worker) or **fail closed** (return the 1027 error page).
- "The average Worker uses approximately 2.2 ms per request. Heavier workloads that handle authentication... typically use 10-20 ms."

### B.4 Does the relay need KV or Durable Objects?

**No. Explicitly: a near-stateless relay that validates a signature and fires `repository_dispatch` needs neither.**

- **Signature validation** is HMAC-SHA256 over the raw body using a secret held in an environment variable (Free: 64 variables/Worker, 5 KB each). Stateless.
- **Firing `repository_dispatch`** is one `fetch()`. Stateless.
- **Deduplication / replay protection** would need state — but it should not live in the relay. See B.6: GUID-based dedup actively breaks intentional redeliveries. Idempotency belongs in the hub workflow, which must check whether a discussion already exists for a given issue regardless (it needs that for the redelivery-recovery path anyway).
- **Optional only:** caching the App installation access token (1-hour TTL) in Workers KV to save one round-trip. That is ~24 writes/day — far inside the free KV allowance of 1,000 writes/day and 100,000 reads/day, and inside the paid plan's included 1M writes / 10M reads. It changes the cost by **$0**.

Durable Objects pricing is therefore **not applicable** and is excluded from the cost table. *(For reference if the design later grows state: DO is 100,000 requests/day + 13,000 GB-s/day on Free; 1M requests/month + $0.15/million and 400,000 GB-s/month + $12.50/million GB-s on Paid.)*

### B.5 Cost table

Assuming ~5 ms CPU per invocation (HMAC-SHA256 verification, JSON parse, RS256 App-JWT signing, one `fetch()`; network wait does **not** count as CPU time):

| Scenario | Deliveries/mo | Deliveries/day | % of free daily cap | **Free plan** | **Workers Paid** |
|---|---|---|---|---|---|
| **5 projects** | 8,960 | 295 | 0.3% | **$0.00** | **$5.00** |
| **25 projects** | 24,310 | 799 | 0.8% | **$0.00** | **$5.00** |
| **175 projects** | 126,210 | 4,148 | **4.1%** | **$0.00** | **$5.00** |

On Workers Paid, all three scenarios sit entirely inside the included allowances:
- Requests: 126,210/month vs **10,000,000 included** → 1.3% used → $0 overage.
- CPU: 126,210 × 5 ms = 631,050 CPU-ms vs **30,000,000 included** → 2.1% used → $0 overage.
- **Total: the $5.00 minimum account charge, and nothing else.**

**Every scenario lands in the free tier.** The free plan breaks at 100,000 requests/day ≈ 3.04M/month, which at 8 deliveries/issue is ~380,000 issues/month. Measured CNCF-wide volume at 175 projects is ~12,621 issues/month — a **30× margin**.

#### Sensitivity

The weakest input is the n=2 action multiplier. Stress it:

| Multiplier | 175-project deliveries/day | Still free-tier? |
|---|---|---|
| 4 (envoy-like, low) | ~2,100 | Yes (2.1%) |
| 8 (used above) | ~4,148 | Yes (4.1%) |
| 11 (k8s-like, high) | ~5,600 | Yes (5.6%) |
| 80 (10× error) | ~41,500 | Yes (41%) |
| 190 (24× error) | ~100,000 | At the cliff |

**The conclusion survives a 20× estimation error.** The multiplier does not need to be more precise than it is.

#### Recommendation despite $0 being available

**Take the $5/month Workers Paid plan.** Two reasons, neither about volume:
1. **The 10 ms Free CPU ceiling is uncomfortably close.** Cloudflare's own guidance is that "heavier workloads that handle authentication... typically use 10-20 ms." RS256 App-JWT signing plus JSON parsing of a payload that may reach tens of KB (cap is 25 MB) can approach it. Paid raises the per-invocation limit to 30 seconds by default.
2. **The free plan has a hard daily cliff.** Hitting 100,000/day returns Error 1027 and — on a fail-open route — silently bypasses the Worker, dropping deliveries with no failure recorded anywhere. If you do run on Free, **configure the route fail closed** so GitHub records the delivery as failed and it becomes recoverable.

$5/month makes the cost question disappear entirely.

### B.6 Non-cost operational obligations — these carry regardless of price

These, not the bill, are the real cost of owning a relay.

**1. Response deadline: 10 seconds.** "Your server should respond with a 2XX response within 10 seconds of receiving a webhook delivery. If your server takes longer than that to respond, then GitHub terminates the connection and considers the delivery a failure." The relay must return 2XX *before* doing anything slow. Fire the `repository_dispatch` and return immediately; if it must be deferred, use `ctx.waitUntil()`, which "can extend execution for up to 30 seconds after the response is sent."

**2. GitHub does not retry. At all.** "**GitHub does not automatically redeliver failed deliveries.**" This is the single most commonly mis-assumed webhook behaviour and it materially changes the design: a 5-minute relay outage is 5 minutes of *permanently lost* sync events unless someone intervenes.

**3. Missed deliveries are recoverable — for 3 days.** "You can redeliver webhook deliveries that occurred in the past 3 days," via the web UI or the REST API ([GitHub App webhooks](https://docs.github.com/en/rest/apps/webhooks)). Anything older is gone. Implication: you need delivery-failure alerting with a response time well inside 72 hours, or a reconciliation sweep. **Note this makes a periodic reconciliation poll valuable even in the push design** — it is the only thing that closes gaps older than 3 days.

**4. Replay protection has a trap.** Use `X-GitHub-Delivery` to detect replays — but "**If you request a redelivery, the `X-GitHub-Delivery` header will be the same as in the original delivery.**" GUID-based dedup at the relay will therefore silently suppress exactly the redeliveries you requested to repair an outage. **Put idempotency in the hub workflow** (does a discussion already exist for this issue?), not in the relay.

**5. Secret validation is mandatory and has specific requirements.** HMAC-SHA256 over the raw body, compared against `X-Hub-Signature-256`, which "always starts with `sha256=`". Handle the payload as UTF-8. "**Never use a plain `==` operator**" — use a constant-time comparison such as `crypto.subtle.verify` (which the Workers runtime provides natively). Note the signature is computed over the **raw** body: verify before parsing, and never let a proxy re-serialize it.

**6. Secret rotation has a gap.** The documented rotation path is to edit the webhook's "Secret" field — a single-value replace. No dual-secret / overlapping-validity mechanism is documented. In-flight deliveries signed with the old secret will fail validation during the swap. Mitigation: have the relay accept either of two secrets held in environment variables and retire the old one after the window. *(The absence of a native dual-secret mechanism is an observation about what the documentation describes; treat "GitHub will never add one" as **unverified**.)*

**7. Transport and origin hardening.** SSL verification is on by default and should stay on. An IP allow-list can be built from `GET /meta`, but "GitHub occasionally makes changes to its IP addresses, so you should update your IP allow list periodically" — this is an operational commitment, not a one-off.

**8. Payload cap.** "Payloads are capped at 25 MB. If an event generates a larger payload, GitHub will not deliver a payload for that webhook event." Rare for `issues`, but it is a silent drop.

Sources: [Best practices for using webhooks](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks), [Redelivering webhooks](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks), [Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads).

---

## Part C — Where the write limits *do* bite

Polling is read-only and consumes none of GitHub's content-generating budget. The **writes** do, and they are the same in both designs.

### The limits

From [Rate limits for the REST API — secondary rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api):

> "*Create too much content on GitHub in a short amount of time.* In general, no more than **80 content-generating requests per minute** and no more than **500 content-generating requests per hour** are allowed. Some endpoints have lower content creation limits. Content creation limits include actions taken on the GitHub web interface as well as via the REST API and GraphQL API."

### Writes per synced issue

Per the agreed flow, three content-generating requests:

| # | Write | Bucket |
|---|---|---|
| 1 | `createDiscussion` in the hub repo | **hub installation** |
| 2 | `addDiscussionComment` linking to the issue | **hub installation** |
| 3 | `createComment` backlink on the project issue | project's own installation |

**Two of the three always land in the hub installation's bucket.** That bucket is the binding constraint and it does not scale with the number of participating projects — adding projects adds work to a fixed-capacity hub.

Hub-bucket ceilings:
- **500/hour ÷ 2 = 250 issues/hour**
- **80/minute ÷ 2 = 40 issues/minute** (burst)
- Sustained-safe rate: 250/hour ≈ **~4 issues/minute**

GraphQL mutations also cost 5 points each against the 2,000-points/minute secondary limit (3 mutations × 5 = 15 points/issue; 40 issues/min = 600 points/min = 30%) — so content creation binds first.

### Steady state: no risk

Even assuming *every* created issue were synced, the 175-project scenario is 12,621 issues/month ÷ 730 hours = **17 issues/hour**, or **7% of the 250/hour hub ceiling**. In reality only labelled issues sync, so the true figure is a small fraction of that. **Steady-state operation is nowhere near the write limits.**

### Backfill and mass-labelling: a real hazard

This is where it bites, and it is worth designing for explicitly.

**Scenario A — seeding existing repositories.** Onboarding 175 projects, each with a historical backlog carrying the feedback label. At, say, 2,000 historical issues total:

```
2,000 issues × 2 hub writes      = 4,000 hub content-generating requests
4,000 ÷ 500 per hour             = 8 hours minimum wall-clock
sustained rate required          ≤ 4 issues/minute
```

**Scenario B — a mass-labelling event.** A maintainer bulk-applies the label to 500 issues in one repo. Processed eagerly, that is 1,000 hub writes: it blows the **80/minute** limit within seconds and needs **2 hours** to drain under the 500/hour limit.

**Scenario C — a redelivery storm.** Replaying 3 days of deliveries after an outage has the same shape as Scenario B.

**Consequence of ignoring this is not just failure, it is escalation:** "If you exceed a secondary rate limit, you will receive a `403` or `429` response... If your request continues to fail due to a secondary rate limit, wait for an exponentially increasing amount of time between retries... **Continuing to make requests while you are rate limited may result in the banning of your integration.**"

**Design requirement.** Backfill and bulk-label handling must be a **throttled, resumable, persisted queue** — capped at ~4 issues/minute sustained, honouring `retry-after` and `x-ratelimit-reset`, checkpointing progress so a killed run resumes rather than restarts. It must not be a `for` loop. This applies identically to the relay design and the polling design; it is a property of the writes, not of the trigger.

**A note on `GITHUB_TOKEN`:** doing the writes with the workflow's `GITHUB_TOKEN` is not an option. It is limited to 1,000 requests/hour per repository, cannot write across orgs, and — as established earlier in this workstream — events it causes do not trigger new workflow runs. The App installation token is required.

---

## Summary of the decision

| | **Cloudflare Worker relay** | **Scheduled poll (GitHub-only)** |
|---|---|---|
| Third-party dependency | Yes (Cloudflare) | **None** |
| Monthly cost | $0 (free tier) or **$5** | **$0** public hub repo / ~$34 private |
| Sync latency | Seconds | ~5 min + scheduling delay |
| Rate-limit utilisation | n/a | **0.24%** of per-installation budget |
| Lost-event modes | No auto-retry; 3-day recovery window | Sweeps dropped under load (self-healing with overlapping windows) |
| Silent-failure mode | Free-tier 1027 fail-open | **60-day auto-disable on quiet public repo** |
| Secrets to own | App key + webhook secret (+ rotation) | App key only — **no webhook secret at all** |
| Backfill constraint | ~250 issues/hour (hub bucket) | ~250 issues/hour (hub bucket) — identical |

Cost does not decide this. At CNCF scale both options are effectively free, and the volume estimate survives a 20× error. The decision turns on whether ~5 minutes of latency and the 60-day auto-disable hazard are acceptable in exchange for eliminating a third-party dependency, a public HTTPS endpoint, a webhook secret, and its rotation procedure.

A defensible hybrid: **run the relay for latency, and run a low-frequency reconciliation poll (hourly) regardless.** The poll is nearly free at 0.02% rate-limit utilisation, it is the only mechanism that closes gaps older than the 3-day redelivery window, and it keeps the hub repo active enough that the 60-day rule never fires.