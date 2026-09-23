"""Structural interfaces keep matching independent from the HTTP/model layer."""

from dataclasses import dataclass
from datetime import date
from typing import Literal, Mapping, Protocol, Sequence, TypedDict


class MatchRequestLike(Protocol):
    city: str
    event_date: date | str
    event_format: str
    category: str
    budget_kzt: int
    duration_hours: float | None
    language: str | None


class ContractorLike(Protocol):
    id: str
    anon_name: str
    categories: Sequence[str]
    city: str
    price_from_kzt: int
    event_formats: Sequence[str]
    languages: Sequence[str]
    max_hours: float | None
    busy_dates: Sequence[date | str]
    description: str
    synthetic: bool
    city_imputed: bool
    price_imputed: bool


@dataclass(frozen=True)
class ProfileEvidence:
    id: str
    quote: str
    event_formats: tuple[str, ...]
    use_in_explanation: bool = True


EvidenceIndex = Mapping[str, tuple[ProfileEvidence, ...]]


@dataclass(frozen=True)
class RankedCandidate:
    contractor: ContractorLike
    score: int
    evidence_ids: tuple[str, ...]


class EvidenceItem(TypedDict):
    code: Literal["availability", "budget", "format", "language", "duration", "description"]
    field: str
    value: str | int | float | list[str] | None
    source_quote: str | None


class MatchCard(TypedDict):
    id: str
    anon_name: str
    category: str
    categories: list[str]
    city: str
    price_from_kzt: int
    event_date: str
    availability: Literal["free_in_dataset"]
    synthetic: bool
    source_kind: Literal["provided", "team_added"]
    city_imputed: bool
    price_imputed: bool
    explanation: str
    evidence: list[EvidenceItem]


def iso_date(value: date | str) -> str:
    return value.isoformat() if isinstance(value, date) else value

