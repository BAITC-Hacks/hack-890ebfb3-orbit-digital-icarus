"""Shared domain and API contracts.

Filtering, catalog loading, ranking, and explanation logic remain in separate
modules. These models define the stable boundary between those components.
"""

from datetime import date
from math import isfinite
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from .constants import CALENDAR_END, CALENDAR_START


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

EvidenceCode = Literal[
    "availability",
    "budget",
    "format",
    "language",
    "duration",
    "description",
]

SourceKind = Literal["provided", "team_added"]


def _clean_required_text(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("must be a string")
    normalized = " ".join(value.strip().split())
    if not normalized:
        raise ValueError("must not be blank")
    return normalized


class MatchRequest(BaseModel):
    """Normalized request accepted by the matching domain."""

    city: str
    event_date: date
    event_format: str
    category: str
    budget_kzt: int = Field(gt=0)
    duration_hours: float | None = Field(default=None, gt=0)
    language: str | None = None

    @field_validator("city", "event_format", "category", mode="before")
    @classmethod
    def clean_required_strings(cls, value: object) -> str:
        return _clean_required_text(value)

    @field_validator("language", mode="before")
    @classmethod
    def clean_optional_language(cls, value: object) -> str | None:
        if value is None:
            return None
        return _clean_required_text(value)

    @field_validator("budget_kzt", mode="before")
    @classmethod
    def reject_boolean_budget(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("must be a positive integer")
        return value

    @field_validator("duration_hours")
    @classmethod
    def require_finite_duration(cls, value: float | None) -> float | None:
        if value is not None and not isfinite(value):
            raise ValueError("must be finite")
        return value

    @field_validator("event_date")
    @classmethod
    def require_supported_event_date(cls, value: date) -> date:
        if not CALENDAR_START <= value <= CALENDAR_END:
            raise ValueError(
                f"must be within {CALENDAR_START.isoformat()} and "
                f"{CALENDAR_END.isoformat()}"
            )
        return value


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
    source_kind: SourceKind = "provided"


class ExclusionCounts(BaseModel):
    """Mutually exclusive first-failure counts for a city/category pool."""

    booked: int = Field(default=0, ge=0)
    over_budget: int = Field(default=0, ge=0)
    unsupported_format: int = Field(default=0, ge=0)
    unsupported_language: int = Field(default=0, ge=0)
    duration_exceeded: int = Field(default=0, ge=0)

    def total(self) -> int:
        """Return the number of profiles excluded for a primary reason."""

        return (
            self.booked
            + self.over_budget
            + self.unsupported_format
            + self.unsupported_language
            + self.duration_exceeded
        )


class FilterResult(BaseModel):
    """Output of hard filtering before ranking."""

    city_category_total: int = Field(ge=0)
    eligible: list[Contractor]
    exclusions: ExclusionCounts

    @model_validator(mode="after")
    def require_reconciled_counts(self) -> "FilterResult":
        expected_exclusions = self.city_category_total - len(self.eligible)
        if self.exclusions.total() != expected_exclusions:
            raise ValueError(
                "primary exclusion counts must equal city/category pool minus "
                "eligible candidates"
            )
        return self


class CountSummary(BaseModel):
    city_category_total: int = Field(ge=0)
    eligible_total: int = Field(ge=0)
    returned_total: int = Field(ge=0)


class EvidenceItem(BaseModel):
    """One fact supporting an explanation card."""

    code: EvidenceCode
    field: str
    # Null max_hours means duration does not apply; preserve that source fact.
    value: str | int | float | list[str] | None
    source_quote: str | None = None


class MatchCard(BaseModel):
    """One ranked contractor returned to the customer."""

    id: str
    anon_name: str
    category: str
    categories: list[str]
    city: str
    price_from_kzt: int = Field(gt=0)
    event_date: date
    availability: Literal["free_in_dataset"] = "free_in_dataset"
    synthetic: bool
    source_kind: SourceKind
    city_imputed: bool
    price_imputed: bool
    explanation: str
    evidence: list[EvidenceItem] = Field(default_factory=list)


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
    cards: list[MatchCard] = Field(default_factory=list, max_length=3)


class HealthResponse(BaseModel):
    status: Literal["ready"]
    profile_count: int = Field(ge=0)
    dataset_version: str
    algorithm_version: str


class MetadataResponse(BaseModel):
    cities: list[str]
    categories: list[str]
    event_formats: list[str]
    languages: list[str]
    calendar_start: date
    calendar_end: date
