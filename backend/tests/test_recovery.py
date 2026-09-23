"""Alternative requests preserve every constraint except the stated change."""

from datetime import date, timedelta
from pathlib import Path
import unittest

from backend.app.catalog import load_catalog
from backend.app.constants import CALENDAR_END, CALENDAR_START
from backend.app.filtering import filter_candidates
from backend.app.models import Contractor, MatchRequest
from backend.app.recovery import suggest_alternatives


CATALOG = load_catalog(Path(__file__).resolve().parents[2] / "data" / "contractors.csv")


def request(**changes) -> MatchRequest:
    return MatchRequest(**({
        "city": "Алматы", "event_date": date(2026, 10, 10),
        "event_format": "свадьба", "category": "Ведущий", "budget_kzt": 100,
        "duration_hours": 4, "language": "русский",
    } | changes))


def profile(identifier: str, **changes) -> Contractor:
    return Contractor(**({
        "id": identifier, "anon_name": identifier, "categories": ["Ведущий"],
        "city": "Алматы", "city_imputed": False, "synthetic": True,
        "price_from_kzt": 100, "price_imputed": False,
        "event_formats": ["свадьба"], "languages": ["русский"],
        "max_hours": 6, "busy_dates": set(), "description": "Recovery test fixture.",
    } | changes))


class RecoveryTests(unittest.TestCase):
    def assert_verified(self, original, catalog, suggestions):
        self.assertLessEqual(len(suggestions), 3)
        payload = original.model_dump(mode="json")
        seen = []
        for suggestion in suggestions:
            proposed = suggestion["request"]
            self.assertEqual(set(proposed), set(payload))
            self.assertEqual(
                [field for field in payload if payload[field] != proposed[field]],
                [suggestion["changed_field"]],
            )
            self.assertIn(suggestion["changed_field"], {"city", "event_date", "budget_kzt"})
            self.assertEqual(proposed["category"], original.category)
            alternative = MatchRequest.model_validate(proposed)
            eligible = filter_candidates(alternative, catalog).eligible
            self.assertGreater(len(eligible), 0)
            self.assertEqual(suggestion["eligible_total"], len(eligible))
            self.assertNotIn(proposed, seen)
            seen.append(proposed)

    def test_user_astana_restaurant_request_suggests_only_verified_other_city(self):
        original = request(city="Астана", category="Ресторан", event_date=date(2026, 10, 31),
                           budget_kzt=4_000_000, duration_hours=None, language=None)
        self.assertEqual(filter_candidates(original, CATALOG).city_category_total, 0)
        suggestions = suggest_alternatives(original, CATALOG)
        self.assertEqual(len(suggestions), 1)
        self.assertEqual(suggestions[0]["changed_field"], "city")
        self.assertEqual(suggestions[0]["request"]["city"], "Алматы")
        self.assertEqual(suggestions[0]["eligible_total"], 1)
        self.assert_verified(original, CATALOG, suggestions)

    def test_booked_real_florist_has_nearby_date_alternatives(self):
        original = request(city="Астана", category="Флорист", event_date=date(2026, 10, 11),
                           budget_kzt=300_000, duration_hours=None, language=None)
        self.assertFalse(filter_candidates(original, CATALOG).eligible)
        suggestions = suggest_alternatives(original, CATALOG)
        date_changes = [item for item in suggestions if item["changed_field"] == "event_date"]
        self.assertTrue(date_changes)
        for item in date_changes:
            self.assertLessEqual(abs((date.fromisoformat(item["request"]["event_date"]) - original.event_date).days), 7)
        self.assert_verified(original, CATALOG, suggestions)

    def test_low_budget_uses_the_smallest_viable_real_starting_price(self):
        original = request(category="Флорист", budget_kzt=100_000,
                           duration_hours=12, language="русский")
        suggestions = suggest_alternatives(original, CATALOG)
        budgets = [item for item in suggestions if item["changed_field"] == "budget_kzt"]
        self.assertEqual(len(budgets), 1)
        self.assertEqual(budgets[0]["request"]["budget_kzt"], 200_000)
        self.assert_verified(original, CATALOG, suggestions)

    def test_already_eligible_request_needs_no_changes(self):
        original = request(category="Флорист", budget_kzt=300_000,
                           duration_hours=12, language="русский")
        self.assertTrue(filter_candidates(original, CATALOG).eligible)
        self.assertEqual(suggest_alternatives(original, CATALOG), [])

    def test_nearest_date_each_side_then_viable_budget_with_three_item_cap(self):
        original = request()
        blocked = {original.event_date + timedelta(days=offset)
                   for offset in range(-7, 8) if offset not in (-2, 3)}
        catalog = [
            profile("cheap", busy_dates=blocked),
            profile("wrong-language", price_from_kzt=150, languages=["английский"]),
            profile("premium", price_from_kzt=200),
            profile("other-city", city="Астана"),
        ]
        suggestions = suggest_alternatives(original, catalog)
        self.assertEqual([item["changed_field"] for item in suggestions],
                         ["event_date", "event_date", "budget_kzt"])
        self.assertEqual([item["request"]["event_date"] for item in suggestions[:2]],
                         ["2026-10-08", "2026-10-13"])
        self.assertEqual(suggestions[2]["request"]["budget_kzt"], 200)
        self.assert_verified(original, catalog, suggestions)
        self.assertEqual(suggestions, suggest_alternatives(original, list(reversed(catalog))))

    def test_equal_distance_dates_sort_earlier_first(self):
        original = request()
        suggestions = suggest_alternatives(original, [profile("booked", busy_dates={original.event_date})])
        self.assertEqual([item["request"]["event_date"] for item in suggestions],
                         ["2026-10-09", "2026-10-11"])

    def test_absent_pool_changes_only_city_and_keeps_optional_constraints(self):
        original = request(city="Missing city")
        catalog = [profile("good-b", city="B"), profile("good-a", city="A"),
                   profile("bad-hours", city="C", max_hours=2),
                   profile("bad-language", city="D", languages=["английский"]),
                   profile("bad-format", city="E", event_formats=["корпоратив"]),
                   profile("bad-category", city="F", categories=["Флорист"])]
        suggestions = suggest_alternatives(original, catalog)
        self.assertEqual([item["request"]["city"] for item in suggestions], ["A", "B"])
        self.assert_verified(original, catalog, suggestions)

    def test_existing_pool_can_offer_another_city_when_single_local_changes_fail(self):
        original = request()
        catalog = [profile("wrong-language", languages=["английский"]),
                   profile("other-city", city="Астана")]
        suggestions = suggest_alternatives(original, catalog)
        self.assertEqual([item["changed_field"] for item in suggestions], ["city"])
        self.assert_verified(original, catalog, suggestions)

    def test_calendar_bounds_and_seven_day_window_are_respected(self):
        for boundary in (CALENDAR_START, CALENDAR_END):
            with self.subTest(boundary=boundary):
                original = request(event_date=boundary)
                catalog = [profile("booked", busy_dates={boundary})]
                suggestions = suggest_alternatives(original, catalog)
                self.assertEqual(len(suggestions), 1)
                self.assert_verified(original, catalog, suggestions)
                proposed_date = date.fromisoformat(suggestions[0]["request"]["event_date"])
                self.assertEqual(abs((proposed_date - boundary).days), 1)

        original = request()
        catalog = [profile("busy-window", busy_dates={original.event_date + timedelta(days=offset)
                                                     for offset in range(-7, 8)})]
        self.assertEqual(suggest_alternatives(original, catalog), [])

    def test_empty_catalog_has_no_fabricated_alternatives(self):
        self.assertEqual(suggest_alternatives(request(), []), [])
