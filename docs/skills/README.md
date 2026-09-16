# Skills

Project knowledge for agents and humans working on the CNCF feedback loop.
Read the matching skill **before** any global skill or training-data recall.

## Routing

| Task | Skill |
|---|---|
| Changing sync behaviour; reviewing a change; "why is it built this way" | [`feedback-sync-architecture.md`](feedback-sync-architecture.md) |
| Deploying, configuring, onboarding a project, debugging a run | [`operating-feedback-sync.md`](operating-feedback-sync.md) |
| Registering Apps, public vs private, tokens, key custody | [`github-app-credentials.md`](github-app-credentials.md) |
| Discussions API mechanics, category formats, webhook actions | [`github-discussions-api.md`](github-discussions-api.md) |

## Research (point-in-time findings, not procedures)

Under [`../research/`](../research/):

| File | Answers |
|---|---|
| `proposal-status.md` | What happened to the 2023–2024 proposal, and what already exists |
| `github-platform-capabilities.md` | What GitHub can and cannot do for this design |
| `metrics-and-prior-art.md` | Whether the dashboard is buildable; what exists already |
| `hosting-and-cost.md` | Whether this can run entirely on GitHub, and what hosting costs |

The original proposal is archived verbatim at
[`../proposal-2024-killen.md`](../proposal-2024-killen.md). It is a historical
artifact, not current truth — several of its decisions have been deliberately
changed, and the skills state where and why.

## The five things most likely to bite you

Each of these cost real debugging time and is documented in full in the linked
skill.

1. **A private GitHub App can only be installed on its owner.** Not a
   permissions problem, not a UI problem — the org simply never appears in the
   install list. → `github-app-credentials.md`
2. **`viewer.login` and `author.login` spell the same App differently**
   (`my-app[bot]` vs `my-app`). Comparing them directly makes a sync reject its
   own content and duplicate forever. → `github-discussions-api.md`
3. **Two GitHub docs pages contradict each other** on `discussion` activity
   types. The hand-maintained Actions page omits `closed` and `reopened`; both
   trigger workflows fine. Cross-surface disagreement is unresolved until you
   probe it. → `github-discussions-api.md`
4. **A query for labelled issues can never see a label being removed.** Any
   design that closes on unlabel needs a durable, enumerable index and a second
   reconciliation pass. → `feedback-sync-architecture.md`
5. **Category format is not exposed by the API.** `isAnswerable` is not format.
   Verify announcement-format in the UI or the moderation guarantee silently
   does not hold. → `operating-feedback-sync.md`

## Conventions these skills assume

- **No API shapes from memory.** Context7 (`/github/docs`) or live schema
  introspection, cited at the claim.
- **Probe in a disposable repo**, never the product surface, and delete test
  content afterwards.
- **Provenance fails closed.** If identity cannot be established, abort rather
  than trust.
- **Markers curate, they do not conceal.** Never describe marker-excluded issue
  text as private.
