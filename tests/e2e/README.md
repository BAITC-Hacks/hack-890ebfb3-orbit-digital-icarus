# End-to-end tests

Run `npm run test:e2e` against the real backend and frontend (see the root README).
The 13 tests cover the bundled catalog, deterministic/date-sensitive shortlists,
rare and empty outcomes, venues, optional filters, errors/stale responses,
verified one-condition recovery, home/navigation and honest contact drafts.
Matching scenarios use `/#/match`; journey scenarios begin at `/`.
No business result is replaced with a fixture. Deliberate network failure,
delayed delivery and denied clipboard permission are controlled boundary tests.
