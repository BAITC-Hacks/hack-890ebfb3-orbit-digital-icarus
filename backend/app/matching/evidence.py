"""Load a reviewed extractive evidence index and verify it against its catalog."""

import hashlib
import json
from pathlib import Path
from types import MappingProxyType
from typing import Iterable

from .types import ContractorLike, EvidenceIndex, ProfileEvidence

DEFAULT_EVIDENCE_PATH = Path(__file__).with_name("profile_evidence.json")
RANKING_VERSION = "explainable-v1"


def load_evidence(catalog: Iterable[ContractorLike], path: str | Path = DEFAULT_EVIDENCE_PATH, *, dataset_sha256: str | None = None) -> EvidenceIndex:
    """Reject stale/unsupported evidence rather than inventing replacement facts."""
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Profile evidence root must be an object")
    if payload.get("schema_version") != "1":
        raise ValueError("Unsupported profile evidence schema")
    if dataset_sha256 is not None and payload.get("dataset_sha256") != dataset_sha256:
        raise ValueError("Profile evidence belongs to a different dataset")
    profiles = list(catalog)
    by_id = {profile.id: profile for profile in profiles}
    if len(by_id) != len(profiles):
        raise ValueError("Duplicate contractor IDs in evidence catalog")
    raw_index = payload.get("profiles")
    if not isinstance(raw_index, dict):
        raise ValueError("Evidence profiles must be an object keyed by contractor ID")
    result = {}
    seen_ids: set[str] = set()
    for contractor_id, records in raw_index.items():
        if contractor_id not in by_id:
            raise ValueError(f"Evidence references unknown contractor {contractor_id}")
        if not isinstance(records, list):
            raise ValueError(f"Evidence for {contractor_id} must be a list")
        contractor = by_id[contractor_id]
        approved = []
        seen_quotes = set()
        for record in records:
            if not isinstance(record, dict):
                raise ValueError(f"Invalid evidence record for {contractor_id}")
            evidence_id, quote, formats = record.get("id"), record.get("quote"), record.get("event_formats")
            if not isinstance(evidence_id, str) or not evidence_id.startswith(f"{contractor_id}:"):
                raise ValueError(f"Evidence ID does not belong to {contractor_id}")
            if evidence_id in seen_ids:
                raise ValueError(f"Duplicate evidence ID {evidence_id}")
            if not isinstance(quote, str) or not quote.strip() or quote not in contractor.description:
                raise ValueError(f"Evidence quote is not in the description of {contractor_id}")
            if quote in seen_quotes:
                raise ValueError(f"Duplicate evidence quote for {contractor_id}")
            if not isinstance(formats, list) or any(not isinstance(item, str) or item not in contractor.event_formats for item in formats) or len(formats) != len(set(formats)):
                raise ValueError(f"Unsupported evidence format for {contractor_id}")
            use_in_explanation = record.get("use_in_explanation", True)
            if not isinstance(use_in_explanation, bool):
                raise ValueError(f"Invalid explanation flag for {contractor_id}")
            if not use_in_explanation and formats:
                raise ValueError(f"Non-explanatory evidence must not earn ranking credit: {evidence_id}")
            approved.append(ProfileEvidence(evidence_id, quote, tuple(formats), use_in_explanation))
            seen_ids.add(evidence_id)
            seen_quotes.add(quote)
        result[contractor_id] = tuple(sorted(approved, key=lambda item: item.id))
    return MappingProxyType(result)


def algorithm_version(path: str | Path = DEFAULT_EVIDENCE_PATH) -> str:
    """Include evidence content so a changed quote/tag never hides behind a version."""
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
    return f"{RANKING_VERSION}:{digest}"
