"""Compare a running real API against the independent dataset acceptance oracle."""

import argparse
import hashlib
import json
import math
import sys
import time
import urllib.error
import urllib.request

from matching_acceptance import DATASET, demo_requests, evaluate, load_reference_catalog, load_evidence


def post(base_url, payload):
    request = urllib.request.Request(base_url.rstrip("/") + "/api/match",
                                     data=json.dumps(payload).encode("utf-8"),
                                     headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--repeat", type=int, default=20)
    args = parser.parse_args()
    if args.repeat < 1:
        parser.error("--repeat must be positive")
    catalog = load_reference_catalog()
    dataset_version = hashlib.sha256(DATASET.read_bytes()).hexdigest()
    evidence = load_evidence(catalog, dataset_sha256=dataset_version)
    profiles = {p.id: p for p in catalog}
    timings, scenarios = [], {}
    for name, payload in demo_requests().items():
        expected = evaluate(payload, catalog, evidence)
        expected_ids = [card["id"] for card in expected["cards"]]
        for run in range(args.repeat):
            started = time.perf_counter()
            actual = post(args.base_url, payload)
            elapsed_ms = (time.perf_counter() - started) * 1000
            timings.append(elapsed_ms)
            for field in ("status", "counts", "exclusions"):
                if actual.get(field) != expected[field]:
                    raise AssertionError(f"{name}: {field} differs from dataset oracle")
            if [card["id"] for card in actual["cards"]] != expected_ids:
                raise AssertionError(f"{name}: card order differs from deterministic ranking")
            if not isinstance(actual.get("message"), str) or not actual["message"].strip():
                raise AssertionError(f"{name}: missing human-readable outcome")
            for card in actual["cards"]:
                if card["explanation"] != next(c["explanation"] for c in expected["cards"] if c["id"] == card["id"]):
                    raise AssertionError(f"{name}: explanation differs from verified renderer")
                for fact in card["evidence"]:
                    if fact["code"] == "description" and fact["source_quote"] not in profiles[card["id"]].description:
                        raise AssertionError(f"{name}: ungrounded quote")
            if run == 0:
                scenarios[name] = {"ids": expected_ids, "status": actual["status"], "first_request_ms": round(elapsed_ms, 3)}
    invalid = demo_requests()["dense_autumn"] | {"event_date": "2027-01-01"}
    try:
        post(args.base_url, invalid)
    except urllib.error.HTTPError as exc:
        if exc.code != 422:
            raise AssertionError(f"Out-of-window date should be HTTP 422, got {exc.code}") from exc
    else:
        raise AssertionError("Out-of-window date was accepted")
    timings.sort()
    print(json.dumps(dict(scope="real HTTP API", dataset_version=dataset_version,
                          timed_requests=len(timings), p95_ms=round(timings[math.ceil(.95 * len(timings)) - 1], 3),
                          max_ms=round(max(timings), 3), scenarios=scenarios), ensure_ascii=False, indent=2))
    if max(timings) >= 10000:
        raise AssertionError("At least one measured request exceeded the 10-second demo target")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    try:
        main()
    except urllib.error.URLError as exc:
        raise SystemExit(f"API unavailable: start the backend first. {exc.reason}") from exc
