"""Bounded inputs for optional community data; never reused as judged catalog facts."""

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from .templates import CATEGORIES, CITIES

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Identifier = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9_-]{1,64}$")]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Credentials(Input):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=10, max_length=128)

    @field_validator("username")
    @classmethod
    def canonical_username(cls, value):
        return value.lower()


class Registration(Credentials):
    display_name: ShortText
    role: Literal["organizer", "provider"]


class ListingInput(Input):
    title: ShortText
    category: ShortText
    city: ShortText
    price_from_kzt: int = Field(strict=True, gt=0, le=100_000_000)
    description: str = Field(min_length=20, max_length=2000)
    active: bool = True

    @field_validator("category")
    @classmethod
    def category_known(cls, value):
        if value not in CATEGORIES:
            raise ValueError("unknown_service")
        return value

    @field_validator("city")
    @classmethod
    def city_known(cls, value):
        if value not in CITIES:
            raise ValueError("unknown_city")
        return value

    @field_validator("description")
    @classmethod
    def meaningful_description(cls, value):
        if len(value.strip()) < 20:
            raise ValueError("description_too_short")
        return value.strip()


class ChecklistItem(Input):
    text: ShortText
    done: bool = False


class Slot(Input):
    id: Identifier
    category: ShortText
    notes: str = Field(default="", max_length=1000)
    checklist: list[ChecklistItem] = Field(default_factory=list, max_length=15)

    @field_validator("category")
    @classmethod
    def category_known(cls, value):
        return ListingInput.category_known(value)


class PlanInput(Input):
    version: int = Field(strict=True, ge=1)
    slots: list[Slot] = Field(max_length=30)

    @model_validator(mode="after")
    def unique_slots(self):
        if len({slot.id for slot in self.slots}) != len(self.slots):
            raise ValueError("duplicate_slots")
        return self


class EventInput(Input):
    title: ShortText
    city: ShortText
    event_date: date
    template_id: Identifier
    locale: Literal["ru", "en"] = "ru"

    @field_validator("city")
    @classmethod
    def city_known(cls, value):
        return ListingInput.city_known(value)

    @field_validator("event_date", mode="before")
    @classmethod
    def date_only(cls, value):
        # Community events have their own dates, not the supplied matching calendar.
        import re
        if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError("date_only")
        parsed = date.fromisoformat(value)
        if not 2026 <= parsed.year <= 2035:
            raise ValueError("event_date_outside_supported_range")
        return parsed


class InvitationInput(Input):
    slot_id: Identifier
    listing_id: Identifier
    version: int = Field(strict=True, ge=1)


class DecisionInput(Input):
    decision: Literal["accepted", "declined"]
    version: int = Field(strict=True, ge=1)


class MessageInput(Input):
    text: str = Field(min_length=1, max_length=2000)

    @field_validator("text")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("empty_message")
        return value.strip()
