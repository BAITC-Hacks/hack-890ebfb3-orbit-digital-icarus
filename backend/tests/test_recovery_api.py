"""Real API alternatives remain explicit, reproducible, and actually eligible."""

import unittest

from fastapi.testclient import TestClient

from backend.app.main import create_app


BASE_REQUEST = {
    "city": "Алматы", "event_date": "2026-10-10", "event_format": "свадьба",
    "category": "Флорист", "budget_kzt": 300_000,
    "duration_hours": None, "language": None,
}


class RecoveryApiTests(unittest.TestCase):
    def setUp(self):
        self.client = self.enterContext(TestClient(create_app()))

    def post(self, payload):
        response = self.client.post("/api/match", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def assert_verified_alternatives(self, payload, original):
        self.assertEqual(original["request"], payload)
        self.assertEqual(original["cards"], [])
        self.assertEqual(original["counts"]["eligible_total"], 0)
        self.assertEqual(original["counts"]["returned_total"], 0)
        self.assertEqual(sum(original["exclusions"].values()), original["counts"]["city_category_total"])
        suggestions = original["alternatives"]
        self.assertGreater(len(suggestions), 0)
        self.assertLessEqual(len(suggestions), 3)
        seen = []
        for suggestion in suggestions:
            self.assertEqual(set(suggestion), {"changed_field", "request", "eligible_total"})
            changed = suggestion["changed_field"]
            self.assertIn(changed, {"city", "event_date", "budget_kzt"})
            proposed = suggestion["request"]
            self.assertEqual(set(proposed), set(payload))
            self.assertEqual([key for key in payload if payload[key] != proposed[key]], [changed])
            self.assertNotIn(proposed, seen)
            seen.append(proposed)
            matched = self.post(proposed)
            self.assertEqual(matched["status"], "matches_found")
            self.assertEqual(matched["request"], proposed)
            self.assertGreater(matched["counts"]["eligible_total"], 0)
            self.assertEqual(matched["counts"]["eligible_total"], suggestion["eligible_total"])
            self.assertEqual(matched["counts"]["returned_total"], min(3, suggestion["eligible_total"]))
            self.assertEqual(matched["alternatives"], [])
            self.assertEqual(matched["dataset_version"], original["dataset_version"])
            self.assertEqual(matched["algorithm_version"], original["algorithm_version"])
        # Following suggestions never changes the original request or its outcome.
        self.assertEqual(self.post(payload), original)

    def test_user_astana_restaurant_request_stays_absent_with_explicit_city_option(self):
        payload = BASE_REQUEST | {
            "city": "Астана", "category": "Ресторан", "event_date": "2026-10-31",
            "budget_kzt": 4_000_000,
        }
        original = self.post(payload)
        self.assertEqual(original["status"], "category_absent")
        self.assertEqual(original["counts"], {"city_category_total": 0, "eligible_total": 0, "returned_total": 0})
        self.assertIn("Ресторан", original["message"])
        self.assertEqual(len(original["alternatives"]), 1)
        self.assertEqual(original["alternatives"][0]["changed_field"], "city")
        self.assertEqual(original["alternatives"][0]["request"]["city"], "Алматы")
        self.assertEqual(original["alternatives"][0]["eligible_total"], 1)
        self.assert_verified_alternatives(payload, original)

    def test_booked_florist_offers_working_dates_without_relaxing_optional_constraints(self):
        payload = BASE_REQUEST | {
            "city": "Астана", "event_date": "2026-10-11",
            "duration_hours": 12, "language": "русский",
        }
        original = self.post(payload)
        self.assertEqual(original["status"], "no_eligible_contractors")
        self.assertEqual(original["counts"], {"city_category_total": 1, "eligible_total": 0, "returned_total": 0})
        self.assertEqual(original["exclusions"]["booked"], 1)
        self.assertIn("event_date", [item["changed_field"] for item in original["alternatives"]])
        self.assert_verified_alternatives(payload, original)

    def test_low_budget_florist_offers_actual_minimum_price_preserving_language_and_hours(self):
        payload = BASE_REQUEST | {"budget_kzt": 100_000, "duration_hours": 12, "language": "русский"}
        original = self.post(payload)
        self.assertEqual(original["status"], "no_eligible_contractors")
        self.assertEqual(original["counts"], {"city_category_total": 2, "eligible_total": 0, "returned_total": 0})
        self.assertEqual(original["exclusions"]["booked"], 1)
        self.assertEqual(original["exclusions"]["over_budget"], 1)
        budget_options = [item for item in original["alternatives"] if item["changed_field"] == "budget_kzt"]
        self.assertEqual(len(budget_options), 1)
        self.assertEqual(budget_options[0]["request"]["budget_kzt"], 200_000)
        self.assert_verified_alternatives(payload, original)

    def test_successful_dense_result_has_no_alternatives_and_keeps_original_counts(self):
        payload = BASE_REQUEST | {"category": "Ведущий", "event_date": "2026-10-11", "budget_kzt": 3_000_000}
        response = self.post(payload)
        self.assertEqual(response["status"], "matches_found")
        self.assertEqual(response["request"], payload)
        self.assertEqual(response["alternatives"], [])
        self.assertEqual(response["counts"], {"city_category_total": 10, "eligible_total": 5, "returned_total": 3})
        self.assertEqual([card["id"] for card in response["cards"]], ["HK-42352", "HK-44923", "HK-27222"])
        self.assertEqual(response["exclusions"]["booked"], 4)
        self.assertEqual(response["exclusions"]["unsupported_format"], 1)
        self.assertEqual(self.post(payload), response)

    def test_successful_short_result_keeps_one_card_without_recovery_suggestions(self):
        response = self.post(BASE_REQUEST)
        self.assertEqual(response["status"], "matches_found")
        self.assertEqual(response["alternatives"], [])
        self.assertEqual(response["counts"], {"city_category_total": 2, "eligible_total": 1, "returned_total": 1})
        self.assertEqual([card["id"] for card in response["cards"]], ["HK-39372"])
