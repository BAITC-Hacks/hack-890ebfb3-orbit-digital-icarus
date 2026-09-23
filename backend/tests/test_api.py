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
            "event_date": "2026-10-10",
            "event_format": "wedding",
            "category": "MC",
            "budget_kzt": 500000,
            "duration_hours": None,
            "language": "RU",
        }
        with TestClient(app) as client:
            response = client.post("/api/match", json=payload)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "matching_not_ready")

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
