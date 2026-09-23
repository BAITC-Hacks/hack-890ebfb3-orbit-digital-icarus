"""API contract tests across the integrated data, filtering and matching layers."""

from fastapi.testclient import TestClient
from time import perf_counter
import unittest

from backend.app.main import app
from backend.app.matching import algorithm_version
from scripts.matching_acceptance import demo_requests


class ApiTests(unittest.TestCase):
    def test_health_reports_ready_catalog(self) -> None:
        with TestClient(app) as client:
            response = client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ready")
        self.assertEqual(body["profile_count"], 66)
        self.assertEqual(len(body["dataset_version"]), 64)
        self.assertEqual(body["algorithm_version"], algorithm_version())

    def test_empty_optional_values_normalize_to_null(self) -> None:
        payload = demo_requests()["rare_florist"] | {"language": "  ", "duration_hours": ""}
        with TestClient(app) as client:
            response = client.post("/api/match", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["request"]["language"])
        self.assertIsNone(response.json()["request"]["duration_hours"])

    def test_boolean_duration_is_rejected(self) -> None:
        with TestClient(app) as client:
            response = client.post("/api/match", json=demo_requests()["rare_florist"] | {"duration_hours": True})
        self.assertEqual(response.status_code, 422)

    def test_null_duration_source_evidence_survives_real_http_serialization(self) -> None:
        with TestClient(app) as client:
            response = client.post("/api/match", json=demo_requests()["rare_florist"] | {"duration_hours": 12})
        self.assertEqual(response.status_code, 200)
        card = response.json()["cards"][0]
        self.assertEqual(card["id"], "HK-39372")
        self.assertEqual(next(item["value"] for item in card["evidence"] if item["code"] == "duration"), None)

    def test_metadata_exposes_canonical_values(self) -> None:
        with TestClient(app) as client:
            response = client.get("/api/metadata")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["calendar_start"], "2026-09-23")
        self.assertEqual(body["calendar_end"], "2026-12-31")
        self.assertIn("Алматы", body["cities"])
        self.assertIn("Ведущий", body["categories"])
        self.assertIn("свадьба", body["event_formats"])
        self.assertIn("русский", body["languages"])

    def test_match_accepts_user_friendly_aliases(self) -> None:
        payload = {
            "city": "Alma-Ata",
            "event_date": "2026-10-11",
            "event_format": "wedding",
            "category": "MC",
            "budget_kzt": 3_000_000,
            "duration_hours": None,
            "language": "RU",
        }
        with TestClient(app) as client:
            response = client.post("/api/match", json=payload)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "matches_found")
        self.assertEqual(body["request"]["city"], "Алматы")
        self.assertEqual(body["request"]["event_format"], "свадьба")
        self.assertEqual(body["request"]["category"], "Ведущий")
        self.assertEqual(body["request"]["language"], "русский")
        self.assertEqual(len(body["cards"]), 3)

    def test_match_returns_category_absent_as_a_business_response(self) -> None:
        payload = {
            "city": "Астана",
            "event_date": "2026-10-10",
            "event_format": "свадьба",
            "category": "Декоратор",
            "budget_kzt": 3_000_000,
        }
        with TestClient(app) as client:
            response = client.post("/api/match", json=payload)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "category_absent")
        self.assertEqual(body["counts"]["city_category_total"], 0)
        self.assertEqual(body["cards"], [])

    def test_match_returns_no_eligible_as_a_business_response(self) -> None:
        payload = {
            "city": "Астана",
            "event_date": "2026-10-11",
            "event_format": "свадьба",
            "category": "Флорист",
            "budget_kzt": 300_000,
        }
        with TestClient(app) as client:
            response = client.post("/api/match", json=payload)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "no_eligible_contractors")
        self.assertEqual(body["counts"]["city_category_total"], 1)
        self.assertEqual(body["exclusions"]["booked"], 1)
        self.assertEqual(body["cards"], [])

    def test_match_rejects_outside_calendar_window(self) -> None:
        payload = {
            "city": "Алматы",
            "event_date": "2027-01-01",
            "event_format": "свадьба",
            "category": "Ведущий",
            "budget_kzt": 500000,
        }
        with TestClient(app) as client:
            response = client.post("/api/match", json=payload)

        self.assertEqual(response.status_code, 422)

    def test_match_rejects_unknown_catalog_value(self) -> None:
        payload = {
            "city": "Алматы",
            "event_date": "2026-10-10",
            "event_format": "свадьба",
            "category": "неизвестная категория",
            "budget_kzt": 500000,
        }
        with TestClient(app) as client:
            response = client.post("/api/match", json=payload)

        self.assertEqual(response.status_code, 422)
        self.assertEqual(
            response.json()["detail"]["code"],
            "unsupported_catalog_value",
        )

    def test_match_rejects_oversized_request_values(self) -> None:
        payload = {
            "city": "Almaty",
            "event_date": "2026-10-10",
            "event_format": "wedding",
            "category": "x" * 121,
            "budget_kzt": 500000,
        }
        with TestClient(app) as client:
            response = client.post("/api/match", json=payload)

        self.assertEqual(response.status_code, 422)
        errors = response.json()["detail"]
        self.assertTrue(
            any(error["loc"][-1] == "category" for error in errors),
            errors,
        )

    def test_match_rejects_coerced_json_types_and_datetimes(self) -> None:
        base_payload = {
            "city": "Almaty",
            "event_date": "2026-10-11",
            "event_format": "wedding",
            "category": "MC",
            "budget_kzt": 3_000_000,
        }
        invalid_values = {
            "string_budget": {"budget_kzt": "3000000"},
            "whole_number_float_budget": {"budget_kzt": 3_000_000.0},
            "boolean_duration": {"duration_hours": True},
            "string_duration": {"duration_hours": "6"},
            "exponent_duration": {"duration_hours": "4e2"},
            "datetime_instead_of_date": {
                "event_date": "2026-10-11T00:00:00"
            },
            "impossible_date": {"event_date": "2026-02-30"},
        }

        with TestClient(app) as client:
            for name, override in invalid_values.items():
                with self.subTest(name=name):
                    response = client.post("/api/match", json=base_payload | override)

                    self.assertEqual(response.status_code, 422)
                    self.assertIsInstance(response.json()["detail"], list)

    def test_complete_match_response_meets_the_ten_second_target(self) -> None:
        """Measure the in-process API call, not browser or network latency."""
        payload = {
            "city": "Almaty",
            "event_date": "2026-10-11",
            "event_format": "wedding",
            "category": "MC",
            "budget_kzt": 3_000_000,
            "language": "RU",
        }
        with TestClient(app) as client:
            started_at = perf_counter()
            response = client.post("/api/match", json=payload)
            elapsed_seconds = perf_counter() - started_at

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "matches_found")
        self.assertEqual(len(response.json()["cards"]), 3)
        self.assertLess(
            elapsed_seconds,
            10,
            f"Filtering response took {elapsed_seconds:.3f} seconds",
        )
