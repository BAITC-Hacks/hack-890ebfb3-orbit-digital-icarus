# Integration observations

## Tandau/community integration checkpoint

On 23 September the captain authorized integrating the optional provider/event workspace into `main`, using **Tandau** branding and parallel implementation/review. The current review started from `1b19dd8` (Enjoy fixes PR #6), then observed `80c2e7a` (Spectra PR #7) and `feature/sp3ctra` at `1a10197`. Tandau/theme/layout changes are reconciled with the new community routes, honest inquiry draft, grouped budgets, 12-hour duration cap and date-comparison reasons; these must not be lost by blindly replacing entire files.

`Enjoy` at `60b1b0d` is an archived original-history branch. Its new progress log explicitly warns not to merge its pre-rewrite history back into main; the functional fixes are already on main via PR #6. `bbl` at `f3c8529` likewise preserves earlier development history whose functionality is already integrated. This task does not rewrite, force-push or delete those branches. Current extension behavior and verification are recorded in [community.md](community.md) and [community-verification.md](community-verification.md); older checkpoints below remain historical.

The later `main` PR #8 (`537401c`) and Spectra tip `62da9c4` were also inspected and merged normally. Their segmented RU/EN control and compact theme-button intent is preserved with shared palette tokens and minimum 44px targets. The source snapshot for the first new clean-clone run is `0edbb86`; later refinements only address presentation/contrast and verification documentation, not matching rules or community permissions.

Final branch check also inspected Enjoy `2627a3a`: one additional historical progress-log row only, with no functional changes to integrate. The archive's explicit no-remerge warning remains respected.

## Current release handoff

The current integration combines `bbl` f3c8529, `Enjoy` 9e7d5d0, `feature/sp3ctra` fc3a958 and `main` e691a58 without rewriting their history. The home/inquiry journey was added at 032561f and the concurrent main update merged at a1930af. Follow [release-review.md](release-review.md) for current checks, merge decisions, product behavior and the demo script. The earlier checkpoints below are retained as historical records; their pending-integration notes no longer describe the current source.

## Integrated handoff, 23 September 2026

Enjoy now contains the working React/FastAPI application, deterministic matching, bilingual evidence and the documented acceptance tooling. Latest inspected remote checkpoints:

| Branch | Inspected commit | Integration status |
| --- | --- | --- |
| `bbl` | `ad630e3` | B1/B2/B3 integrated; final three regression tests merged at `190696c`, preserving the independently verified dependency lock |
| `feature/sp3ctra` | `8ded1f1` | Actual frontend from `5d1df99` already integrated at `a08eee0`; later commit only restores a boilerplate frontend README |
| `main` | `57b7a32` | Contains spectra's frontend merge; history synchronized into Enjoy at `1292b65`, retaining the tested, current frontend setup documentation |
| `Enjoy` | `190696c` | Complete source integration and teammate regression tests; fresh-clone setup and final full regression passed |

B2's success placeholder is replaced with normalization, real hard filters, evidence-aware ranking and typed cards. Startup validates the 66-profile catalog against the evidence digest. B3 keeps configurable data paths and explicit CORS origins, while the algorithm version comes from the actual code/evidence and cannot be overridden by an environment label. Regenerated OpenAPI includes request length limits and nullable evidence values.

The Russian interface is retained with a separate English switch. Canonical request values, contractor language filters and result order do not change when switching the interface. English explanations use structured facts and reviewed quote translations, with original Russian evidence still available.

After B3: 88 Python tests and 218 subtests pass. The integration checkpoint also has 49 client and 16 locale tests, six isolated UI browser checks, eight real API browser flows, strict client types and a production frontend build. Exact commands, timing scope and final reproduction status are in the root README. Provider keys are outside Git; optional offline inference is capped, and the app/CI need no key.

Git only exposes pushed work. Remote refs are checked during the active task and at integration milestones; this file is not a background monitor between sessions.

A new GitHub clone of `1292b65` passed fresh locked installations, all 88 Python tests / 218 subtests, 49 client tests, 16 locale tests, both browser suites (6 isolated + 8 real), type checks, build, evidence validation and 160 independent domain runs. A further 160-request real HTTP run passed with p95 23.071 ms / maximum 33.424 ms. No provider key or external source path was used. See [reproduction record](reproducibility.md); final handoff edits are documentation only. The tested Enjoy application still needs team integration into `main`.

A final fetch found bbl's `ad630e3`: three additional tests plus an alternate dependency lock. The tests are integrated at `190696c`; the timing test now requires the working HTTP 200 match result instead of the old 503 placeholder. After reviewing both dependency sets, Enjoy retains the versions and platform markers that passed the complete fresh clone. The isolated clone checked out `190696c` and reran all suites: **91 Python tests / 218 subtests, 49 client, 16 locale, six isolated UI, eight real E2E, types and build all pass**. Application code and dependency locks are unchanged from `1292b65`.

## Historical checkpoints before the complete application

- `main` at `8cae379`: bbl's shared backend scaffold and models, incorporated into Enjoy at `0d07a0b`. Matching placeholders were resolved in favor of Enjoy's tested implementation after inspecting each conflict. Backend model objects match the structural matching interfaces. Production catalog loading, filtering and API routes are still placeholders at this source revision.
- `main` then advanced to `a895444` through spectra's PR #2, adding only `design.pdf`. Enjoy incorporated it at `7ab1818`; no API or frontend implementation arrived in that merge.
- `bbl` advanced to `ebdac88` (validated loader, health/metadata, request normalization, OpenAPI and three fixtures), then `ae934f0` (additional Almaty aliases). Both updates were merged into Enjoy. At that checkpoint filtering was still a placeholder and valid match requests deliberately returned `503 matching_not_ready`; the later B2 integration replaced that path.
- `feature/sp3ctra` at `e3eb854`: five-screen `design.pdf`. All five pages were visually reviewed. No React package or implementation was present at this revision.
- Enjoy has pushed the matching core, source evidence, typed client, test harness and documentation in separate commits. Consult the current Git history for subsequent updates; these observations are a timestamped handoff, not a live status feed.

The earlier setup was reproduced in a separate clean clone of Enjoy `fff79d9`: 34 Python tests / 192 subtests, 32 client tests, strict TypeScript, eight browser test discoveries, 160 domain acceptance runs and the exact CSV hash all passed. This historical checkpoint predates production API/UI integration and is not a full-app reproduction claim.

## B1 compatibility fixes on Enjoy

- Updated frontend metadata fields to `calendar_start` / `calendar_end` and health to `status: "ready"`; the provisional alternatives now fail client validation.
- Allowed null `EvidenceItem.value` in the backend schema and regenerated OpenAPI. The real null-duration florist scenario reproduced the validation failure before this fix and passes afterward. Null means duration does not apply; it must not become an invented numeric limit.
- Added client checks against all three published backend fixtures and restricted evidence values to strings, numbers, string arrays or null.
- Verified 49 B1/core Python tests with 192 subtests and 49 current client tests. The test command excludes ignored local clone artifacts to avoid counting a stale copied suite.
- At the B1 checkpoint, started Uvicorn and consumed real health/metadata with the typed client: 66 profiles, 17 categories and the correct date bounds. Full match HTTP checks then awaited B2, and health used B1's `hard-filter-v1` label. The subsequent B2/B3 integration now reports `backend.app.matching.algorithm_version()` from the reviewed evidence and passes the full HTTP checks.

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
