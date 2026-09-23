# Smart Contractor Matching frontend

The integrated React interface searches the bundled contractor catalog through the real FastAPI service. It shows up to three ordered cards, inspectable supporting evidence, distinct empty outcomes and retryable failures. Russian is the default; the separate English control changes interface text without changing the matching request.

## Start locally

Run commands from the **repository root**, using Node `^22.12.0 || ^24.0.0 || >=26.0.0` and npm:

```bash
npm ci
npm --prefix frontend ci
```

The root installation supplies shared unit/browser tools; the frontend installation supplies React and Vite. Use both lockfiles. Follow the [root setup guide](../README.md#run-from-a-fresh-checkout) for Python and backend installation.

Start the backend in one terminal with its Python environment activated:

```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Start Vite in another terminal:

```bash
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to **http://127.0.0.1:8000**. No API key or environment file is necessary. Health, metadata and matching are implemented; API errors remain visible errors and are never replaced by example results.

For design work only, copy `frontend/.env.example` to `frontend/.env` and explicitly set `VITE_API_MODE=demo`, then restart Vite. A visible preview notice identifies that mode. Remove the override or set it to `api` before real API checks. Provider credentials belong only in the optional offline development workflow and must never be supplied to the browser or a `VITE_*` variable.

## Interface behavior

- City, category and event-format choices come from `/api/metadata`; date limits use its `calendar_start` and `calendar_end` fields.
- **Русский / English** persists locally and updates the document language. Select labels are translated, while their canonical API values remain Russian.
- **Contractor's working language** is a separate optional matching constraint. Changing interface language preserves that filter, existing card order and results without another match request.
- English explanations use structured facts and 93 reviewed quote translations. Each evidence expander retains the original Russian source quote. Russian mode preserves the server's explanation.
- Starting prices, supplied synthetic profiles and imputed fields are visibly identified. “Free” refers to the supplied calendar snapshot and needs confirmation before booking.
- The UI preserves server order and never performs its own ranking or pads short results. It distinguishes an absent category, no eligible contractor, invalid input, metadata failure and request failure.
- Editing the form cancels the outstanding search and clears stale results. Request-generation guards prevent an older response from replacing current state. Retry preserves the entered request.
- Form controls, locale controls and evidence expanders support keyboard use; the 375px layout is covered by browser checks.

Screenshots: [Russian](../docs/images/interface-ru.png) · [English](../docs/images/interface-en.png). See the [demo walkthrough](../docs/demo.md) for concrete requests and expected IDs.

## Files and boundaries

| Path | Purpose |
| --- | --- |
| `src/App.tsx`, `src/styles.css` | Form, result states, cards, evidence and responsive layout |
| `src/api/client.ts`, `types.ts` | Framework-independent transport, abort support, errors and runtime response guards |
| `src/api/demo.ts` | Explicitly selected design-preview responses |
| `src/i18n/index.ts`, `evidence.en.json` | Labels, factual English explanations, reviewed quote translations and locale persistence |
| `src/api/client.test.ts`, `src/i18n/index.test.ts` | Transport and localization unit checks |
| `../tests/ui/` | Isolated UI flows using mocked API responses |
| `../tests/e2e/` | Integrated browser flows against the real application |

Types are manually aligned with [the shared contract](../contracts/openapi.json). The client rejects malformed successful responses, exposes HTTP 422 validation details and keeps transport failures separate from valid business-empty responses. Backend filtering and ranking remain authoritative.

## Build and checks

The UI pins React **19.1.1**, Vite **7.3.6** and TypeScript **5.9.2**. From the repository root:

```bash
npm run test:client
npm run test:i18n
npm run typecheck:client
npm --prefix frontend run build
npx playwright install chromium
npm run test:ui
```

The build runs the full application type check and writes `frontend/dist`. Check that built bundle locally while the backend remains on port 8000:

```bash
npm --prefix frontend run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Open **http://127.0.0.1:4173**. This preview's `/api` proxy and real dense shortlist have been verified. A hosted deployment must likewise provide the backend and route same-origin `/api` requests to it; static files alone cannot run matching.

`test:ui` starts Vite and uses explicit HTTP fixtures, so it needs no Python service. With the actual backend and frontend running, execute:

```bash
npm run test:e2e
npm run measure:browser
```

Alternatively, set `RUN_APP_SERVERS=1` for the real-browser suite to start both services; its Python environment must be active. Custom running-service addresses use `E2E_BASE_URL` and `E2E_API_URL`. `npm run test:e2e:list` is discovery only.

Recorded local results: **49 transport tests, 16 locale tests, 6 isolated Chromium UI tests and 8 integrated Chromium browser tests passed**, along with strict transport types and the frontend build. See the [root verification record](../README.md#recorded-local-verification) for environment, timing scope, clean-clone status and the cloud CI limitation.
