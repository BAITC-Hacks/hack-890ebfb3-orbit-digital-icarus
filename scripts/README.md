# Reproducible checks and evidence tools

Run these from the repository root after the [locked setup](../README.md#run-from-a-fresh-checkout). Source data comes from the bundled CSV, not a developer's Downloads folder.

| Tool | Purpose | Command |
| --- | --- | --- |
| `matching_acceptance.py` | Independent CSV/filter oracle, frozen ranked scenarios and repeated deterministic results | `python scripts/matching_acceptance.py --repeat 20` |
| `check_api.py` | Compare real HTTP responses with the independent oracle; validate versions, counts, exclusions and cards; measure request time | `python scripts/check_api.py --base-url http://127.0.0.1:8000 --repeat 20` |
| `measure_browser.mjs` | Twenty real submit-to-visible measurements through the running UI/API, with no response fixtures | `npm run measure:browser` |
| `validate_evidence_proposal.py` | Check source identity, exact quotes, supported format tags and artifact structure; semantic review remains separate | `python scripts/validate_evidence_proposal.py --input backend/app/matching/profile_evidence.json` |
| `propose_evidence.py` | Optional bounded NVIDIA/OpenAI quote proposals; dry run by default, never part of live matching | Follow [offline evidence instructions](../docs/offline-evidence.md) |

HTTP and browser measurement tools require the actual services running. Reports and optional provider proposals stay under ignored `artifacts/`. Normal verification and the application need no provider credentials and make no paid inference calls. Read the [demo](../docs/demo.md) and [browser contract](../docs/browser-contract.md) for measured scope and expected results.
