"""Validate an offline evidence proposal against the versioned source CSV.

This command reads files and prints a report. It never approves, copies, or
promotes a proposal into production evidence. Exact quotes and supported format
labels are necessary checks; a person must still review the quote's meaning,
format relevance, and usefulness in an explanation.

Run: python scripts/validate_evidence_proposal.py --input proposed-evidence.json
For LLM proposals, provide method="llm-proposal", model, and prompt_version.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.matching import load_evidence
from scripts.matching_acceptance import DATASET, load_reference_catalog


def _unique_object(pairs):
    """Prevent ambiguous JSON from silently discarding a contractor or record."""
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def validate_proposal(input_path: str | Path, dataset_path: str | Path = DATASET) -> dict:
    """Return a read-only validation report; no result constitutes approval."""
    input_path = Path(input_path)
    dataset_path = Path(dataset_path)
    payload = json.loads(input_path.read_text(encoding="utf-8"), object_pairs_hook=_unique_object)
    if not isinstance(payload, dict):
        raise ValueError("Evidence proposal root must be an object")
    method = payload.get("method")
    if not isinstance(method, str) or not method.strip():
        raise ValueError("Evidence proposal requires a nonempty method string")
    method = method.strip()
    provenance = {"method": method}
    if method == "llm-proposal":
        for field in ("model", "prompt_version"):
            value = payload.get(field)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"LLM proposal requires a nonempty {field} string")
            provenance[field] = value

    dataset_sha256 = hashlib.sha256(dataset_path.read_bytes()).hexdigest()
    catalog = load_reference_catalog(dataset_path)
    index = load_evidence(catalog, input_path, dataset_sha256=dataset_sha256)
    records = [record for profile_records in index.values() for record in profile_records]
    covered_ids = {identifier for identifier, profile_records in index.items() if profile_records}
    missing_ids = sorted({profile.id for profile in catalog} - covered_ids)
    excluded_records = sum(not record.use_in_explanation for record in records)
    warnings = [
        "Human review is required: an exact quote does not prove that its format tags or claims are relevant.",
        "Validation does not approve or promote this proposal; production evidence was not changed.",
    ]
    if missing_ids:
        warnings.append(
            f"{len(missing_ids)} profiles have no proposed records; a reviewed index limited to this proposal would use their evidence fallback."
        )
    if excluded_records:
        warnings.append(
            f"{excluded_records} records are excluded from explanations and receive no description relevance credit."
        )
    return {
        "validation": "passed",
        "dataset_sha256": dataset_sha256,
        "provenance": provenance,
        "catalog_profile_count": len(catalog),
        "profile_entry_count": len(index),
        "profiles_with_records": len(covered_ids),
        "record_count": len(records),
        "explanation_record_count": len(records) - excluded_records,
        "excluded_record_count": excluded_records,
        "missing_profile_ids": missing_ids,
        "review_required": True,
        "promotion_performed": False,
        "warnings": warnings,
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Proposal JSON to validate; never modified")
    parser.add_argument("--dataset", type=Path, default=DATASET, help="Source CSV; defaults to data/contractors.csv")
    args = parser.parse_args(argv)
    try:
        report = validate_proposal(args.input, args.dataset)
    except (OSError, ValueError, KeyError) as error:
        print(json.dumps({
            "validation": "failed", "error": str(error), "promotion_performed": False,
        }, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
