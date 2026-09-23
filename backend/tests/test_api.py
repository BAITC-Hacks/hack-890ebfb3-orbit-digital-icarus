"""B1 API contract tests."""

from fastapi.testclient import TestClient
import unittest

from backend.app.main import app


class ApiTests(unittest.TestCase):
    def test_health_reports_ready_catalog(self) -> None:
        with TestClient(app) as client:
            response = client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ready")
        self.assertEqual(body["profile_count"], 66)
        self.assertEqual(len(body["dataset_version"]), 64)

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

    def test_match_stub_accepts_user_friendly_aliases(self) -> None:
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

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "ranking_not_integrated")

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
