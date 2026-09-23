# Enjoy matching integration

The matching core lives in `backend/app/matching`. It has no HTTP, Pydantic, model-provider or third-party runtime dependency. Callers supply validated model objects with the attributes documented in `types.py`; Pydantic models work through structural typing.

## Backend handoff to bbl

```python
from app.matching import algorithm_version, load_evidence, rank_candidates, build_cards

# Startup: the catalog objects retain original descriptions and typed fields.
evidence = load_evidence(catalog, dataset_sha256=dataset_version)
version = algorithm_version()

# Request: the API owns validation, filtering, outcome messages and counts.
filtered = filter_candidates(request, catalog)
ranked = rank_candidates(request, filtered.eligible, evidence)
card_payloads = build_cards(request, ranked, evidence)
# MatchCard.model_validate(payload) can convert each plain payload to API models.
```

`rank_candidates` returns all eligible candidates as immutable `RankedCandidate` values with `contractor`, integer `score` and `evidence_ids`. `build_cards` caps output at three and returns JSON-compatible dictionaries. The API can pass those to its response model; matching does not import `app.models`, avoiding circular imports and blocking on a specific model implementation.

The exact API field names remain those in `Instructions.md`. Matching `types.py` is an internal structural interface, not a second request validator. bbl remains owner of canonical enums, aliases and input validation.

The evidence loader validates source quotes, contractor IDs, supported format tags, schema version and (when supplied) dataset SHA-256. A missing record for a known contractor uses a factual fallback. A malformed or stale record is an explicit startup error. The bundled index covers all 66 profiles; do not silently substitute empty evidence on errors. Attribution-only quotes marked `use_in_explanation: false` remain available for provenance but earn no rank credit and do not enter prose.

Calendar values may be Python `date` objects or canonical ISO strings. `max_hours = None` bypasses duration exclusion without claiming unlimited attendance. Numeric matching happens only after the backend validates a positive budget. Ranking repeats eligibility assertions to catch integration mistakes; it never relaxes a constraint.

## Frontend handoff to spectra

Enjoy supplies the framework-independent transport module under `frontend/src/api`. It preserves API card order and supports `AbortSignal`. spectra owns forms, components and their presentation. The client will be adapted to the first published backend schema and generated types added when that schema exists.

## Local matching checks

From the repository root, Python 3.11 or later:

```bash
python -m unittest backend.tests.test_matching_unit backend.tests.test_matching_dataset backend.tests.test_evidence_proposal -v
```

The unittest checks are also pytest-compatible. No application server or API key is required for these core checks. After installing `requirements-dev.lock` and the editable package as documented in README, `python -m pytest -q` also exercises bbl's real Pydantic models, date sets, null hours and serialized response envelopes.

To run the eight dataset acceptance scenarios, check repeatability with reversed source order and measure domain-only response time:

```bash
python scripts/matching_acceptance.py --repeat 20
```

The script is an independent acceptance oracle, not the production API. Browser/HTTP coverage is a separate integration gate once teammates publish their services.
