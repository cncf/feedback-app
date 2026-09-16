# CNCF Feedback Loop proposal — status as of 2026-09-16

Scope: did Bob Killen's "Creating a Better Feedback Loop" proposal (drafted 2023-10-14, changelog last entry 2024-09-05, archived here at `docs/proposal-2024-killen.md`) advance, stall, or die — and what exists publicly today.

Method note: no shell was available in this session, so `gh` CLI was not used. Every live fact below is recorded as the GitHub MCP tool call or the GitHub REST API endpoint that produced it, together with its literal result. All checks run 2026-09-16.

---

## Bottom line

1. **This is a revival of a stalled effort, not a duplicate of something that now exists.**
2. The proposal *did* advance: it became a named End User TAB workstream in Jan 2025 with its own label (`area/feedback-loops`) and three tracking issues in `cncf/tab`.
3. It then stalled and was explicitly parked — `cncf/tab#54` closed 2025-12-01 and `cncf/tab#52` closed 2025-12-08, both with the chair's comment "Closing for now. Once we get more time in the TAB we get back to it."
4. Nothing of the design shipped: **no** `cncf/feedback` repo, **no** `cncf-feedback`/`cncf-projects-feedback` org, **no** Issue-Discussion Sync App, **no** dashboard, **no** PoC in any named project.
5. The last public move was a failed attempt to get a session at the KubeCon EU 2026 Maintainer Summit (`cncf/tab#103`, closed 2026-04-27: "We didn't make this in time.").

---

## 1. Does a dedicated CNCF feedback org or repo exist?

**No. Every probe is negative.**

| Check | Result |
|---|---|
| `GET https://api.github.com/repos/cncf/feedback` | **HTTP 404** — repo does not exist |
| `GET https://api.github.com/orgs/cncf-feedback` | **HTTP 404** — org does not exist |
| `GET https://api.github.com/orgs/cncf-projects-feedback` | **HTTP 404** — org does not exist |
| `mcp__github_search_repositories` `{"query":"org:cncf feedback"}` | **`total_count: 0`** — no repo in the `cncf` org matches "feedback" in name/description/readme |
| `mcp__github_search_repositories` `{"query":"cncf-feedback in:name,description"}` | 4 hits, **none CNCF-owned**. Only relevant hit is `castrojo/cncf-feedback` (this working repo), created 2026-09-16T17:24:52Z, description "Reviving the CNCF end-user feedback loop proposal" — <https://github.com/castrojo/cncf-feedback> |

`cncf/feedback` is the exact repo name the proposal's own issue-template YAML hardcodes as the `Feedback Repo Target` dropdown option (`docs/proposal-2024-killen.md`, References → Issue Template yaml). It was never created.

### CNCF repos with Discussions enabled, used for end-user feedback

- **`cncf/tab`** — <https://github.com/cncf/tab> — `has_discussions: true` (`GET /repos/cncf/tab`). This is the End User TAB repo (description: "CNCF End User Community", homepage <https://www.cncf.io/enduser/>), created 2019-01-14, active (`pushed_at: 2026-09-15`), 104 stars, 42 open issues.
  - Its public Discussions are **not** project feedback. Reading <https://github.com/cncf/tab/discussions> shows the visible discussions are all in the **Reference Architectures** category: #138 Adobe, #137 CERN, #136 Swisscom, #135 ZEISS, #134 Swisscom (pinned) — all started by `mrbobbytables` on 2026-06-03.
  - Category enumeration caveat: the GitHub Discussions category sidebar renders client-side and showed "Loading" to an unauthenticated fetch. Category names above were read from the per-discussion links (`category:"Reference Architectures"`). **A complete list of `cncf/tab` discussion categories is unverified** — but no feedback-style category appears in any listed discussion.
- **`cncf/endusers`** — <https://github.com/cncf/endusers> — created **2026-07-21**, description "Private Endusers community site, based on CNCF contributor resources", homepage <http://cncf.github.io/endusers/>, **`has_discussions: false`**, `has_pages: true`. This is a static end-user community *site*, not a feedback surface. Its README pillars are Practitioners / Architectures / Community / Awards / Metrics / Events (`mcp__github_search_code`, `cncf/endusers` `README.md`).
- **`cncf/architecture`** — <https://github.com/cncf/architecture> — created 2024-08-08, homepage <https://architecture.cncf.io/>, `has_discussions: false`. Content states: "The Reference Architecture site is a project led by the CNCF End User Technical Advisory Board" (`content/en/_index.md`).

**Interpretation:** what the TAB actually built for end-user input is a *reference-architecture publication pipeline* (cncf/architecture + Discussions in the single cncf/tab repo), not the proposal's per-project feedback org.

---

## 2. Traces of the work in public CNCF/LF repos

**Found — and it is all concentrated in `cncf/tab`.**

### The label

`area/feedback-loops`, color `0052cc`, description **"Items related to the Feedback Loops project"** — <https://github.com/cncf/tab/labels/area%2Ffeedback-loops>

### The three issues

`mcp__github_list_issues` `{"owner":"cncf","repo":"tab","labels":["area/feedback-loops"]}` → `totalCount: 3`. All opened by `mrbobbytables` on 2025-01-17.

| # | Title | State | Created | Closed | Assignees |
|---|---|---|---|---|---|
| [52](https://github.com/cncf/tab/issues/52) | Feedback loops expected behavior & guidelines | **closed** | 2025-01-17 | **2025-12-08** | castrojo, chadbeaudin, mrbobbytables |
| [53](https://github.com/cncf/tab/issues/53) | Template for feedback | **open** | 2025-01-17 | — | mrbobbytables |
| [54](https://github.com/cncf/tab/issues/54) | Feedback loops project outreach | **closed** | 2025-01-17 | **2025-12-01** | chadbeaudin, jrsapi, mrbobbytables |

`#53` has `updated_at == created_at` (2025-01-17T19:40:07Z) — **it has never been touched since it was filed.** Zero comments.

### Timeline from `cncf/tab#52` comments (<https://github.com/cncf/tab/issues/52>)

- **2025-01-27** `@chadbeaudin`: "Working doc [here]" → Google Doc `1EaImqtM_szy7GblmcemfabTog9fSI16R7FmfmBAjmz4` (**not publicly readable — contents unverified**)
- **2025-04-21** `@rochaporto`: "As discussed in our April 14th meeting, we can start by involving a few project volunteers: **cert-manager, Istio, Argo, Envoy**."
- **2025-04-21** `@rochaporto`: "Original proposal from @mrbobbytables" → Google Doc `1q90dU5vdjgnyZs_Ifcv6OlXpVbuhmUgMzLdb9Np3U7M` (**not publicly readable — contents unverified**; this is the doc archived in this repo)
- **2025-04-28** `@rochaporto`: "Implementation plan (draft) is in the doc" (same Google Doc)
- **2025-08-25** `@rochaporto`: "@mrbobbytables @chadbeaudin @castrojo @jrsapi to take the implementation plan from above and use it to guide a session in atlanta (in person)."
- **2025-09-22** `@alolita`: "This item is on the schedule for discussion at the Kubecon meeting in Atlanta."
- **2025-12-08** `@rochaporto`: **"Closing for now. Once we get more time in the TAB we get back to it."**
- **2025-12-08** `@rochaporto`: "@jrsapi suggests to submit to the maintainer summit in amsterdam"

**No public artifact from the Atlanta (KubeCon NA 2025) session was found.** Adjacent issues do reference it — `cncf/tab#97` ("Following the discussions in Atlanta", 2025-11-11) and `cncf/tab#91` ("Following the TAB offsite in Atlanta", 2025-11-10) — but neither concerns feedback loops. **Unverified whether the feedback-loops session actually happened.**

### The last move, and its failure

[`cncf/tab#103`](https://github.com/cncf/tab/issues/103) "submit session on feedback loops for maintainer summit", opened by `@rochaporto` 2025-12-08, assigned to chadbeaudin + jrsapi:
- 2026-01-19 `@rochaporto`: "CFP is closed, but we can consider the BoF/unconference sessions?"
- **2026-04-27 `@rochaporto`: "Closing. We didn't make this in time."** — issue closed.

This is the **most recent public activity on the feedback-loop effort anywhere**, 4.5 months before today.

### Negative: nothing outside `cncf/tab`

- `GET /search/issues?q="1q90dU5vdjgnyZs_Ifcv6OlXpVbuhmUgMzLdb9Np3U7M"` (the proposal doc ID) → `total_count: 2`, **both are `cncf/tab#52` and `cncf/tab#54`**. The proposal is referenced nowhere else on GitHub.
- `GET /search/issues?q=org:cncf "feedback loop" in:title` → `total_count: 4`: `cncf/tab#52`, `cncf/tab#54`, `cncf/tab#103`, plus one unrelated. **No TOC, foundation, or TAG issue.**
- `mcp__github_search_code` `{"query":"\"feedback loops\" repo:cncf/toc repo:cncf/foundation repo:cncf/tag-contributor-strategy"}` → 4 hits, **all generic unrelated prose**: `cncf/toc/.archive/README.md` (TOC liaison blurb), `cncf/toc/projects/buildpacks/buildpacks-adopter-interview-google.md` (build times), `cncf/toc/.archive/resources/toc-supporting-guides/tech-papers.md` (paper milestones), `cncf/toc/initiatives/1749_Cloud-Native_Agentic_Standards_Checklist.md` (agent RL). **No trace of this proposal in cncf/toc, cncf/foundation, or cncf/tag-contributor-strategy.**
- **`cncf/tag-contributor-strategy` is archived.** `GET /repos/cncf/tag-contributor-strategy` → `"archived": true`, `pushed_at: 2025-09-25`. Its site moved to `cncf/contribute-site` (<https://github.com/cncf/contribute-site>, created 2025-07-09, active, homepage <https://contribute.cncf.io>). TAG Contributor Strategy is therefore **not** an available venue for reviving this in its old form. (Exact archival date unverified.)

---

## 3. Did any named PoC participant run a feedback PoC of this shape?

**No public evidence whatsoever. All five probes negative.**

Proposal's 2024 PoC roster (`docs/proposal-2024-killen.md`, Stage 1 → PoC Project List): Istio (Lin Sun, "Mitch Conners"), OpenTelemetry TBD (Alolita Sharma), Argo TBD (Henrik Blix), Envoy (Mike Bowen).

| Probe | Result |
|---|---|
| `GET /search/repositories?q=feedback+in:name+org:istio+org:envoyproxy+org:argoproj+org:open-telemetry+org:cert-manager` | **`total_count: 0`** — no feedback-specific repo in any of the five orgs |
| `mcp__github_search_code` `{"query":"BEGIN-BLOCK \"Feedback Repo Target\""}` (the proposal's issue-template header + required field) | **`total_count: 0`** — the sync header/footer block exists nowhere on GitHub |
| `mcp__github_search_code` `{"query":"FeedbackState FeedbackLabel"}` (the proposal's config keys) | 224 hits, **zero CNCF- or project-related** — all unrelated frontend/app code (`hyperdxio/hyperdx`, `databricks-solutions/vibescaler`, etc.). No implementation of the sync app exists publicly |
| `mcp__github_search_code` `{"query":"repo:istio/istio repo:envoyproxy/envoy repo:cert-manager/cert-manager repo:argoproj/argo-cd repo:open-telemetry/community path:.github/ISSUE_TEMPLATE feedback"}` | **`total_count: 0`** — no feedback issue template in any of them |
| `mcp__github_search_code` `{"query":"path:.github/DISCUSSION_TEMPLATE repo:istio/istio repo:envoyproxy/envoy repo:cert-manager/cert-manager repo:argoproj/argo-cd"}` | **`total_count: 0`** — no discussion templates |

Context, not evidence of a PoC: `istio/istio` and `envoyproxy/envoy` both have `has_discussions: true` (`GET /search/repositories?q=repo:istio/istio+repo:envoyproxy/envoy+...`), but these are long-standing general-purpose Discussions unrelated to this proposal.

### The outreach never completed

[`cncf/tab#54`](https://github.com/cncf/tab/issues/54) body is a three-item checklist — **all three boxes unticked at close**:
- [ ] @mrbobbytables to reach out to cert-manager to pick things back up
- [ ] @mrbobbytables to follow up with Istio
- [ ] @jrsapi to follow up with envoy

On 2025-09-22 `@alolita` asked in-thread: *"Did we have conversations with Istio, cert-manager and Envoy already? Let's discuss in next meeting."* — **the question was never answered in the thread**; the next and final comment closed the issue (2025-12-01).

### Roster drift 2024 → 2025

The live 2025 volunteer list (`cncf/tab#52`, 2025-04-21) is **cert-manager, Istio, Argo, Envoy** — OpenTelemetry was dropped and cert-manager added relative to the 2024 document. No named individual (Lin Sun, Alolita Sharma as OTel contact, Henrik Blix, Mike Bowen) appears in any public feedback-loops artifact. Mike Bowen and Alolita Sharma do appear — but as sitting End User TAB members (see §5), not as project PoC drivers. The proposal spells the Istio contact "Mitch Conners"; I did not verify that individual's identity or involvement — **unverified**.

---

## 4. Bob Killen — current public affiliation and involvement

Facts only.

- GitHub profile: <https://github.com/mrbobbytables> (`GET /users/mrbobbytables`). Name **"Bob Killen"**, **`company: "@cncf"`**, bio "Kubernetes & OSS Advocate | CNCF cat wrangler", location Minneapolis MN, blog <https://mrbobbytabl.es>, 168 public repos, 515 followers. Profile `updated_at: 2026-09-02`.
- Public org memberships (`GET /users/mrbobbytables/orgs`): **cncf**, kubernetes, kubernetes-sigs, orchestructure, honk-ci.
- Commits as recently as **2026-09-14** authored and committed as **`bkillen@linuxfoundation.org`**, SSH-signed and verified: commit [`635666d`](https://github.com/cncf/tab/commit/635666d5c54b55262035095b4d20096558969524) "Update tab info with seat" to `cncf/tab/README.md` (`GET /repos/cncf/tab/commits?path=README.md&per_page=1`). This is the same LF address used as the assignee contact throughout the 2024 proposal.
- Currently active in the cncf org: `GET /users/mrbobbytables/events/public` shows him closing issues and commenting in `cncf/endusers` on **2026-09-16** (e.g. <https://github.com/cncf/endusers/issues/38>). He started all five `cncf/tab` Reference Architecture discussions on 2026-06-03.

**Is he still driving the feedback loop?** No public evidence that he is. He opened all three feedback-loops issues in Jan 2025 and is an assignee on all three; the two that closed were closed by `@rochaporto` (TAB chair), not by him; `#53` — his sole remaining open item — has had zero activity since 2025-01-17; and he is not an assignee on the last-ditch `#103`. He remains highly active in CNCF, just not on this.

---

## 5. Does the CNCF End User TAB still exist under that name and governance?

**Yes. Same name, same charter, no restructuring found.**

- **Charter (authoritative):** `cncf/foundation/charter.md` §8 — *"End User Technical Advisory Board ("End User TAB"). (a) Purpose and Duties: The End User TAB will serve as the voice of End Users in the CNCF community…"* — <https://github.com/cncf/foundation/blob/main/charter.md> (via `mcp__github_search_code`).
- **Repo + machine-readable governance:** `cncf/tab` `README.md` and `gov.yaml` on `main`, README last modified **2026-09-14** by Bob Killen. `gov.yaml` opens `tab: - name: End User Technical Advisory Board`. Duties listed in README are unchanged in substance from the charter (facilitate communication, advise the TOC, visibility into adoption, feedback on usability/reliability/performance, approve reference architectures, End User Radar, oversight of End User Groups/SIGs).
- **Governing Board linkage intact:** `cncf/governing-board/README.md` lists the GB as including "Chair of the [End User Technical Advisory Board](https://github.com/cncf/tab)" — <https://github.com/cncf/governing-board>.
- **TOC mandate intact:** `cncf/toc/README.md` still lists "accepting feedback from end user technical advisory board and map to projects" as a TOC duty — <https://github.com/cncf/toc/blob/main/README.md>.

### Current roster (`cncf/tab/gov.yaml` + README, as of 2026-09-14)

| Role | Name | Company | Seat |
|---|---|---|---|
| Chair | Ricardo Rocha (@rochaporto) | CERN | At-large |
| Vice Chair | Joseph Sandoval (@jrsapi) | Adobe | Silver Member |
| **APAC Chair** | Kenta Tada (@KentaTada) | Toyota | Silver Member |
| Member | Alolita Sharma (@alolita) | Apple | Platinum |
| Member | Michael Amundson (@ma-cvs) | CVS Health | Platinum |
| Member | Juliano Martinez (@ncode) | Adyen | Platinum |
| Member | Xu Wang (@gnawux) | Ant Group | Gold |
| Member | Ben Somogyi | Lockheed Martin | Silver |
| Member | Ahmed Bebars (@abebars) | The New York Times | At-large |
| Member | Mike Bowen (@michael-bowen-sc) | Blackrock | At-large |
| Member | Chad Beaudin (@chadbeaudin) | Boeing | TOC Appointed |
| Member | Katie Gamanji (@kgamanji) | Apple | TOC Appointed |
| Emeritus | Amr Abdelhalem (@ahalem) | Fidelity Investments | — |

Meetings: TAB Public Meeting, 3rd Monday monthly 8AM PT. Slack `#tab`, list `cncf-enduser@lists.cncf.io`.

**Deltas vs the proposal's 2024 PoC user list:** Boeing/Chad Beaudin, CERN/Ricardo Rocha, Blackrock/Mike Bowen and Apple/Alolita Sharma are all still seated. Fidelity/Amr Abdelhalem is now **emeritus**. **Mercedes-Benz / Mario Constanti no longer appears on the roster** (negative). An **APAC Chair** role now exists that was not in the 2024 material.

The TAB was created in 2023 and its founding remit already included "developing a mechanism of End Users to provide feedback to CNCF projects" — CNCF Governing Board minutes 2023-12-14, `cncf/governing-board/minutes-and-email-votes/2023/2023-12-14_minutes.md`. That is the charter hook this proposal was written against, and it is still open.

### Caveat: `cncf/tab-private`

A repo `cncf/tab-private` surfaced in authenticated code search (README: "# CNCF End User Technical Advisory Board (TAB)"), but `GET https://api.github.com/repos/cncf/tab-private` returns **HTTP 404** unauthenticated. It is a **private repo; its contents are not publicly verifiable** and are excluded from this report's conclusions.

---

## What exists publicly today, in this space

| Thing | Status | Link |
|---|---|---|
| Reference Architectures (the TAB's shipped end-user artifact) | Live | <https://architecture.cncf.io/> · <https://github.com/cncf/architecture> · published as `cncf/tab` Discussions #134–#138 |
| End User community site | New, pre-launch (created 2026-07-21, 0 stars, DNS to `endusers.cncf.io` undecided per its own `ROADMAP.md`) | <https://github.com/cncf/endusers> |
| LFX Insights feedback channel between TAB and LF | Requested, `cncf/tab#91` closed 2026-02-02; `linuxfoundation/insights#1481` still open | <https://github.com/cncf/tab/issues/91> · <https://github.com/linuxfoundation/insights/issues/1481> |
| Issue-Discussion Sync GitHub App | **Does not exist** | — |
| Feedback Discussion Dashboard | **Does not exist** | — |
| Dedicated feedback org/repo | **Does not exist** | — |

---

## Explicitly unverified

- Contents of the three Google Docs (original proposal `1q90dU5…`, working doc `1EaImqtM…`, implementation plan section) — not publicly readable.
- Full list of `cncf/tab` Discussion categories — the category sidebar renders client-side and did not resolve for an unauthenticated fetch.
- TAB meeting minutes — they live in GitHub Project <https://github.com/orgs/cncf/projects/60>, which none of the available tools can enumerate. Any feedback-loops discussion recorded only there is invisible to this report.
- Whether the KubeCon NA 2025 Atlanta in-person feedback-loops session actually took place.
- Exact date `cncf/tag-contributor-strategy` was archived.
- Identity/involvement of "Mitch Conners" (proposal's spelling) — not checked.
- Non-GitHub venues (CNCF Slack, mailing lists, KubeCon recordings) were out of reach and were not searched.
