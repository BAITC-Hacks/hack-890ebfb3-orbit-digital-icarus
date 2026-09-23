"""Hard filtering tests using real and deliberately small catalogs."""

from datetime import date
from pathlib import Path
import unittest

from backend.app.catalog import load_catalog
from backend.app.filtering import filter_candidates, primary_rejection_reason
from backend.app.models import Contractor, MatchRequest


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CATALOG = load_catalog(REPOSITORY_ROOT / "data" / "contractors.csv")


def request(**changes: object) -> MatchRequest:
    values: dict[str, object] = {
        "city": "Алматы",
        "event_date": date(2026, 10, 10),
        "event_format": "свадьба",
        "category": "Ведущий",
        "budget_kzt": 1_000_000,
        "duration_hours": None,
        "language": None,
    }
    values.update(changes)
    return MatchRequest(**values)


def contractor(identifier: str, **changes: object) -> Contractor:
    values: dict[str, object] = {
        "id": identifier,
        "anon_name": f"Contractor {identifier}",
        "categories": ["Ведущий"],
        "city": "Алматы",
        "city_imputed": False,
        "synthetic": False,
        "price_from_kzt": 100_000,
        "price_imputed": False,
        "event_formats": ["свадьба"],
        "languages": ["русский"],
        "max_hours": 6,
        "busy_dates": set(),
        "description": "Test profile.",
    }
    values.update(changes)
    return Contractor(**values)


class FilteringTests(unittest.TestCase):
    def test_dense_category_matches_frozen_dataset_counts(self) -> None:
        result = filter_candidates(
            request(event_date=date(2026, 10, 11), budget_kzt=3_000_000),
            CATALOG,
        )

        self.assertEqual(result.city_category_total, 10)
        self.assertEqual(len(result.eligible), 5)
        self.assertEqual(result.exclusions.total(), 5)

    def test_date_change_changes_the_eligible_set(self) -> None:
        october_tenth = filter_candidates(request(budget_kzt=3_000_000), CATALOG)
        october_eleventh = filter_candidates(
            request(event_date=date(2026, 10, 11), budget_kzt=3_000_000),
            CATALOG,
        )

        self.assertEqual(
            {item.id for item in october_tenth.eligible},
            {"HK-77838", "HK-72938", "HK-27222"},
        )
        self.assertEqual(len(october_eleventh.eligible), 5)

    def test_rare_category_returns_one_and_counts_the_booking(self) -> None:
        result = filter_candidates(
            request(
                category="Флорист",
                event_date=date(2026, 10, 10),
                budget_kzt=300_000,
            ),
            CATALOG,
        )

        self.assertEqual(result.city_category_total, 2)
        self.assertEqual([item.id for item in result.eligible], ["HK-39372"])
        self.assertEqual(result.exclusions.booked, 1)
        self.assertEqual(result.exclusions.total(), 1)

    def test_category_absent_has_no_pool_or_exclusions(self) -> None:
        result = filter_candidates(
            request(city="Астана", category="Декоратор", budget_kzt=3_000_000),
            CATALOG,
        )

        self.assertEqual(result.city_category_total, 0)
        self.assertEqual(result.eligible, [])
        self.assertEqual(result.exclusions.total(), 0)

    def test_all_booked_category_has_no_eligible_profiles(self) -> None:
        result = filter_candidates(
            request(
                city="Астана",
                category="Флорист",
                event_date=date(2026, 10, 11),
                budget_kzt=300_000,
            ),
            CATALOG,
        )

        self.assertEqual(result.city_category_total, 1)
        self.assertEqual(result.eligible, [])
        self.assertEqual(result.exclusions.booked, 1)

    def test_venue_uses_the_same_busy_calendar_rule(self) -> None:
        eligible_date = filter_candidates(
            request(
                city="Астана",
                category="Банкетный зал",
                event_date=date(2026, 10, 10),
                budget_kzt=3_000_000,
            ),
            CATALOG,
        )
        booked_date = filter_candidates(
            request(
                city="Астана",
                category="Банкетный зал",
                event_date=date(2026, 10, 11),
                budget_kzt=3_000_000,
            ),
            CATALOG,
        )

        self.assertIn("HK-90012", {item.id for item in eligible_date.eligible})
        self.assertNotIn("HK-90012", {item.id for item in booked_date.eligible})

    def test_first_failure_order_and_count_reconciliation(self) -> None:
        query = request(language="русский", duration_hours=6)
        profiles = [
            contractor(
                "booked-first",
                busy_dates={date(2026, 10, 10)},
                price_from_kzt=2_000_000,
                event_formats=["корпоратив"],
                languages=["казахский"],
                max_hours=2,
            ),
            contractor(
                "over-budget",
                price_from_kzt=2_000_000,
                event_formats=["корпоратив"],
            ),
            contractor("wrong-format", event_formats=["корпоратив"]),
            contractor(
                "wrong-language",
                languages=["казахский"],
                max_hours=2,
            ),
            contractor("too-short", max_hours=2),
            contractor("eligible"),
        ]

        result = filter_candidates(query, profiles)

        self.assertEqual([item.id for item in result.eligible], ["eligible"])
        self.assertEqual(result.exclusions.booked, 1)
        self.assertEqual(result.exclusions.over_budget, 1)
        self.assertEqual(result.exclusions.unsupported_format, 1)
        self.assertEqual(result.exclusions.unsupported_language, 1)
        self.assertEqual(result.exclusions.duration_exceeded, 1)
        self.assertEqual(result.exclusions.total(), 5)
        self.assertEqual(result.city_category_total - len(result.eligible), 5)
        self.assertEqual(primary_rejection_reason(query, profiles[0]), "booked")

    def test_budget_and_duration_boundaries_and_null_hours(self) -> None:
        query = request(budget_kzt=100_000, duration_hours=6)
        profiles = [
            contractor("exact-boundary", price_from_kzt=100_000, max_hours=6),
            contractor("not-tied-to-hours", max_hours=None),
            contractor("one-tenge-over", price_from_kzt=100_001),
            contractor("too-short", max_hours=5.5),
        ]

        result = filter_candidates(query, profiles)

        self.assertEqual(
            [item.id for item in result.eligible],
            ["exact-boundary", "not-tied-to-hours"],
        )
        self.assertEqual(result.exclusions.over_budget, 1)
        self.assertEqual(result.exclusions.duration_exceeded, 1)

    def test_language_is_ignored_when_omitted(self) -> None:
        result = filter_candidates(
            request(language=None),
            [contractor("kazakh-only", languages=["казахский"])],
        )

        self.assertEqual([item.id for item in result.eligible], ["kazakh-only"])
