"""Deterministic hard eligibility filtering.

Filtering is intentionally separate from ranking and explanation generation.
Every contractor who passes this module satisfies every structured constraint
in the request.
"""

from .models import Contractor, ExclusionCounts, FilterResult, MatchRequest, RejectionReason


def primary_rejection_reason(
    request: MatchRequest,
    contractor: Contractor,
) -> RejectionReason | None:
    """Return the first failed hard constraint in the agreed fixed order.

    The order affects only the displayed exclusion count when a profile fails
    more than one rule. It never changes eligibility: all conditions remain
    mandatory.
    """

    if request.event_date in contractor.busy_dates:
        return "booked"
    if contractor.price_from_kzt > request.budget_kzt:
        return "over_budget"
    if request.event_format not in contractor.event_formats:
        return "unsupported_format"
    if request.language is not None and request.language not in contractor.languages:
        return "unsupported_language"
    if (
        request.duration_hours is not None
        and contractor.max_hours is not None
        and request.duration_hours > contractor.max_hours
    ):
        return "duration_exceeded"
    return None


def filter_candidates(
    request: MatchRequest,
    catalog: list[Contractor],
) -> FilterResult:
    """Return eligible contractors and reconciled first-failure counts.

    City and category form the initial pool. A contractor outside that pool is
    not an exclusion because it was never a candidate for the request.
    """

    city_category_pool = [
        contractor
        for contractor in catalog
        if contractor.city == request.city and request.category in contractor.categories
    ]

    exclusion_values: dict[RejectionReason, int] = {
        "booked": 0,
        "over_budget": 0,
        "unsupported_format": 0,
        "unsupported_language": 0,
        "duration_exceeded": 0,
    }
    eligible: list[Contractor] = []

    for contractor in city_category_pool:
        reason = primary_rejection_reason(request, contractor)
        if reason is None:
            eligible.append(contractor)
        else:
            exclusion_values[reason] += 1

    return FilterResult(
        city_category_total=len(city_category_pool),
        eligible=eligible,
        exclusions=ExclusionCounts(**exclusion_values),
    )
