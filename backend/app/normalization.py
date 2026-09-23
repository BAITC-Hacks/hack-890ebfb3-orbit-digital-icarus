"""Controlled user-input aliases for request fields.

Aliases make the form and API friendlier without guessing ambiguous meanings.
Every normalized value must resolve to an exact canonical label present in the
loaded catalog.
"""

from collections.abc import Iterable

from .models import Contractor, MatchRequest


def normalized_key(value: str) -> str:
    """Create a comparison key without changing stored canonical labels."""

    return " ".join(
        value.strip()
        .casefold()
        .replace("ё", "е")
        .replace("-", " ")
        .split()
    )


RAW_ALIASES: dict[str, dict[str, str]] = {
    "city": {
        "алма ата": "Алматы",
        "alma ata": "Алматы",
        "almaty": "Алматы",
        "astana": "Астана",
        "за рубежом": "Зарубежье",
        "abroad": "Зарубежье",
        "international": "Зарубежье",
    },
    "category": {
        "ведущий мероприятия": "Ведущий",
        "свадебный ведущий": "Ведущий",
        "тамада": "Ведущий",
        "mc": "Ведущий",
        "эмси": "Ведущий",
        "церемониймейстер": "Ведущий церемонии",
        "банкетный зал": "Банкетный зал",
        "banquet hall": "Банкетный зал",
        "фотограф": "Фотограф",
        "photographer": "Фотограф",
        "видеооператор": "Видеограф",
        "videographer": "Видеограф",
        "фотобудка": "Фото и видеобудки",
        "фото будка": "Фото и видеобудки",
        "photo booth": "Фото и видеобудки",
        "музыкант": "Инструменталист",
    },
    "event_format": {
        "wedding": "свадьба",
        "toi": "той",
        "corporate": "корпоратив",
        "conference": "конференция",
        "anniversary": "юбилей",
        "birthday": "день рождения",
        "деньрождения": "день рождения",
    },
    "language": {
        "ru": "русский",
        "russian": "русский",
        "рус": "русский",
        "kz": "казахский",
        "kazakh": "казахский",
        "қазақша": "казахский",
        "en": "английский",
        "english": "английский",
    },
}

ALIASES: dict[str, dict[str, str]] = {
    field: {normalized_key(alias): target for alias, target in aliases.items()}
    for field, aliases in RAW_ALIASES.items()
}


def canonicalize(value: str, *, field: str, allowed: Iterable[str]) -> str:
    """Resolve an exact canonical value or a reviewed alias.

    Fuzzy matching is deliberately not used. For example, "Ведущий" and
    "Ведущий церемонии" remain different categories.
    """

    allowed_values = list(allowed)
    canonical_index = {normalized_key(item): item for item in allowed_values}
    key = normalized_key(value)

    if key in canonical_index:
        return canonical_index[key]

    alias_target = ALIASES.get(field, {}).get(key)
    if alias_target is not None:
        target_key = normalized_key(alias_target)
        if target_key in canonical_index:
            return canonical_index[target_key]

    options = ", ".join(allowed_values)
    raise ValueError(f"Unsupported {field}: {value!r}. Valid values: {options}")


def normalize_match_request(
    request: MatchRequest,
    catalog: list[Contractor],
) -> MatchRequest:
    """Return a request whose label values match the loaded catalog exactly."""

    cities = sorted({contractor.city for contractor in catalog})
    categories = sorted(
        {category for contractor in catalog for category in contractor.categories}
    )
    event_formats = sorted(
        {
            event_format
            for contractor in catalog
            for event_format in contractor.event_formats
        }
    )
    languages = sorted(
        {language for contractor in catalog for language in contractor.languages}
    )

    update: dict[str, str | None] = {
        "city": canonicalize(request.city, field="city", allowed=cities),
        "category": canonicalize(
            request.category,
            field="category",
            allowed=categories,
        ),
        "event_format": canonicalize(
            request.event_format,
            field="event_format",
            allowed=event_formats,
        ),
        "language": None,
    }
    if request.language is not None:
        update["language"] = canonicalize(
            request.language,
            field="language",
            allowed=languages,
        )

    return request.model_copy(update=update)
