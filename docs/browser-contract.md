# Real browser acceptance contract

Enjoy owns `tests/e2e/matching.spec.ts` and the root `playwright.config.ts`. The suite exercises the actual UI, backend and pinned CSV. It does not replace backend matching or frontend component tests.

**Readiness:** the suite is authored against the shared API contract in `Instructions.md`. At the time of this handoff, bbl's API and spectra's application scaffold have not been integrated, so no passing browser run is claimed. The first integrated run must reconcile selectors with the actual UI, record results and fix defects before release.

`npx playwright test --list` successfully loaded the configuration and discovered all eight Chromium tests. This checks test discovery/transpilation only; it does not start either service or verify browser behavior.

## Minimal UI contract for spectra

Use labeled native form controls with these names or test IDs. Russian labels are preferred; the tests recognize English equivalents as a fallback. Select option values must use the canonical values received from metadata; visible labels may be capitalized.

| Name / optional control test ID | Visible label | Control |
| --- | --- | --- |
| `city` | Город | select |
| `event_date` | Дата мероприятия | date input |
| `event_format` | Формат мероприятия / Тип мероприятия | select |
| `category` | Категория | select |
| `budget_kzt` | Бюджет | number input |
| `duration_hours` | Длительность / Продолжительность | optional number input; empty means null |
| `language` | Язык | optional select; option value `""` means null |

Keep all global categories available regardless of city. A valid but absent city/category combination is a required business outcome.

The form's submit button must have an accessible name such as `Подобрать`, `Найти` or `Поиск`. Use the following small hooks; they are test metadata and need not appear as technical details in the visible UI:

| Element | Hook |
| --- | --- |
| Event form | `data-testid="match-form"`, `aria-busy="true"` during a request and `"false"` afterwards |
| Result summary | `data-testid="result-summary"`, `data-status` equal to the API outcome, `data-request-date` equal to the response's ISO date |
| Each card | `data-testid="contractor-card"`, `data-contractor-id` equal to the API card ID |
| Synthetic profile note | `data-testid="synthetic-note"` within the applicable card |
| Imputed price note | `data-testid="price-imputed-note"` within the applicable card |
| Imputed city note | `data-testid="city-imputed-note"` within the applicable card |
| Request failure | `data-testid="request-error"` or an accessible `role="alert"` |

Render the API's summary and each explanation without replacing them with independent browser prose, and preserve card order. Show city, category, starting-price wording and a `DD.MM.YYYY` availability date. Notes should explain synthetic/imputed data in ordinary Russian. Native labels and controls remain the primary interaction contract; hooks do not replace accessibility.

## What the suite checks

1. Dense autumn category: exact pool/eligible/returned counts, identical repeated response and rendered order, changed visible IDs after changing only the date, distinct explanations after removing names.
2. Rare florist: exactly HK-39372, booked exclusion and visible imputed-price note.
3. Both empty states: absent category versus an entirely booked category, with separate messages.
4. Venue: HK-90012 available on 10 October and booked on 11 October; English and the exact 10-hour duration pass; 11 hours and unsupported Kazakh fail.
5. A null duration limit does not exclude the florist; December scarcity returns one real host without padding.
6. Deliberately aborted network request is a visible error, preserves input and succeeds when retried against the real backend.
7. A delayed real response cannot replace a newer date result. The test accepts serial submission with a disabled button; if concurrent requests are permitted, it releases the older response last and checks the newer result remains.
8. A real submission works at 375px without horizontal overflow; the test captures a mobile screenshot.

The tests parse the real browser response and compare its card IDs, order, explanations and metadata to the DOM. They also assert fixed outcomes independently established from the supplied CSV. API payloads are attached to the Playwright report with observed submit-to-render timing. Every tested successful submission must complete in under ten seconds.

Only the deliberate network-failure and delayed-delivery tests intercept requests. Delayed-delivery content still comes from the actual API. Business-success and empty-state tests never substitute response fixtures.

Per-submission observations are not a complete benchmark. Before release, perform the planned twenty-run representative latency measurement separately, record environment/version details, and distinguish HTTP time from full browser rendering time.

## Running after integration

The root Playwright dependency and lockfile are now committed. Run `npm ci` and `npx playwright install chromium`, install the locked backend dependencies, and install the frontend dependencies once spectra publishes the application package. Browser execution still needs real backend endpoints and the actual UI.

Start the real backend and frontend using the integrated README commands, then run from repository root:

```bash
npx playwright test
```

Alternatively, set `RUN_APP_SERVERS=1` in the environment before running. The config then starts:

```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Default frontend URL is `http://127.0.0.1:5173`; API URL is `http://127.0.0.1:8000`. For already-running services, `E2E_BASE_URL` and `E2E_API_URL` override those addresses. Auto-start commands use the fixed default ports; if overriding ports, start the services explicitly. The Vite development server must proxy `/api` to the backend, or the frontend client must use its documented API base URL with backend CORS configured.

The backend must load the exact pinned CSV and the Enjoy evidence/ranking modules. A stub or alternate dataset should fail the acceptance suite clearly. Playwright retains traces/screenshots/video on failures and writes an HTML report; inspect the report before attributing a failure to matching logic versus integration or browser setup.
