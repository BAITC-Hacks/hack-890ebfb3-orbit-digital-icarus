"""Catalog loading and validation tests."""

import csv
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from backend.app.catalog import (
    CALENDAR_END,
    CALENDAR_START,
    CatalogValidationError,
    dataset_sha256,
    load_catalog,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = REPOSITORY_ROOT / "data" / "contractors.csv"
HEADERS = [
    "id",
    "anon_name",
    "categories",
    "city",
    "city_imputed",
    "synthetic",
    "price_from_kzt",
    "price_imputed",
    "event_formats",
    "languages",
    "max_hours",
    "busy_dates",
    "description",
]


def valid_row(**changes: str) -> dict[str, str]:
    row = {
        "id": "TEST-001",
        "anon_name": "Тестовый подрядчик",
        "categories": "Ведущий",
        "city": "Алматы",
        "city_imputed": "False",
        "synthetic": "False",
        "price_from_kzt": "100000",
        "price_imputed": "False",
        "event_formats": "свадьба|корпоратив",
        "languages": "русский|казахский",
        "max_hours": "6",
        "busy_dates": "2026-10-10",
        "description": "Тестовое описание.",
    }
    row.update(changes)
    return row


def write_catalog(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=HEADERS)
        writer.writeheader()
        writer.writerows(rows)


class CatalogTests(unittest.TestCase):
    def test_loads_all_supplied_profiles(self) -> None:
        catalog = load_catalog(CATALOG_PATH)

        self.assertEqual(len(catalog), 66)
        self.assertEqual(len({contractor.id for contractor in catalog}), 66)
        self.assertEqual(sum(c.max_hours is None for c in catalog), 9)
        self.assertEqual(
            dataset_sha256(CATALOG_PATH),
            "6a724b6b7dfb5973343e68ba18dadb60fc807d87e3d78f03ee86fb26cb089f7d",
        )

    def test_parses_lists_booleans_and_dates(self) -> None:
        catalog = load_catalog(CATALOG_PATH)
        contractor = next(item for item in catalog if item.id == "HK-39372")

        self.assertEqual(contractor.categories, ["Флорист"])
        self.assertIs(contractor.synthetic, False)
        self.assertIs(contractor.price_imputed, True)
        self.assertIn(date(2026, 9, 25), contractor.busy_dates)

    def test_rejects_duplicate_ids(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "duplicate.csv"
            write_catalog(path, [valid_row(), valid_row()])

            with self.assertRaisesRegex(CatalogValidationError, "duplicate"):
                load_catalog(path)

    def test_rejects_invalid_boolean(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "invalid-boolean.csv"
            write_catalog(path, [valid_row(synthetic="yes")])

            with self.assertRaisesRegex(CatalogValidationError, "True or False"):
                load_catalog(path)

    def test_rejects_busy_dates_outside_snapshot(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "outside-window.csv"
            write_catalog(path, [valid_row(busy_dates="2027-01-01")])

            with self.assertRaisesRegex(CatalogValidationError, "outside"):
                load_catalog(path)

    def test_exposes_expected_calendar_bounds(self) -> None:
        self.assertEqual(CALENDAR_START, date(2026, 9, 23))
        self.assertEqual(CALENDAR_END, date(2026, 12, 31))
