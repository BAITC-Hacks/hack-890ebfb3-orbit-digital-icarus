"""Render brief explanations exclusively from request and verified source facts."""

from .ranking import assert_eligible
from .types import EvidenceIndex, EvidenceItem, MatchCard, MatchRequestLike, RankedCandidate, iso_date


def _money(value: int) -> str:
    return f"{value:,}".replace(",", " ")


def _evidence(code: str, field: str, value: object, quote: str | None = None) -> EvidenceItem:
    return {"code": code, "field": field, "value": value, "source_quote": quote}


def build_cards(request: MatchRequestLike, ranked: list[RankedCandidate], evidence: EvidenceIndex) -> list[MatchCard]:
    """Build at most three recommendation cards using verified evidence only."""
    cards: list[MatchCard] = []
    seen_ids = set()
    for candidate in ranked[:3]:
        profile = candidate.contractor
        assert_eligible(request, profile)
        if profile.id in seen_ids:
            raise ValueError(f"Duplicate result card {profile.id}")
        seen_ids.add(profile.id)
        event_date = iso_date(request.event_date)
        display_date = ".".join(reversed(event_date.split("-")))
        fit = [f"На {display_date} свободен по календарю", f"принимает формат «{request.event_format}»", f"от {_money(profile.price_from_kzt)} ₸ при бюджете {_money(request.budget_kzt)} ₸"]
        facts = [_evidence("availability", "busy_dates", event_date), _evidence("budget", "price_from_kzt", profile.price_from_kzt), _evidence("format", "event_formats", request.event_format)]
        if request.language is not None:
            fit.append(f"рабочий язык — {request.language}")
            facts.append(_evidence("language", "languages", request.language))
        if request.duration_hours is not None:
            fit.append("длительность присутствия для этой услуги не применяется" if profile.max_hours is None else f"до {profile.max_hours:g} ч при запросе {request.duration_hours:g} ч")
            facts.append(_evidence("duration", "max_hours", profile.max_hours))
        records = tuple(item for item in evidence.get(profile.id, ()) if item.use_in_explanation)
        by_id = {item.id: item for item in records}
        selected = next((by_id[item_id] for item_id in candidate.evidence_ids if item_id in by_id), None)
        if selected is None and records:
            selected = min(records, key=lambda item: item.id)
        if selected is not None:
            if selected.quote not in profile.description:
                raise ValueError(f"Stale description evidence for {profile.id}")
            quote_text = selected.quote.strip().rstrip(".!? ")
            detail = f"В профиле: «{quote_text}»."
            facts.append(_evidence("description", "description", selected.quote, selected.quote))
        else:
            languages = ", ".join(sorted(profile.languages))
            hours = "услуга без привязки к часам присутствия" if profile.max_hours is None else f"до {profile.max_hours:g} ч на площадке"
            detail = f"В каталоге указаны языки: {languages}; {hours}."
            facts.extend([_evidence("language", "languages", sorted(profile.languages)), _evidence("duration", "max_hours", profile.max_hours)])
        cards.append({"id": profile.id, "anon_name": profile.anon_name, "category": request.category, "categories": list(profile.categories), "city": profile.city, "price_from_kzt": profile.price_from_kzt, "event_date": event_date, "availability": "free_in_dataset", "synthetic": profile.synthetic, "source_kind": getattr(profile, "source_kind", "provided"), "city_imputed": profile.city_imputed, "price_imputed": profile.price_imputed, "explanation": "; ".join(fit) + ". " + detail, "evidence": facts})
    return cards
