# BBL backend handoff

Status: merge-ready backend foundation, not a complete product.

Backend implementation reviewed and pushed: d07eed5,
fix(validation): harden matching input boundaries.

This document is for the integrator and frontend team. It records the actual
state of the BBL branch so nobody mistakes a fixture or development stub for a
completed recommendation flow.

## What is ready

- The supplied 66-profile CSV is tracked at data/contractors.csv and unchanged.
  Its SHA-256 is
  6a724b6b7dfb5973343e68ba18dadb60fc807d87e3d78f03ee86fb26cb089f7d.
- The startup catalog loader validates columns, IDs, booleans, prices, lists,
  calendar dates, duplicate IDs, null duration limits, and non-finite hours.
- The API normalizes reviewed aliases such as Almaty, Alma-Ata, Almata, MC,
  wedding, RU, and banquet hall to canonical catalog values. It does not use
  fuzzy matching or silently change an unknown label.
- Hard filtering is deterministic and applies the first-failure reporting
  order: booked, over budget, unsupported format, unsupported language, then
  duration exceeded.
- Booked people and venues are excluded using exactly the same calendar rule.
  Price equal to the budget passes. Language and duration only filter when
  supplied. A null max_hours means duration is not tied to on-site presence;
  it is not described as unlimited availability.
- The API supports development CORS for the two default Vite origins and fails
  startup instead of serving a partially loaded catalog.
- Direct dependencies and their verified Windows/Python 3.14 environment are
  pinned in pyproject.toml and requirements-dev.lock.

## Current API contract

GET /api/health returns ready status, profile count, dataset version, and
algorithm version after the catalog has loaded successfully.

GET /api/metadata returns canonical cities, categories, formats, languages,
and the supported date range: 2026-09-23 through 2026-12-31.

POST /api/match accepts these required fields:

    city
    event_date       YYYY-MM-DD only
    event_format
    category
    budget_kzt       JSON integer only

Optional fields are duration_hours (numeric or null) and language. Unknown
catalog values and invalid request values return HTTP 422. The response schema
is stored at contracts/openapi.json, and frontend fixtures are in
contracts/examples/.

Business behavior at the current branch tip:

| Situation | HTTP response | Current result |
| --- | ---: | --- |
| Category does not exist in selected city | 200 | category_absent response with zero cards |
| City/category profiles exist but all fail constraints | 200 | no_eligible_contractors response with first-failure counts |
| One or more profiles are eligible | 503 | ranking_not_integrated development response |

The 503 for eligible profiles is intentional only until the matching work is
integrated. It must not remain in a release candidate or final demo.

## Integration work still required

Enjoy or the agreed integrator must implement and wire all of the following:

1. Load and validate a versioned profile-evidence index. The current
   backend/app/matching/profile_evidence.json is empty.
2. Implement deterministic ranking over only FilterResult.eligible. Never let
   score trade away city, category, availability, budget, format, language, or
   duration eligibility.
3. Sort deterministically, select at most three unique contractors, and keep
   the same order for the same normalized request, dataset, evidence, and
   algorithm versions.
4. Build MatchCard values with one or two grounded Russian explanation
   sentences and structured evidence. Explanations must distinguish cards even
   if names are hidden.
5. Replace the eligible-candidate 503 branch in backend/app/api/routes.py with
   a matches_found MatchResponse. Its counts must distinguish city/category,
   eligible, and returned totals; it must give a clear reason when one or two
   cards are returned.
6. Change ALGORITHM_VERSION to cover the ranking and evidence rules, not only
   the current hard-filter version.
7. Add ranking, explanation-grounding, repeated-order, unique-card, and live
   matches_found API tests before the final merge.

The original plan proposes these pure-function boundaries; agree the exact
shared types before implementing them because RankedCandidate and EvidenceIndex
are not yet present in models.py:

    filter_candidates(request, catalog) -> FilterResult
    rank_candidates(request, eligible, evidence) -> ranked candidates
    build_cards(request, ranked, evidence) -> MatchCard list

The frontend team should call metadata for canonical form options and preserve
the response card order. It still needs to implement the form, loading,
validation, network-error, category-absent, no-eligible, and successful-card
views. No frontend package or browser test exists on this branch.

## Frozen backend acceptance cases

These results were recalculated against the tracked CSV at this branch tip.
They are eligible sets before ranking, not a promised card order.

| Scenario | Expected hard-filter result |
| --- | --- |
| Almaty, MC category, wedding, 2026-10-11, 3,000,000 KZT | Pool 10; eligible HK-42352, HK-44923, HK-77838, HK-72938, HK-27222 |
| Same request, 2026-10-10 | Eligible HK-77838, HK-72938, HK-27222 |
| Almaty, Florist, wedding, 2026-10-10, 300,000 KZT | Pool 2; HK-39372 eligible; one booked exclusion |
| Astana, Decorator, wedding, 2026-10-10 | Pool 0; category_absent |
| Astana, Florist, wedding, 2026-10-11, 300,000 KZT | Pool 1; one booked exclusion; no_eligible_contractors |
| Astana, Banquet hall, wedding, 2026-10-10 then 2026-10-11 | HK-90012 eligible on the first date and booked on the second |
| Almaty, MC category, wedding, 2026-12-26, 3,000,000 KZT | Only HK-44923 eligible |

## Verification and local run

From the repository root on Windows. The lock was verified on Python 3.14;
the project requires Python 3.11 or newer:

    python -m venv .venv
    .venv\Scripts\Activate.ps1
    python -m pip install -r requirements-dev.lock
    python -m pip install --no-build-isolation --no-deps -e .
    python -m unittest discover -s backend/tests -v
    python -m pytest -q
    python -m pip check

To run the API:

    python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload

For a copied .env file, Uvicorn must receive it explicitly:

    Copy-Item .env.example .env
    python -m uvicorn backend.app.main:app --env-file .env --host 127.0.0.1 --port 8000 --reload

Verified at d07eed5: 34 unittest tests, 34 pytest tests, and pip check pass.
The in-process hard-filter API call was measured at 0.0024 seconds. This is not
a browser end-to-end latency claim; the release candidate still needs a real
browser measurement and demo rehearsal.

## Merge protocol

Before integrating, fetch remote refs and review the BBL diff rather than
assuming this document is current:

    git fetch origin
    git diff --name-status origin/main...origin/bbl
    git log --oneline origin/main..origin/bbl

Merge the branch only with the matching and frontend teams aware of the strict
request validation and the intentionally unfinished eligible-candidate path.
After integration, regenerate or verify contracts/openapi.json, run the full
backend suite, frontend checks, production build, and real browser scenarios.
