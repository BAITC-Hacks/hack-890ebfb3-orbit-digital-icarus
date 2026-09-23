# Frontend

React + TypeScript interface for Smart Contractor Matching.

## Run locally

```bash
npm install
npm run dev
```

The default preview mode uses small, explicit response fixtures so the form and
all three business outcomes are reviewable before the FastAPI service lands.
Copy `.env.example` to `.env` and set `VITE_API_MODE=api` when the backend
implements `/api/metadata` and `/api/match`.

## Build check

```bash
npm run build
```

The UI preserves the API card order. It does not perform browser-side ranking
or eligibility filtering.
