"""Reproducible domain acceptance oracle and timing report, using the real CSV.

The reference filter here is deliberately independent of bbl's HTTP implementation.
It is test tooling, not a substitute for the production API or a browser demo.
Run from any directory: python scripts/matching_acceptance.py --repeat 20
"""

import argparse
import csv
import hashlib
import json
import math
import platform
import sys
import time
from datetime import date
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.matching import algorithm_version, build_cards, load_evidence, rank_candidates

DATASET = ROOT / "data" / "contractors.csv"
REASONS = ("booked", "over_budget", "unsupported_format", "unsupported_language", "duration_exceeded")


def load_reference_catalog(path=DATASET):
    """Independent CSV fixture adapter for testing domain functions without an API."""
    profiles = []
    with path.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            values = dict(row)
            for name in ("categories", "event_formats", "languages", "busy_dates"):
                values[name] = row[name].split("|") if row[name] else []
            for name in ("synthetic", "city_imputed", "price_imputed"):
                if row[name] not in ("True", "False"):
                    raise ValueError(f"Invalid boolean in {name}")
                values[name] = row[name] == "True"
            values["price_from_kzt"] = int(row["price_from_kzt"])
            values["max_hours"] = float(row["max_hours"]) if row["max_hours"] else None
            values["source_kind"] = "provided"
            profiles.append(SimpleNamespace(**values))
    return profiles


def reference_filter(request, catalog):
    pool = [p for p in catalog if p.city == request.city and request.category in p.categories]
    exclusions = dict.fromkeys(REASONS, 0)
    eligible = []
    for profile in pool:
        failures = (
            request.event_date in profile.busy_dates,
            profile.price_from_kzt > request.budget_kzt,
            request.event_format not in profile.event_formats,
            request.language is not None and request.language not in profile.languages,
            request.duration_hours is not None and profile.max_hours is not None
            and request.duration_hours > profile.max_hours,
        )
        reason = next((code for code, failed in zip(REASONS, failures) if failed), None)
        if reason:
            exclusions[reason] += 1
        else:
            eligible.append(profile)
    return pool, eligible, exclusions


def demo_requests():
    base = dict(city="Алматы", event_date="2026-10-11", event_format="свадьба",
                category="Ведущий", budget_kzt=3000000, duration_hours=None, language=None)
    return {
        "dense_autumn": base,
        "dense_other_date": base | {"event_date": "2026-10-10"},
        "rare_florist": base | {"category": "Флорист", "event_date": "2026-10-10", "budget_kzt": 300000},
        "absent_category": base | {"city": "Астана", "category": "Декоратор", "event_date": "2026-10-10"},
        "all_booked": base | {"city": "Астана", "category": "Флорист", "budget_kzt": 300000},
        "venue_free": base | {"city": "Астана", "category": "Банкетный зал", "event_date": "2026-10-10"},
        "venue_booked": base | {"city": "Астана", "category": "Банкетный зал"},
        "december_scarcity": base | {"event_date": "2026-12-26"},
    }


def evaluate(payload, catalog, evidence):
    request = SimpleNamespace(**payload)
    pool, eligible, exclusions = reference_filter(request, catalog)
    cards = build_cards(request, rank_candidates(request, eligible, evidence), evidence)
    status = "category_absent" if not pool else "matches_found" if eligible else "no_eligible_contractors"
    return dict(status=status, counts=dict(city_category_total=len(pool), eligible_total=len(eligible),
                                          returned_total=len(cards)), exclusions=exclusions, cards=cards)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeat", type=int, default=20)
    parser.add_argument("--json", action="store_true", help="Include complete cards and evidence")
    args = parser.parse_args()
    if args.repeat < 1:
        parser.error("--repeat must be positive")
    catalog = load_reference_catalog()
    dataset_sha256 = hashlib.sha256(DATASET.read_bytes()).hexdigest()
    evidence = load_evidence(catalog, dataset_sha256=dataset_sha256)
    scenarios, timings = {}, []
    for name, payload in demo_requests().items():
        started = time.perf_counter()
        expected = evaluate(payload, catalog, evidence)
        first_ms = (time.perf_counter() - started) * 1000
        for _ in range(args.repeat):
            started = time.perf_counter()
            actual = evaluate(payload, list(reversed(catalog)), evidence)
            timings.append((time.perf_counter() - started) * 1000)
            if actual != expected:
                raise AssertionError(f"Non-deterministic result in {name}")
        scenarios[name] = dict(request=payload, first_request_ms=round(first_ms, 3), **expected)
        if not args.json:
            scenarios[name]["cards"] = [{"id": c["id"], "explanation": c["explanation"]} for c in expected["cards"]]
    timings.sort()
    result = dict(scope="domain matching only; HTTP and browser timing measured separately",
                  python=platform.python_version(), platform=platform.platform(),
                  dataset_version=dataset_sha256, algorithm_version=algorithm_version(),
                  repetitions_per_scenario=args.repeat, timed_requests=len(timings),
                  p95_ms=round(timings[math.ceil(0.95 * len(timings)) - 1], 3),
                  max_ms=round(max(timings), 3), scenarios=scenarios)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
