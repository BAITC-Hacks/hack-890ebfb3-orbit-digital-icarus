# Integrated release review — 23 September 2026

This is the current product handoff, replacing the branch-only status in older notes. It records implemented behavior and observed checks, not a promised judging score. The official task's technical rubric and the separate Demo Day rubric supplied by the captain are different assessments.

## Tandau extension update

The captain selected **Tandau** (spectra's new branding) and authorized the optional provider/event workspace. See [community behavior and permissions](community.md) and [current integration verification](community-verification.md). Earlier hash/count references below are historical records, including revisions from before the organizer repository's history rewrite; they are not new verification of this extension.

Current scope adds authenticated provider publishing, public browsing, editable service templates, explicit invitation decisions, consent-sensitive team readiness and private event chat. The core anonymous matching dataset/rules remain unchanged. The theme toggle persists light/dark preference and the interface remains RU/EN. Date-change explanations identify actual removed/added profiles and distinguish booked from displaced-in-ranking.

This improves the demo evidence for value and completeness (a source-grounded decision followed by a separate consent-based planning workflow), originality (traceable selection and reconfirmation when scope changes), and development potential (isolated matching/community modules). It does not prove product-market fit, production-scale load, verified identities, bookings or any awarded jury points. Prioritize the original matching brief in the live pitch; demonstrate collaboration as an optional extension.

## Numeric recovery follow-up

After release `3fc7421`, a user reproduced an empty duration field remaining locked after a rejected letter. The retained-edit guard incorrectly treated the next valid digit as continuation of an existing numeric prefix, even when no prefix existed. Both keyboard and change handlers now allow a fresh numeric draft from an empty field; malformed pastes and nonempty `4e2` continuations remain rejected. Regression tests failed before the fix and passed after it, for budget/duration, comma decimals and mobile-style insertion without keydown. Follow-up checks: 14 React tests, 7 numeric unit tests, all 15 isolated browser UI tests and the production build passed. The initial release measurements below remain the record for that run.

## What changed and why

Duration-limit follow-up: the CSV's 57 defined attendance limits range from 2 to 12 hours, with 9 null values. At the captain's request, event duration is now bounded to `(0, 12]` hours or omitted. Per-contractor limits and null attendance semantics are unchanged. Values such as 4903 remain visible as invalid editable drafts rather than being silently clamped; no request is sent. Direct API requests above 12 return HTTP 422, including florist requests. Tests bind the frontend ceiling to published OpenAPI and the backend ceiling to the supplied snapshot maximum. Boundary tests include 12, 12.0001, 12.5, 4903, positive fractions and null. Latest checks: 117 backend tests / 265 subtests, 9 numeric / 17 locale / 15 React tests, 16 isolated browser tests and production build passed; live HTTP probes confirmed 12 → 200, 12.01/4903 → 422, blank/null → 200. An end-to-end run was interrupted when the local frontend server stopped; it was restarted for verification.

After restarting the frontend, all 13 real-application end-to-end tests passed again. The 95 transport tests and strict client TypeScript check also passed.

- Integrated BBL `f3c8529`, Enjoy `9e7d5d0`, spectra `fc3a958`, and main's PR #4 merge `e691a58`, preserving their history. Product work follows in `032561f`; synchronization with the concurrent main update is `a1930af`.
- Preserved strict BBL JSON/date validation, including non-finite catalog-hour rejection, alongside Enjoy's working ranking, evidence, recovery alternatives and malformed-number error handling. No matching stub remains.
- Reconciled two numeric implementations. Invalid characters are rejected atomically: `4e2` never silently becomes `42`. Budget must be a positive safe integer; optional duration accepts any positive decimal, including a comma separator. The brief imposes no half-hour step, so we did not add one.
- Added a bilingual home page: product purpose, three-step workflow, metadata-driven categories, meaningful empty-state guidance, FAQs, snapshot limits and a clear matching CTA. `/#/match` is a direct form link; `/#/how` opens the workflow. Back/forward preserves the draft and result in the current tab.
- Added a contact/inquiry disclosure to every result. The user explicitly chose an honest draft panel because the data has no verified contact directory. Text includes the returned contractor ID and all request conditions. Copy success is not message delivery; denied clipboard access selects text for manual copying. No message, notification or reservation API was added.
- Retained spectra's visual palette, improved hint/button contrast, checked narrow screens and kept keyboard-accessible native controls. Added real screenshots and a repeatable capture script.
- Added a regression requiring `contracts/openapi.json` to equal the running application's schema. Kept existing layered architecture and reused labels, numeric parsers and server matching rules rather than adding a second client matcher or router dependency.

## Compliance with the attached task

The attached DOCX was read directly during this review. Its six requirements remain intact: required/optional inputs; at most three factual explained cards; no booked profiles (including venues); honest shortlists; deterministic order; three distinct business outcomes. The supplied 66-profile CSV remains unchanged.

The brief explicitly excludes booking, applications and contractor notifications from the core. Source-profile contact still prepares local text only; it does not send inquiries. The later captain-approved community workspace adds in-app invitations/chat between registered local accounts in a separate module, not source-profile bookings or external notifications. It is supplementary: explanations and honest outcomes still take priority. Matching availability is only a snapshot covering 23 September–31 December 2026. Starting price is not a confirmed quote; synthetic/imputed flags remain visible.

The provided general rules allow AI-assisted evaluation, but human experts/jury still assess the project. Tests, commits and measurements are evidence of real work, not manufactured activity. This review cannot certify compliance with unpublished instructions, eligibility, attendance or submission rules; the captain must check the official portal and deadline.

## Demo Day scorecard (captain-supplied rubric)

| Criterion | Weight | Demonstrable evidence | Team preparation still needed |
| --- | ---: | --- | --- |
| Value of the solution | 25 | Customer goes from requirements to a small explained shortlist; unsuitable/booked profiles are excluded; rare and empty results save wasted inquiries | Explain the event-planner pain clearly. Do not invent interviews, users or conversion improvements |
| Result and product quality | 20 | Complete home → form → grounded cards → inquiry draft journey; bilingual interface, retry, strict numbers, mobile support and honest contact limitation | Rehearse the exact live requests on the presentation machine |
| Innovation | 15 | Source-traceable, versioned evidence; repeatable ranking; checked alternatives change exactly one condition only after consent | Explain why traceability and reliable empty results matter; do not claim a world-first or autonomous agent |
| Development/scaling potential | 20 | Separate ingestion/validation, filtering, ranking, evidence and transport layers; explicit data/schema versions; roadmap below | Distinguish present 66-profile prototype from future production scale |
| Presentation, demo and Q&A | 20 | Exact script below, expected IDs in `demo.md`, actual screenshots, repeatability/latency evidence and candid limitations | Captain selects presenter, rehearses and submits the correct repository/demo links |

These weights total 100; they are not points already awarded. Code cannot guarantee the jury's judgment.

## Three-minute pitch and live sequence

1. **0:00–0:20 — Problem.** “A long contractor directory is not a decision. A customer needs a short list that fits the date, budget and event, with reasons they can inspect.” Open the home page.
2. **0:20–0:55 — Core value.** Start matching: Алматы / Ведущий / свадьба / 11 October 2026 / 3,000,000 KZT. Five qualify, three are shown. Read the distinct source facts and expand one evidence section. Repeat: IDs/order do not change.
3. **0:55–1:20 — Calendar is real logic.** Change only the date to 10 October. Explain that HK-42352 and HK-44923 are booked and leave the visible shortlist; constraints are not rewritten to keep them.
4. **1:20–1:50 — Honest scarcity.** Алматы / Флорист / 10 October / 300,000 returns one profile, HK-39372. Show the imputed starting-price flag. Then Астана / Флорист / 11 October: no eligible profiles. Choose a verified date alternative explicitly. If time permits, contrast Астана / Декоратор: category absent.
5. **1:50–2:10 — Finish the user journey.** Open the inquiry draft and copy it. State clearly: the provided data is anonymous, there is no verified directory, and nothing has been sent or booked. Switch language if useful.
6. **2:10–2:35 — Explain internals.** “Validate → normalize aliases → hard filters → deterministic rank → grounded cards. Same data and algorithm version, same answer. Offline AI can propose evidence; reviewed versioned facts drive runtime matching.”
7. **2:35–3:00 — Next step.** Discuss consented contact onboarding, fresh calendars/quotes and evaluation at larger scale. State the measured local response range, not an internet-performance promise.

Keep the venue example from `demo.md` ready for questions. Screenshots are a fallback, not a substitute for the required live demonstration.

## Q&A crib sheet

- **Is the runtime an LLM?** No. Matching is deterministic, makes no provider call and needs no key. The optional offline AI evidence proposal/review workflow is documented separately. Do not describe every request as live AI reasoning.
- **Why these three?** All satisfy every hard condition. Reviewed event-relevant facts dominate ranking; budget headroom is secondary; starting price and stable ID break ties. Show the exact formula in README.
- **Can explanations hallucinate?** Runtime statements come from typed fields and reviewed source quotes. Exact-quote validation catches stale/mismatched evidence; semantic review is still required because an exact quote can be irrelevant or misleading. Profiles are not independently verified.
- **Why no phone/WhatsApp button?** There is no verified contact field in the source. Fabricating one would mislead users. The draft is a useful next step until verified onboarding exists.
- **What if nobody fits?** The app distinguishes an absent city/category pool from excluded candidates. Verified alternatives keep all but one condition unchanged and require explicit user selection; otherwise the empty result remains honest.
- **How does this scale?** See the staged roadmap; current timings are for 66 records on one local machine, not proof of production load capacity.

## Development roadmap — proposed, not implemented

1. **Trusted pilot:** build on the local-account/explicit-consent prototype with verified contact ownership, current quotations and calendar timestamps, recovery/moderation/privacy processes and deployment-grade abuse controls. Measure whether users understand shortlist reasons, not just clicks. Current local accounts do not verify real identities.
2. **Larger catalog:** move structured catalog/calendar data to indexed storage; retain exact hard filters before top-k ranking; batch and version evidence ingestion; evaluate cache invalidation when dates/prices change. Benchmark larger realistic datasets and concurrent searches before claiming scale.
3. **Quality loop:** collect opt-in relevance feedback, create a held-out query set and measure eligibility violations (target zero), evidence support, useful shortlists and latency. Use embeddings or reranking only if measured quality improves without weakening constraints or repeatability.

## Verification for the integrated source

The table below records the original integrated-product review. The newer [one-command launch verification](launcher-verification.md) covers the dark theme plus automatic setup: **152 Python tests / 265 subtests, 13 real-browser flows and 160 HTTP requests** passed against a fresh clone's single production server. Latest UI/unit counts are also recorded there; do not read the historical counts below as the current total.

Executed with fresh locked dependency installations in the working checkout: Windows 11, Python 3.14.4, Node 24.15.0, npm 11.12.1, Chromium 153.0.8010.12. No provider credentials or paid calls required.

| Check | Observed result |
| --- | --- |
| Backend tests | 115 passed, 255 subtests |
| Transport, locale, numeric units | 95 + 16 + 7 passed |
| React components | 13 passed |
| Strict TypeScript + production build | Passed |
| Isolated browser UI (explicit fixtures) | 13 passed |
| Application browser E2E (real catalog/API) | 13 passed |
| Built production bundle on port 4173 | All 13 real-application E2E tests passed again |
| Independent domain scenarios | 160 runs passed |
| Real HTTP scenarios | 160 runs passed; p95 23.327 ms, max 45.550 ms |
| Real browser submit-to-result | 20 runs; p95 74.730 ms, max 113.900 ms |
| Dependency installs | Both `npm ci` reported zero audit vulnerabilities; `pip check` passed (not a full security audit) |
| Source/schema | Original CSV hash preserved; published OpenAPI parity test passed |

One initial inquiry E2E assertion failed because the Windows clipboard normalized newlines to CRLF. The test now compares normalized line endings; actual inquiry content is unchanged and the complete suite passed again. Pytest reports the pinned Starlette/httpx deprecation and a machine-local cache warning; neither is a failed behavior check. Earlier clean-clone reports remain historical and are linked from README, not relabeled as results for new code.

## Engineering decisions and web references

Numeric controls are controlled text drafts with numeric/decimal keyboard hints plus whole-draft and submit validation. `inputmode` is a keyboard hint, not validation; browser numeric inputs can accept unwanted editing characters. These choices follow [MDN's inputmode reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode) and [number input guidance](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/number). Server validation remains authoritative.

Code comments describe module boundaries, invariants, non-obvious edits, request races and clipboard fallbacks. Generated JSON, lock files and source CSV remain machine-readable; documentation must not imply every source line carries a comment. A literal every-line rewrite is not part of the observed verification above.

## Final handoff

- Pull `main`; double-click `Start Tandau.cmd` or run `python start.py` after installing Python and Node once. The launcher builds real API mode; no separate backend/frontend commands are required for judging. The old Orbit shortcut remains an alias.
- Rehearse on the presentation machine and verify dense/rare/empty/date examples. Keep the launch window open; use the current local screenshots as backup.
- Per the additional organizer notice supplied on 23 September, the README must explain purpose, launch, technologies and verification independently. Team members must remain at the venue until 18:00 even if coding finishes early; this is a human participation requirement, not something automated tests can certify.
- Verify portal requirements, submit the project and confirm the submission receipt before the actual deadline. This code work does not submit the entry.
- Check GitHub Actions for the final SHA. Older runs were account/billing-blocked before any test step; do not call cloud CI green based on local passes.
- No public hosting, verified contact directory, booking, payment or live-calendar integration is claimed.
