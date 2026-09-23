# Frontend

React + TypeScript interface for Smart Contractor Matching.

## Run locally

```bash
npm --prefix frontend ci
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Run these commands from the repository root. The Vite development server proxies
`/api` to the backend at `http://127.0.0.1:8000`; start it in another terminal with
`python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000`.

The integrated application uses the real API by default. B1 currently supplies
health and metadata; match requests return an explicit development 503 until B2
filtering/orchestration is ready. No fixture response replaces an API failure.
For presentation development only, copy `frontend/.env.example` to `frontend/.env`
and set `VITE_API_MODE=demo`. That mode shows a visible preview label and is not a
real-data matching demo.

## Build check

```bash
npm --prefix frontend run build
```

The UI preserves the API card order. It does not perform browser-side ranking
or eligibility filtering.

Russian is the default interface. The separate Русский / English control changes
interface text without changing canonical API values or the contractor's optional
working-language filter. Original evidence quotes remain inspectable.
