"""User-friendly alias normalization tests."""

from datetime import date
from pathlib import Path
import unittest

from backend.app.catalog import load_catalog
from backend.app.models import MatchRequest
from backend.app.normalization import canonicalize, normalize_match_request


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CATALOG = load_catalog(REPOSITORY_ROOT / "data" / "contractors.csv")


class NormalizationTests(unittest.TestCase):
    def test_normalizes_safe_aliases_to_catalog_labels(self) -> None:
        request = MatchRequest(
            city="  Alma-Ata ",
            event_date=date(2026, 10, 10),
            event_format="Wedding",
            category="MC",
            budget_kzt=500000,
            language="RU",
        )

        normalized = normalize_match_request(request, CATALOG)

        self.assertEqual(normalized.city, "Алматы")
        self.assertEqual(normalized.event_format, "свадьба")
        self.assertEqual(normalized.category, "Ведущий")
        self.assertEqual(normalized.language, "русский")

    def test_keeps_host_and_ceremony_host_distinct(self) -> None:
        categories = sorted(
            {category for contractor in CATALOG for category in contractor.categories}
        )

        self.assertEqual(
            canonicalize(
                "Ведущий церемонии",
                field="category",
                allowed=categories,
            ),
            "Ведущий церемонии",
        )
        self.assertEqual(
            canonicalize("тамада", field="category", allowed=categories),
            "Ведущий",
        )

    def test_rejects_unknown_aliases(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unsupported category"):
            canonicalize(
                "абсолютно неизвестная категория",
                field="category",
                allowed=["Ведущий"],
            )
