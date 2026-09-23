# Integrated clean-clone verification

Verified on **23 September 2026** from a new GitHub clone at **`1292b65394f05e7622bf63a21142ecbf6bb1b79c`** on Enjoy's history. This revision includes the integrated backend, frontend, Russian/English interface, tests and setup documentation. Subsequent handoff edits only update documentation; application code, tests, data and dependency locks remain the tested versions.

## Isolation and environment

- Cloned from the GitHub repository into a previously unused directory; checked out the exact revision above.
- Created a new Python virtual environment and installed `requirements-dev.lock`, then the editable package with `--no-deps`.
- Installed root and frontend packages separately using their committed npm lockfiles. No copied `node_modules` or virtual environment was used; normal package-download caches were allowed.
- Used the installed Playwright Chromium distribution; the browser download cache was reusable.
- Matching and all checks used the clone's own `data/contractors.csv`. No Downloads path, `.env`, provider key or paid inference request was required.
- Windows 11; Python **3.12.10**; Node **26.7.0**; npm **11.19.0**; Chromium **153.0.8010.12**.
- Git status was clean after verification; installations, reports and browser artifacts were ignored. Verification servers were stopped afterward.

## Results

Commands below run from the clone root with its Python environment active. Use the [README](../README.md) for full installation steps.

| Check | Command | Observed result |
| --- | --- | --- |
| Python dependencies | `python -m pip check` | No broken requirements |
| Backend and offline-tool tests | `python -m pytest -q` | **88 passed, 218 subtests passed**; one nonfatal Starlette/HTTPX deprecation warning |
| Independent domain acceptance | `python scripts/matching_acceptance.py --repeat 20` | **160 runs passed**; frozen ordered IDs and repeatability preserved |
| Evidence validation | `python scripts/validate_evidence_proposal.py --input backend/app/matching/profile_evidence.json` | **66 profiles, 99 records, 93 usable / 6 excluded**, valid source containment and tags |
| Transport tests | `npm run test:client` | **49 passed** |
| Localization tests | `npm run test:i18n` | **16 passed** |
| Strict transport TypeScript | `npm run typecheck:client` | Passed |
| Full frontend type check and production build | `npm --prefix frontend run build` | Passed |
| Isolated browser UI | `npm run test:ui` | **6 passed**, 10.5 seconds; explicitly mocked API responses |
| Actual application browser flows | Set `RUN_APP_SERVERS=1`, then `npm run test:e2e` | **8 passed**, 15.7 seconds; services launched from the clone |
| Actual HTTP acceptance | Start the clone's Uvicorn service, then `python scripts/check_api.py --base-url http://127.0.0.1:8000 --repeat 20` | **160 timed requests passed**; also confirmed HTTP 422 for an out-of-window date |

The final recorded HTTP run had p95 **23.071 ms**, maximum **33.424 ms** and first dense request **33.424 ms**. These are request durations with an already-running local service. Browser-suite durations include the whole suite and are not per-request latency. The separate submit-to-visible benchmark is documented in the [demo measurements](demo.md#measured-scope).

CSV SHA-256:

```text
6a724b6b7dfb5973343e68ba18dadb60fc807d87e3d78f03ee86fb26cb089f7d
```

Algorithm/evidence version: **`explainable-v1:2553919e464d7030`**. The dense request returns `HK-42352 → HK-44923 → HK-27222`; changing its date to 2026-10-10 returns `HK-27222 → HK-77838 → HK-72938`. Rare, absent, booked, venue and December cases match the [frozen demo table](demo.md#frozen-scenarios).

## Evidence boundaries

Logs are retained locally under ignored `artifacts/integrated-clone-check/artifacts/verification/`, including `pytest.log`, `browser-ui.log`, `browser-e2e.log` and `http.json`. This document records their results; the commands reproduce the checks without depending on those local files.

This proves the documented integrated setup on the recorded Windows environment. Linux execution remains unverified because [GitHub Actions could not start due to an account billing lock](https://github.com/BAITC-Hacks/hack-890ebfb3-orbit-digital-icarus/actions/runs/35842404798). It does not establish a cloud deployment or a green CI run. The team still needs to merge the tested Enjoy revision into `main`, rerun release checks there and submit through the tournament portal.
