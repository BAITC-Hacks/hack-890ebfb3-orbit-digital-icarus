# Browser acceptance and interface contract

Enjoy owns `tests/e2e/matching.spec.ts` and root `playwright.config.ts`, plus isolated `tests/ui/locale.spec.ts` and `playwright.ui.config.ts`. Both suites passed locally: **eight real-application tests and six isolated interface tests**. They have different scopes and do not replace backend or transport/localization unit tests.

The production API, catalog filters, ranking/evidence modules and React interface are integrated on `main`. Actual browser execution, the frontend build and the local built-bundle preview are verified. [Complete integrated fresh-clone reproduction passed at `1292b65`](reproducibility.md); a deployment or green cloud CI run is not implied.

`npm run test:e2e:list` discovers eight Chromium tests without executing them. Use `npm run test:e2e` for the actual application suite and `npm run test:ui` for isolated UI behavior.

## Implemented UI contract

The application uses labeled native controls with the names below. Russian is the default; the English switch changes visible labels. Select values always retain the canonical Russian strings from metadata. Names are stable across locales.

| Name | Russian / English label | Control |
| --- | --- | --- |
| `city` | Город / City | select |
| `event_date` | Дата мероприятия / Event date | date input |
| `event_format` | Формат мероприятия / Event format | select |
| `category` | Категория подрядчика / Contractor category | select |
| `budget_kzt` | Бюджет, ₸ / Budget, ₸ | number input |
| `duration_hours` | Длительность, ч / Duration, hours | optional number input; empty means null |
| `language` | Язык работы подрядчика / Contractor's working language | optional select; option value `""` means null |

All global categories remain available regardless of city. A valid but absent city/category combination is a required business outcome. Metadata supplies `calendar_start` and `calendar_end`; a metadata error disables the form and offers retry instead of invented options.

The submit button is named **Подобрать подрядчика / Find contractors**, with localized loading text. The following hooks are implemented as test metadata; they do not introduce technical labels into the visible interface:

| Element | Hook |
| --- | --- |
| Event form | `data-testid="match-form"`, `aria-busy="true"` during a request and `"false"` afterwards |
| Result summary | `data-testid="result-summary"`, `data-status` equal to the API outcome, `data-request-date` equal to the response's ISO date |
| Each card | `data-testid="contractor-card"`, `data-contractor-id` equal to the API card ID |
| Synthetic profile note | `data-testid="synthetic-note"` within the applicable card |
| Imputed price note | `data-testid="price-imputed-note"` within the applicable card |
| Imputed city note | `data-testid="city-imputed-note"` within the applicable card |
| Request failure | `data-testid="request-error"`, `role="alert"` |
| Metadata failure | `data-testid="metadata-error"`, `role="alert"` |
| Locale switch | `data-testid="locale-switcher"`, `role="group"`, localized accessible name; Русский / English buttons with `aria-pressed` |

Cards show city, category, starting-price wording and a `DD.MM.YYYY` availability date, with localized synthetic/imputed notices. Server order is preserved. Native labels and controls remain the primary interaction contract; hooks do not replace accessibility. Exact accessible role names are used for select controls because a raw label-text query can include nested option text.

### Localization and grounded content

Russian mode renders the API summary and explanations. English mode renders summaries from the response status/counts/exclusions and explanations from typed date, format, price, budget, working-language and duration facts plus reviewed source-quote translations. All 93 usable evidence quotes have translations in `frontend/src/i18n/evidence.en.json`; evidence expanders also retain the original Russian text. An unknown future quote is labeled as original Russian, and profiles without usable quotes use structured facts.

Locale is stored under `contractor-match-locale` and updates `document.documentElement.lang`. Switching it does not refetch matches, change canonical request values, alter the working-language filter or reorder results. Matching and localization make no online model request. The renderer cannot invent criteria or reinterpret server eligibility.

## Eight application E2E flows

1. Dense autumn category: exact pool/eligible/returned counts, identical repeated response and rendered order, changed visible IDs after changing only the date, distinct explanations after removing names.
2. Rare florist: exactly HK-39372, booked exclusion and visible imputed-price note.
3. Both empty states: absent category versus an entirely booked category, with separate messages.
4. Venue: HK-90012 available on 10 October and booked on 11 October; English and the exact 10-hour duration pass; 11 hours and unsupported Kazakh fail.
5. A null duration limit does not exclude the florist; December scarcity returns one real host without padding.
6. Deliberately aborted network request is a visible error, preserves input and succeeds when retried against the real backend.
7. A held real response cannot replace a newer date result. The test obtains the first response from the actual API and holds delivery, verifies the date input stays editable while loading, edits the date, submits and displays the newer result, then releases the old response. The application aborts the superseded request and also checks a generation counter; the newer result must remain visible after old delivery finishes.
8. A real submission works at 375px without horizontal overflow; the test captures a mobile screenshot.

This suite uses the default Russian interface. It parses real browser responses and compares their card IDs, order, explanations and metadata to the DOM, alongside fixed outcomes established from the supplied CSV. API payloads are attached to the Playwright report with observed submit-to-render timing. Successful submissions through the measurement helper must complete in under ten seconds.

Only the deliberate network-failure and delayed-delivery tests intercept requests. Delayed-delivery content still comes from the actual API. Business-success and empty-state tests never substitute response fixtures.

## Six isolated UI flows

`tests/ui/locale.spec.ts` intercepts `/api/metadata` and `/api/match` explicitly. It uses the actual metadata schema and published contract fixtures, with documented UI-only variations. It requires Vite and Chromium but no Python service, provider key or inference request.

1. Russian default, English labels/document language and preference persistence after reload.
2. English form labels still send canonical Russian city/category/format/working-language values.
3. Locale changes after results preserve response ID order and the working-language filter without fetching metadata or matches again.
4. English explanations use the reviewed translation, starting-price caveat and inspectable original Russian quote.
5. A failed request can retry successfully; over-budget and category-absent outcomes remain distinct, and a budget exclusion does not claim everyone is booked.
6. Keyboard locale selection, submission and evidence expansion work at 375px in both languages without horizontal overflow.

These tests verify presentation and client behavior with controlled responses. They do not establish that production filtering/ranking is correct; that evidence comes from backend, HTTP and application E2E checks.

## Run the suites

Follow the [root setup](../README.md#run-from-a-fresh-checkout) for the locked Python dependencies and environment, then install both npm packages and Chromium from the repository root:

```bash
npm ci
npm --prefix frontend ci
npx playwright install chromium
npm run test:ui
```

The isolated config starts Vite at port 5173 with `VITE_API_MODE=api`, runs one Chromium worker, reports to the console and writes failure artifacts under `test-results/ui`. Outside CI it can reuse an existing Vite server; keep it in real API mode so the mocks exercise the transport path.

Start the real backend and frontend using the integrated README commands, then run from repository root:

```bash
npm run test:e2e
```

Alternatively, set `RUN_APP_SERVERS=1` in the environment before running. The config then starts:

```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Set the variable with `$env:RUN_APP_SERVERS="1"` in PowerShell, or use `RUN_APP_SERVERS=1 npm run test:e2e` on macOS/Linux. Keep the Python environment active. Default frontend URL is `http://127.0.0.1:5173`; API URL is `http://127.0.0.1:8000`. For already-running services, `E2E_BASE_URL` and `E2E_API_URL` override those addresses. Auto-start commands use fixed default ports; if overriding ports, start services explicitly and arrange the corresponding `/api` proxy. The committed Vite configuration proxies `/api` to port 8000.

The backend loads the pinned CSV and reviewed evidence/ranking modules; a stub or alternate dataset should fail the acceptance suite. The application suite retains traces/screenshots/video on failures under `test-results` and writes an HTML report. The isolated suite retains traces and screenshots. Inspect the relevant output before attributing a failure to matching logic, integration or browser setup.

## Recorded measurements

The local environment on **23 September 2026** was Windows 11, Python **3.12.10**, Node **26.7.0**, npm **11.19.0**, Chromium **153.0.8010.12**, dataset SHA-256 `6a724b6b7dfb5973343e68ba18dadb60fc807d87e3d78f03ee86fb26cb089f7d` and algorithm `explainable-v1:2553919e464d7030`.

With real services running:

```bash
python scripts/check_api.py --base-url http://127.0.0.1:8000 --repeat 20
npm run measure:browser
```

| Measurement | Runs | p95 | Maximum |
| --- | ---: | ---: | ---: |
| Real HTTP across eight dataset scenarios | 160 | **21.521 ms** | **53.115 ms** |
| Real browser submit-to-visible result across five scenarios | 20 | **65.88 ms** | **90.76 ms** |

The separate browser measurement script uses real responses without interception, includes automation click/wait overhead and writes `artifacts/browser-latency.json`. Installation/startup time is excluded. These local figures meet the ten-second target for the measured flows; they do not establish hosted network latency or production throughput. Full fresh-clone reproduction also passed, including both browser suites. The inspected cloud CI job was blocked before execution by an account billing lock, so the passing local suites are not a green GitHub Actions claim.
