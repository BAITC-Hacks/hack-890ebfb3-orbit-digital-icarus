# Bug hunt and recovery review

Review snapshot: 23 September 2026. These fixes are integrated with the work of all three branches on `main`, and every suite below was rerun on the integrated revision.

## Fixes in this round

| Finding | Change and expected behavior |
| --- | --- |
| Numeric input accepted exponent text such as `4e` | Budget and duration use explicit text-draft validation. Invalid typed or pasted content blocks submission until corrected. No exponent expansion, character stripping into another number, or silent conversion of an invalid duration into an omitted filter is allowed. Budget requires a positive safe integer; duration accepts a positive decimal with a dot or comma, or deliberate clearing. |
| Catalog loading could hang indefinitely | The client enforces one 10-second deadline across response headers and body, aborts the transport, and cleans up its timer and caller listener. Timeout is distinct from intentional cancellation. A timed-out metadata request exposes retry; a successful retry restores the form. |
| Structurally valid responses could contain contradictory facts | The client checks shortlist size, reconciled exclusion counts, and each card's city, date, category membership and budget against the normalized response request. It preserves server order and legal input normalization. Impossible dates and malformed recovery proposals are rejected. |
| Non-finite validation input could break error serialization | The validation-error handler safely represents non-finite values in the error payload while retaining a structured HTTP 422 response. It does not accept the invalid request or turn failure into an empty shortlist. |
| Empty results offered little practical help | The backend checks one-field alternatives against the complete real filter. Suggestions can change city, date or budget, with any budget change increasing it. Up to three suggestions show verified eligible counts. They require an explicit user click and a new search; they do not silently alter the original query. |

Concrete recovery case: **Astana, Restaurant, 31 October 2026, wedding, 4,000,000 ₸**, with optional constraints unset, has no matching profile in that city/category. Changing only the city to **Almaty** produces **one eligible profile**. The suggestion preserves the date, format, category, budget, language and duration. Availability remains a supplied-calendar snapshot and the displayed price remains a starting price.

All 66 supplied profiles remain in the dataset. Recovery does not fabricate profiles, pad results or relax unchanged hard filters. Nearby-date suggestions search within seven days and the supplied calendar; they are not an exhaustive scheduling search. First-failure exclusion counts describe the original result, not a promise that changing any particular field will work.

## Verification status

The client suite passed **95 tests** and strict client typechecking passed after these client changes. This includes hanging fetch/body deadlines, caller cancellation, cleanup, contradictory response facts and valid/invalid alternatives. A new browser regression stalls metadata, advances the browser clock past ten seconds, then verifies successful retry without submitting a match request.

Current suite inventory for the final integrated run:

| Suite | Cases | Final integrated status |
| --- | ---: | --- |
| Client | 95 | Passed |
| Interface localization | 17 | Passed |
| Numeric validation | 10 | Passed |
| Component behavior | 19 | Passed (includes bbl's home and inquiry components) |
| Isolated browser UI | 16 | Passed (Chromium) |
| Real API/browser E2E | 13 | Passed (Chromium, servers started by Playwright) |
| Backend | 117 tests + 265 subtests | Passed |

The domain acceptance tool (160 timed runs), the strict client type check and the production build also passed. Runs used Windows 11, Python 3.12.10 and the locked dependencies. Cloud CI remains distinct from local evidence: GitHub cannot start Actions jobs in the organizer's organization because of a billing lock, so the workflow is manual-only (see [Automated checks](../README.md#automated-checks)).

## Teammate integration

Spectra supplied additional tests and numeric-input behavior requirements. Bbl supplied strict JSON, date-validation and finite-catalog-value changes. Both are integrated on `main`: grouped budgets such as `4 000 000`, comma decimals, date checks and bbl's strict validation are kept. Spectra's half-hour duration step was not adopted because the API contract accepts any positive duration. The contract, deterministic ordering and explicit recovery behavior are unchanged.

## Bounded model review

The latest OpenAI review covered two profiles and recorded **747 input + 247 output = 994 tokens**. Its evidence proposal failed exact-evidence validation and was **not adopted**. Together with the previous 501-token request, recorded OpenAI usage is **1,495 tokens**. This is a token record, not a monetary cost estimate.

NVIDIA remains at the previously recorded HTTP 401 authentication failure; it was not retried in this round. The shared provider-attempt ledger is now **3/3 used**. No API keys are committed. Runtime matching and the test suites require no model calls; the reviewed extractive evidence remains the production source of description facts.

## Judging criteria

| Criterion | Weight | Evidence from this round and limits |
| --- | ---: | --- |
| Task compliance and functionality | 25 | At most three genuine eligible results; numeric intent preserved; empty outcomes remain distinct; verified recovery requires user choice. All hard filters still apply. |
| Technical implementation | 25 | Bounded network waits, cancellation cleanup, semantic response checks, safe validation errors and deterministic alternatives. Teammate integration and final regressions remain to be recorded. |
| README and reproducibility | 25 | Focused regression coverage and this change record complement the locked setup and earlier clean-clone proof. Update final commands/counts/commit only from completed runs. |
| Value and applicability | 15 | Concrete, checked adjustments help users recover from empty results while preserving price and availability caveats. The anonymized catalog is a demonstration dataset, not live booking inventory. |
| Development potential and originality | 10 | Exact-source evidence and explicit one-field alternatives provide an explainable path to broader matching. Failed model proposals are rejected; larger catalogs and live availability need additional data and validation. |

See [integration notes](integration.md), [browser contract](browser-contract.md), [evidence review](evidence-review.md) and [demo scenarios](demo.md) for the underlying contracts and reproducible checks.
