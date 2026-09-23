# Backend

The FastAPI backend validates and loads the bundled catalog at startup,
normalizes safe request aliases, exposes API metadata, and applies
deterministic hard eligibility filters.

## Run locally

From the repository root, with Python 3.11 or newer:

    python -m venv .venv
    .venv\Scripts\Activate.ps1
    python -m pip install -e ".[dev]"
    python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload

Open http://127.0.0.1:8000/docs for the interactive API schema.

The development API allows browser requests from Vite's default origins:
http://127.0.0.1:5173 and http://localhost:5173. Override configuration using
environment variables or a copied .env file:

    DATA_PATH=data/contractors.csv
    ALGORITHM_VERSION=hard-filter-v1
    CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173

The server refuses to start when its catalog cannot be validated. The matching
endpoint currently returns real business-empty states; eligible candidates need
the ranking/card integration before they can be returned as recommendations.

## Run checks

    python -m unittest discover -s backend/tests -v
