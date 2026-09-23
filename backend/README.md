# Backend

The FastAPI backend validates and loads the bundled catalog at startup,
normalizes safe request aliases, exposes API metadata, and applies
deterministic hard eligibility filters.

## Run locally

From the repository root, with Python 3.11 or newer:

    python -m venv .venv
    .venv\Scripts\Activate.ps1
    python -m pip install -r requirements-dev.lock
    python -m pip install --no-build-isolation --no-deps -e .
    python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload

requirements-dev.lock is the exact dependency set verified on Windows with
Python 3.14. Regenerate and review it deliberately when upgrading a direct
dependency; do not use an unpinned install during the hackathon demo.

Open http://127.0.0.1:8000/docs for the interactive API schema.

The development API allows browser requests from Vite's default origins:
http://127.0.0.1:5173 and http://localhost:5173. Override configuration using
environment variables. The equivalent .env file contents are:

    DATA_PATH=data/contractors.csv
    ALGORITHM_VERSION=hard-filter-v1
    CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173

To load a copied .env.example file rather than setting process environment
variables, use Uvicorn's explicit environment-file option:

    Copy-Item .env.example .env
    python -m uvicorn backend.app.main:app --env-file .env --host 127.0.0.1 --port 8000 --reload

The server refuses to start when its catalog cannot be validated. The matching
endpoint currently returns real business-empty states; eligible candidates need
the ranking/card integration before they can be returned as recommendations.

## Run checks

    python -m unittest discover -s backend/tests -v
