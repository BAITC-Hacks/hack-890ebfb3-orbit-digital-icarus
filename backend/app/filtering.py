"""Hard eligibility filtering.

Implementation owner: bbl.
Filtering must remain deterministic and separate from ranking or explanation
generation.
"""

from .models import Contractor, FilterResult, MatchRequest


def filter_candidates(
    request: MatchRequest,
    catalog: list[Contractor],
) -> FilterResult:
    """Return eligible contractors and first-failure exclusion counts."""

    raise NotImplementedError("Candidate filtering is not implemented yet")
