# One-command launch verification

This is the historical launch verification. The current product is **Tandau**, started with `Start Tandau.cmd` or the unchanged `python start.py`; the Orbit shortcut remains compatible. See [current community integration verification](community-verification.md) for the newer source and tests. The `.orbit` directory name is retained to preserve local installations/data.

Verified on **23 September 2026**, source **`6ee3714`**, including the team's dark-theme commit `b9a9719`. This is a fresh local Git clone of the committed source, not a reuse of the developer's installed checkout. Windows 11, Python 3.14.4, Node 24.15.0, npm 11.12.1 and Chromium 153.0.8010.12 were used. No provider keys or paid inference requests were needed.

## What a judge does

Install Python and Node once if missing, then double-click **Start Orbit.cmd** in the cloned/downloaded project. Alternatively run **`python start.py`** (`python3` on macOS/Linux). The app opens the home page; the short verification steps at the top of [README](../README.md#verify-it-in-two-minutes--no-coding-required) need no terminal or programming knowledge.

The launcher creates an ignored private Python environment, installs locked dependencies, builds the real frontend, and runs one loopback server for website and API. It never changes system packages, stops a port's existing owner, or needs an API key. Initial dependency installation requires internet. Ordinary matching does not.

## Clean-clone procedure and results

1. Clone the committed local `main` into a new temporary directory whose name contains spaces. Before launch, confirm `.venv`, `.orbit`, root/frontend `node_modules` and `frontend/dist` are all absent.
2. Invoke that clone's **Start Orbit.cmd** from an unrelated current directory with `--no-browser --port 8790`. The browser-opening step is suppressed for automation; installation, build, server startup and matching are real.
3. Run the clone's Python suite using `.orbit/venv/Scripts/python.exe -m pytest -q`. Run its independent HTTP checker against port 8790. From the verification harness, set both `E2E_BASE_URL` and `E2E_API_URL` to that one address and run `npm run test:e2e`.
4. Invoke the same launcher with `--prepare-only`, `PIP_NO_INDEX=1` and `npm_config_offline=true`. All three stages report ready; no install/build subprocess is required. This warm setup check took **0.310 seconds**, excluding browser/server startup. This is a cache check with package tools set offline, not a disconnected-network experiment.
5. Press Ctrl+C in the launch session. Verify the owned server no longer listens on port 8790. Windows' batch wrapper asks `Terminate batch job (Y/N)?`; answer `Y`. A normal Python-command launch does not need the batch confirmation.
6. Restart through the Python-command entry point and capture the actual home and Russian/English results. The README screenshots now reflect the integrated dark theme, not mockups.

| Check | Observed result |
| --- | --- |
| Fresh dependency setup | Passed; venv, pinned pip install, `pip check`, frontend `npm ci` and TypeScript/production build completed automatically |
| Python tests in the clone's private environment | **152 passed, 265 subtests**, including 35 bootstrap and static-serving checks |
| Real HTTP acceptance, same production server | **160 requests passed** across eight frozen scenarios; p95 **26.008 ms**, maximum **27.974 ms** |
| Real application browser suite, same production server | **13 passed** in 17.1 seconds |
| Isolated mocked browser UI suite in the working checkout | **16 passed** in 19.6 seconds; these are not real-backend acceptance evidence |
| Working-checkout transport / locale / numeric / React checks | **95 / 17 / 9 / 15 passed**; strict client TypeScript passed |
| Domain acceptance in the working checkout | **160 runs passed**, unchanged frozen IDs and evidence version |
| Cache, spaces in paths, unrelated working directory, clean shutdown | Passed |
| Clone Git status after installs/tests | Clean; generated environments, builds and caches remain ignored |

The bootstrap tests cover locked installs, failed-install retries, cache reuse, changed source/locks, missing environment/build recovery, missing/unsupported Node guidance, prepare-only mode, argument handling, busy-port fallback and stopping only an owned child. Static-serving tests exercise the real catalog API alongside HTML/assets, preserved HTTP 422 errors, API/docs precedence, missing build guidance and rejection of private file/path traversal requests.

## Architecture and evidence boundaries

`backend/app/web.py` mounts only `frontend/dist` after existing routes, following [FastAPI's StaticFiles mounting pattern](https://fastapi.tiangolo.com/tutorial/static-files/). The existing API factory still validates catalog/evidence before readiness. Hash navigation needs no arbitrary HTML fallback; unknown API/file routes remain errors. The server binds to `127.0.0.1`; this is not public hosting.

Source CSV SHA-256 remains `6a724b6b7dfb5973343e68ba18dadb60fc807d87e3d78f03ee86fb26cb089f7d`; ranking/evidence version remains `explainable-v1:2553919e464d7030`. No matching rules, request fields, data, or model-call behavior changed.

The pinned Starlette/httpx combination produces a deprecation warning, not a failed test. A separate developer-checkout pytest cache warning was absent in the clean clone. HTTP timings exclude installation and startup; browser-suite duration is not a per-request latency measurement. macOS/Linux startup paths are implemented, but were not executed on separate machines in this review. The previously documented GitHub billing lock is not resolved or disguised by these local results.

Only our new, unpublished launcher commit was applied on top of the team's rewritten remote history after verifying that its prior source matched the previously reviewed main. The older local history was retained in a local backup branch; it was not force-pushed back over teammate work.
