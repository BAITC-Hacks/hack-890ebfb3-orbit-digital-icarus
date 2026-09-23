"""Verified, explicit one-field alternatives for an empty matching result."""

from datetime import timedelta
import json
from typing import Literal

from .constants import CALENDAR_END, CALENDAR_START
from .filtering import filter_candidates
from .models import Contractor, MatchRequest


ChangedField = Literal["city", "event_date", "budget_kzt"]
MAX_SUGGESTIONS = 3
DATE_SEARCH_DAYS = 7


def suggest_alternatives(
    request: MatchRequest,
    catalog: list[Contractor],
) -> list[dict]:
    """Suggest bounded request changes without applying them to the original.

    For an absent city/category pool, consider other cities alphabetically.
    Otherwise, prefer the closest working date on each side (earlier date wins
    equal-distance ties), then the smallest viable higher starting-price budget,
    then other cities. All untouched constraints remain mandatory.
    """
    original = filter_candidates(request, catalog)
    if original.eligible:
        return []

    suggestions: list[dict] = []
    seen: set[str] = set()

    def add(changed_field: ChangedField, value: object) -> bool:
        if len(suggestions) >= MAX_SUGGESTIONS:
            return False
        if value == getattr(request, changed_field):
            return False
        alternative = request.model_copy(update={changed_field: value})
        filtered = filter_candidates(alternative, catalog)
        if not filtered.eligible:
            return False
        payload = alternative.model_dump(mode="json")
        identity = json.dumps(payload, sort_keys=True, ensure_ascii=False)
        if identity in seen:
            return False
        seen.add(identity)
        suggestions.append({
            "changed_field": changed_field,
            "request": payload,
            "eligible_total": len(filtered.eligible),
        })
        return True

    def add_cities() -> None:
        for city in sorted({contractor.city for contractor in catalog} - {request.city}):
            if len(suggestions) >= MAX_SUGGESTIONS:
                break
            add("city", city)

    if original.city_category_total == 0:
        add_cities()
        return suggestions

    found_direction: set[int] = set()
    for distance in range(1, DATE_SEARCH_DAYS + 1):
        for direction in (-1, 1):
            if direction in found_direction:
                continue
            event_date = request.event_date + timedelta(days=direction * distance)
            if not CALENDAR_START <= event_date <= CALENDAR_END:
                continue
            if add("event_date", event_date):
                found_direction.add(direction)
        if len(found_direction) == 2:
            break

    prices = sorted({
        contractor.price_from_kzt
        for contractor in catalog
        if contractor.city == request.city
        and request.category in contractor.categories
        and contractor.price_from_kzt > request.budget_kzt
    })
    for price in prices:
        if add("budget_kzt", price):
            break

    add_cities()
    return suggestions
