# Backend

FastAPI loads the bundled catalog and reviewed source evidence at startup. The
matching endpoint validates and normalizes the request, applies all hard filters,
ranks eligible profiles deterministically, and returns up to three grounded
recommendations or one of the two distinct empty outcomes. No API key or hosted
model is needed to run the application or its tests.

## Run locally

From the repository root, with Python 3.11 or newer (tested with Python 3.12):

    python -m venv .venv
    .venv\Scripts\Activate.ps1
    python -m pip install -r requirements-dev.lock
    python -m pip install -e ".[dev]" --no-deps
    python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload

On macOS/Linux, activate with `source .venv/bin/activate`; the remaining commands
are the same. Open [interactive API docs](http://127.0.0.1:8000/docs) or
[readiness](http://127.0.0.1:8000/api/health).

## Configuration and readiness

`DATA_PATH` defaults to the bundled `data/contractors.csv`. Relative paths resolve
against the repository root. `CORS_ORIGINS` is a comma-separated list of explicit
origins; by default it allows `http://127.0.0.1:5173` and `http://localhost:5173`.
Wildcard origins are rejected. Configuration can be supplied through environment
variables. If using a copied `.env` file, load it explicitly:

    python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --env-file .env

The application does not load `.env` implicitly. `create_app(settings)` supports
explicit configuration in tests and integrations. Startup fails clearly if the
catalog is missing, invalid, or incompatible with the evidence index. Changing
the dataset requires reviewing and updating its associated evidence and hash.

Readiness reports the actual loaded dataset hash and the computed ranking/evidence
version. `ALGORITHM_VERSION` cannot override that value. A successful health
response means both catalog and evidence validation have completed.

## Run checks

    python -m pytest -q
    python scripts/check_api.py --base-url http://127.0.0.1:8000 --repeat 20

The first command runs the backend, matching, and offline-tool tests without
provider calls. The second requires the running API and checks real dataset
outcomes against the independent acceptance oracle. See the root README for
frontend setup, browser checks, and the full demo sequence.
