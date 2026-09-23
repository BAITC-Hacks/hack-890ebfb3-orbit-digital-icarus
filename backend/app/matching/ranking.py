"""Deterministic scoring of already eligible contractors; no network calls."""

from typing import Iterable

from .types import ContractorLike, EvidenceIndex, MatchRequestLike, RankedCandidate, iso_date


def assert_eligible(request: MatchRequestLike, contractor: ContractorLike) -> None:
    """Fail closed if an integration accidentally sends an ineligible profile."""
    if request.budget_kzt <= 0:
        raise ValueError("Budget must be positive before ranking")
    checks = (contractor.city == request.city, request.category in contractor.categories, iso_date(request.event_date) not in {iso_date(day) for day in contractor.busy_dates}, contractor.price_from_kzt <= request.budget_kzt, request.event_format in contractor.event_formats, request.language is None or request.language in contractor.languages, request.duration_hours is None or contractor.max_hours is None or request.duration_hours <= contractor.max_hours)
    if not all(checks):
        raise ValueError(f"Ranking received ineligible contractor {contractor.id}")


def rank_candidates(request: MatchRequestLike, eligible: Iterable[ContractorLike], evidence: EvidenceIndex) -> list[RankedCandidate]:
    """Relevant approved facts dominate headroom; price and ID break ties."""
    ranked = []
    seen = set()
    for contractor in eligible:
        assert_eligible(request, contractor)
        if contractor.id in seen:
            raise ValueError(f"Duplicate candidate ID {contractor.id}")
        seen.add(contractor.id)
        relevant = sorted((item for item in evidence.get(contractor.id, ()) if request.event_format in item.event_formats), key=lambda item: item.id)
        headroom = 100 * (request.budget_kzt - contractor.price_from_kzt) // request.budget_kzt
        score = 1000 * min(2, len(relevant)) + headroom
        ranked.append(RankedCandidate(contractor, score, tuple(item.id for item in relevant[:2])))
    return sorted(ranked, key=lambda item: (-item.score, item.contractor.price_from_kzt, item.contractor.id))
