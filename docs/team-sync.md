# Integration observations

## Integrated handoff, 23 September 2026

Enjoy now contains the working React/FastAPI application, deterministic matching, bilingual evidence and the documented acceptance tooling. Latest inspected remote checkpoints:

| Branch | Inspected commit | Integration status |
| --- | --- | --- |
| `bbl` | `83cf4e3` | B1/B2 loader, normalization, filtering and routes integrated; B3 runtime factory/settings/CORS merged at `a4e7141` |
| `feature/sp3ctra` | `8ded1f1` | Actual frontend from `5d1df99` already integrated at `a08eee0`; later commit only restores a boilerplate frontend README |
| `main` | `57b7a32` | Contains spectra's frontend merge; synchronize its history into Enjoy while retaining the tested, current frontend setup documentation |
| `Enjoy` | `a4e7141` | Complete source integration checkpoint; documentation and full clean-clone verification follow in small commits |

B2's success placeholder is replaced with normalization, real hard filters, evidence-aware ranking and typed cards. Startup validates the 66-profile catalog against the evidence digest. B3 keeps configurable data paths and explicit CORS origins, while the algorithm version comes from the actual code/evidence and cannot be overridden by an environment label. Regenerated OpenAPI includes request length limits and nullable evidence values.

The Russian interface is retained with a separate English switch. Canonical request values, contractor language filters and result order do not change when switching the interface. English explanations use structured facts and reviewed quote translations, with original Russian evidence still available.

After B3: 88 Python tests and 218 subtests pass. The integration checkpoint also has 49 client and 16 locale tests, six isolated UI browser checks, eight real API browser flows, strict client types and a production frontend build. Exact commands, timing scope and final reproduction status are in the root README. Provider keys are outside Git; optional offline inference is capped, and the app/CI need no key.

Git only exposes pushed work. Remote refs are checked during the active task and at integration milestones; this file is not a background monitor between sessions.

## Historical checkpoints before the complete application

- `main` at `8cae379`: bbl's shared backend scaffold and models, incorporated into Enjoy at `0d07a0b`. Matching placeholders were resolved in favor of Enjoy's tested implementation after inspecting each conflict. Backend model objects match the structural matching interfaces. Production catalog loading, filtering and API routes are still placeholders at this source revision.
- `main` then advanced to `a895444` through spectra's PR #2, adding only `design.pdf`. Enjoy incorporated it at `7ab1818`; no API or frontend implementation arrived in that merge.
- `bbl` advanced to `ebdac88` (validated loader, health/metadata, request normalization, OpenAPI and three fixtures), then `ae934f0` (additional Almaty aliases). Both updates are now merged into Enjoy. Filtering is still a placeholder and valid match requests deliberately return `503 matching_not_ready`.
- `feature/sp3ctra` at `e3eb854`: five-screen `design.pdf`. All five pages were visually reviewed. No React package or implementation was present at this revision.
- Enjoy has pushed the matching core, source evidence, typed client, test harness and documentation in separate commits. Consult the current Git history for subsequent updates; these observations are a timestamped handoff, not a live status feed.

The earlier setup was reproduced in a separate clean clone of Enjoy `fff79d9`: 34 Python tests / 192 subtests, 32 client tests, strict TypeScript, eight browser test discoveries, 160 domain acceptance runs and the exact CSV hash all passed. This historical checkpoint predates production API/UI integration and is not a full-app reproduction claim.

## B1 compatibility fixes on Enjoy

- Updated frontend metadata fields to `calendar_start` / `calendar_end` and health to `status: "ready"`; the provisional alternatives now fail client validation.
- Allowed null `EvidenceItem.value` in the backend schema and regenerated OpenAPI. The real null-duration florist scenario reproduced the validation failure before this fix and passes afterward. Null means duration does not apply; it must not become an invented numeric limit.
- Added client checks against all three published backend fixtures and restricted evidence values to strings, numbers, string arrays or null.
- Verified 49 B1/core Python tests with 192 subtests and 49 current client tests. The test command excludes ignored local clone artifacts to avoid counting a stale copied suite.
- Started Uvicorn and consumed real health/metadata with the typed client: 66 profiles, 17 categories and the correct date bounds. Full match HTTP checks await B2. The current health algorithm label is still B1's `hard-filter-v1`; B2 orchestration must report `backend.app.matching.algorithm_version()` from the evidence actually loaded.

## Design-to-data adjustments for spectra

The five screens provide useful layouts for the form, full result, short result and two empty outcomes. Implement the presentation using API data, with these contract details:

1. **Language is one optional value.** The design shows several checkboxes, but v1 request `language` is `string | null`. Use a single select or single-choice chips/radio group with an unselected option. Supporting several requested languages would need an explicit contract and filtering change.
2. **Use counts from the city/category pool.** There are 15 hosts globally but 10 in Алматы; 8 banquet halls globally but 7 in Алматы; 3 florists globally but only 1 in Астана. The example headings in the PDF use global counts as city counts. Read `counts.city_category_total` and `exclusions` from the API.
3. **Display actual returned profiles.** The PDF's sample contractor names and amounts are illustrative. Real demo data is the bundled CSV; do not hardcode the mock names, the 450,000 ₸ host scenario, or a guaranteed three-card result.
4. **Show price uncertainty.** Keep `от`, retain `price_imputed` and `city_imputed` notes, and show supplied synthetic profiles clearly. Starting-price headroom is not a guaranteed final saving. Say that the final price needs confirmation.
5. **Dates may change the result.** Availability changes explain our verified demo pair, but different dates can also produce the same shortlist. Avoid promising a different result for every date change.
6. **Use first-failure counts honestly.** If the API says every candidate failed availability first, do not infer that budget and format would otherwise pass. Only show season percentages if calculated or clearly attributed as source-wide context, rather than as measured results for that request.
7. **Keep outcome logic driven by the response.** Full and short results both use `matches_found`. `category_absent` and `no_eligible_contractors` are separate business outcomes; network failures have a separate error view.
8. **Canonical values can have polished labels.** A visible `Свадьба` label can send the value `свадьба`. Form values must match metadata. The browser test now selects option values, so capitalization of visible labels does not break it.

See [browser contract](browser-contract.md) for test hooks and [matching integration](integration.md) for backend calls. Interface changes should update clients, fixtures and checks in the same increment.

## Cloud check availability

GitHub Actions for Enjoy commit `5530d44` failed before any test step ran. The [later inspected run for `d6933a1`](https://github.com/BAITC-Hacks/hack-890ebfb3-orbit-digital-icarus/actions/runs/35842404798) has the same result and an empty job-step list. The check annotation states: `The job was not started because your account is locked due to a billing issue.` This is an account-level execution blocker; each push starts another attempt and can send another failure email. Local test results are documented separately; no successful GitHub run is claimed. The account owner must resolve the billing lock before cloud checks can execute. The workflow remains enabled.
