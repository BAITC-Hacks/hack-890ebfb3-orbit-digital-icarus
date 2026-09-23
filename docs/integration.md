# Enjoy matching integration

The production API, bbl's catalog/filtering code, Enjoy's matching core and the React interface are integrated on `main`. The [README](../README.md) contains complete startup/build commands and recorded results. [Full integrated fresh-clone verification passed at `1292b65`](reproducibility.md).

The core lives in `backend/app/matching`. It has no HTTP, Pydantic, model-provider or third-party runtime dependency. Callers supply validated objects with the attributes documented in `types.py`; bbl's actual Pydantic models work through structural typing. The application owns validation and serialization at the boundary.

## Production backend boundary

```python
from backend.app.filtering import filter_candidates
from backend.app.matching import algorithm_version, load_evidence, rank_candidates, build_cards

# Startup: the catalog objects retain original descriptions and typed fields.
evidence = load_evidence(catalog, dataset_sha256=dataset_version)
version = algorithm_version()

# Request: the API owns validation, filtering, outcome messages and counts.
filtered = filter_candidates(request, catalog)
ranked = rank_candidates(request, filtered.eligible, evidence)
card_payloads = build_cards(request, ranked, evidence)
# The route passes these dictionaries to the MatchResponse Pydantic model.
```

The code above illustrates the boundary; it is called by `backend/app/main.py` at startup and `backend/app/api/routes.py` per request. Startup loads the bundled CSV, computes its actual SHA-256, validates the evidence against that catalog/hash, and stores the catalog, evidence and algorithm version in application state. Readiness is available only after this succeeds.

`rank_candidates` returns all eligible candidates as immutable `RankedCandidate` values with `contractor`, integer `score` and `evidence_ids`. `build_cards` caps output at three and returns JSON-compatible dictionaries. The API passes them to its response model; matching does not import `backend.app.models`, avoiding circular imports.

The route validates and normalizes a `MatchRequest`, calls production `filter_candidates`, then returns one of three HTTP 200 outcomes: `category_absent` for an empty city/category pool, `no_eligible_contractors` when the pool exists but all fail, or `matches_found` after ranking/card construction. Invalid inputs and unsupported dates/catalog values return HTTP 422. First-failure counts reconcile with the pool and appear in outcome messages; an empty result does not imply everyone is booked.

Field names are published in `contracts/openapi.json`. Matching `types.py` is an internal structural interface, not a second request validator. Canonical values, aliases and input validation live in the backend models/normalization layer. The response includes normalized request, source hash, evidence/ranking version, counts, exclusions and cards.

The evidence loader validates exact source quotes, contractor IDs, supported format tags, schema version and dataset SHA-256. A missing usable record for a known contractor uses a factual fallback. A malformed or stale record is an explicit startup error. The bundled index covers all 66 profiles with 99 records; six weak records marked `use_in_explanation: false` do not enter prose. These disabled records have no format tags and earn no rank credit. See [evidence review](evidence-review.md).

Calendar values may be Python `date` objects or canonical ISO strings. `max_hours = None` bypasses duration exclusion without claiming unlimited attendance. Numeric matching happens only after the backend validates a positive budget. Ranking repeats eligibility assertions to catch integration mistakes; it never relaxes a constraint.

## Frontend boundary and localization

`frontend/src/api/client.ts` is a framework-independent transport module. Its manually maintained types are aligned with the published OpenAPI schema. It preserves card order, accepts `AbortSignal`, checks successful response structures at runtime, maps HTTP 422 details and rejects transport/server failures separately from business-empty results. All three published response fixtures are exercised by client tests.

`App.tsx` uses the real API by default. Metadata populates native controls and calendar bounds; metadata failure disables matching until retry succeeds. `VITE_API_MODE=demo` explicitly selects labeled design-preview responses. A failed real request never falls back to those examples.

The UI cancels outstanding searches and clears stale results when a form value changes. A generation counter additionally guards against late delivery. The integrated delayed-response test holds a response fetched from the real API, changes the date while loading, completes the newer request, then releases the older response and checks that the newer result remains visible.

Russian is the default interface and renders server explanations/messages. The separate English control persists locally and changes labels and document language without refetching results, changing canonical Russian request values, changing the contractor's working-language filter or reordering cards.

English explanatory text is assembled from typed request/card/evidence facts and reviewed translations of the 93 usable source quotes. Original Russian quotes remain in evidence expanders. Unknown future quotes remain labeled as original Russian; missing useful quotes use structured catalog facts. This is display localization, with no browser ranking, live translation or runtime model call. See `frontend/src/i18n/` and the [browser contract](browser-contract.md).

## Reproducible checks

After the locked Python and both npm installs described in the README, run from the repository root:

```bash
python -m pytest -q
python scripts/matching_acceptance.py --repeat 20
npm run test:client
npm run test:i18n
npm run typecheck:client
npm --prefix frontend run build
npm run test:ui
```

No API key is required. Python checks exercise real Pydantic models, `set[date]` calendars, nullable hours, serialization, production filters and API responses. `scripts/matching_acceptance.py` is an independent CSV/filter oracle, not the production HTTP implementation; it checks eight frozen scenarios and repeatability after reversing input order.

The six `test:ui` browser checks start Vite and mock API responses explicitly. They isolate locale and presentation behavior. With the actual backend and frontend running, use the separate integration checks:

```bash
python scripts/check_api.py --base-url http://127.0.0.1:8000 --repeat 20
npm run test:e2e
npm run measure:browser
```

The eight application E2E tests use real matching responses; only explicit failure and delayed-delivery cases alter transport. Final isolated-clone regression at `190696c` passed 91 Python tests / 218 subtests, 49 client tests, 16 locale tests, six isolated UI tests and eight application browser tests, plus strict types and the frontend build. The built bundle also returned the dense real shortlist through the local Vite preview on port 4173.

Recorded on 23 September 2026 with Windows 11, Python 3.12.10, Node 26.7.0, npm 11.19.0 and Chromium 153.0.8010.12: 160 real HTTP runs had p95 **21.521 ms**, maximum **53.115 ms**; 20 real browser submit-to-visible runs had p95 **65.88 ms**, maximum **90.76 ms**. Browser time includes automation overhead; setup/startup are excluded. These local figures are scoped measurements, not production throughput promises. See [demo measurements](demo.md#measured-scope) for commands, versions and scenarios.

GitHub Actions includes these checks, but the inspected cloud job was blocked before execution by an account billing lock. Local passes do not establish a green cloud run. The [README verification record](../README.md#recorded-local-verification) includes the successful fresh-clone check and remaining CI limitation.
