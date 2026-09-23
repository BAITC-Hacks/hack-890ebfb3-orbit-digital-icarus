"""Shared domain and API contracts.

This is the initial contract scaffold. Filtering, catalog loading, ranking,
and explanation logic should remain in separate modules.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


OutcomeStatus = Literal[
    "matches_found",
    "category_absent",
    "no_eligible_contractors",
]

RejectionReason = Literal[
    "booked",
    "over_budget",
    "unsupported_format",
    "unsupported_language",
    "duration_exceeded",
]


class MatchRequest(BaseModel):
    """Normalized request accepted by the matching domain."""

    city: str
    event_date: date
    event_format: str
    category: str
    budget_kzt: int = Field(gt=0)
    duration_hours: float | None = Field(default=None, gt=0)
    language: str | None = None


class Contractor(BaseModel):
    """One normalized contractor record from the supplied catalog."""

    id: str
    anon_name: str
    categories: list[str]
    city: str
    city_imputed: bool
    synthetic: bool
    price_from_kzt: int = Field(gt=0)
    price_imputed: bool
    event_formats: list[str]
    languages: list[str]
    max_hours: float | None = Field(default=None, gt=0)
    busy_dates: set[date]
    description: str
    source_kind: Literal["provided", "team_added"] = "provided"


class ExclusionCounts(BaseModel):
    """Mutually exclusive first-failure counts for a city/category pool."""

    booked: int = Field(default=0, ge=0)
    over_budget: int = Field(default=0, ge=0)
    unsupported_format: int = Field(default=0, ge=0)
    unsupported_language: int = Field(default=0, ge=0)
    duration_exceeded: int = Field(default=0, ge=0)


class FilterResult(BaseModel):
    """Output of hard filtering before ranking."""

    city_category_total: int = Field(ge=0)
    eligible: list[Contractor]
    exclusions: ExclusionCounts


class CountSummary(BaseModel):
    city_category_total: int = Field(ge=0)
    eligible_total: int = Field(ge=0)
    returned_total: int = Field(ge=0)


class MatchResponse(BaseModel):
    """Stable response envelope for the match endpoint."""

    schema_version: str = "1"
    status: OutcomeStatus
    request: MatchRequest
    dataset_version: str
    algorithm_version: str
    message: str
    counts: CountSummary
    exclusions: ExclusionCounts
    cards: list[dict] = Field(default_factory=list, max_length=3)
