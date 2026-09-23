"""Exercise Enjoy's domain functions with bbl's real Pydantic contracts.

The production loader supplies Contractor objects and the independent CSV oracle
selects eligible IDs. These checks exercise typed cards without substituting for
the still-pending production API filters.
"""

import hashlib
import json
import unittest
from datetime import date
from types import SimpleNamespace

from pydantic import ValidationError

from backend.app.catalog import load_catalog
from backend.app.matching import algorithm_version, build_cards, load_evidence, rank_candidates
from backend.app.models import Contractor, MatchRequest, MatchResponse
from scripts.matching_acceptance import DATASET, demo_requests, load_reference_catalog, reference_filter


class PydanticMatchingBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reference_catalog = load_reference_catalog()
        cls.catalog = load_catalog()
        cls.by_id = {profile.id: profile for profile in cls.catalog}
        cls.dataset_version = hashlib.sha256(DATASET.read_bytes()).hexdigest()
        cls.evidence = load_evidence(cls.catalog, dataset_sha256=cls.dataset_version)

    def make_response(self, payload, *, reverse=False):
        request = MatchRequest.model_validate(payload)
        pool, references, exclusions = reference_filter(SimpleNamespace(**payload), self.reference_catalog)
        eligible = [self.by_id[profile.id] for profile in references]
        if reverse:
            eligible.reverse()
            # Reconstruct actual Pydantic dates/sets after a JSON boundary too.
            eligible = [Contractor.model_validate_json(profile.model_dump_json()) for profile in eligible]
        cards = build_cards(request, rank_candidates(request, eligible, self.evidence), self.evidence)
        status = "category_absent" if not pool else "matches_found" if eligible else "no_eligible_contractors"
        return MatchResponse.model_validate({
            "schema_version": "1",
            "status": status,
            "request": request,
            "dataset_version": self.dataset_version,
            "algorithm_version": algorithm_version(),
            "message": "Integration test response",
            "counts": {"city_category_total": len(pool), "eligible_total": len(eligible), "returned_total": len(cards)},
            "exclusions": exclusions,
            "cards": cards,
        })

    def test_all_66_profiles_convert_to_real_models_and_round_trip_dates_sets_and_flags(self):
        self.assertEqual(len(self.catalog), 66)
        self.assertEqual(sum(profile.max_hours is None for profile in self.catalog), 9)
        for reference, profile in zip(self.reference_catalog, self.catalog):
            with self.subTest(profile=profile.id):
                self.assertEqual(profile, Contractor.model_validate(vars(reference)))
                self.assertIsInstance(profile.busy_dates, set)
                self.assertTrue(all(type(day) is date for day in profile.busy_dates))
                self.assertIs(type(profile.price_from_kzt), int)
                for field in ("synthetic", "city_imputed", "price_imputed"):
                    self.assertIs(type(getattr(profile, field)), bool)
                    self.assertEqual(getattr(profile, field), getattr(reference, field))
                encoded = json.loads(profile.model_dump_json())
                self.assertEqual(set(encoded["busy_dates"]), set(reference.busy_dates))
                self.assertEqual(Contractor.model_validate(encoded), profile)

    def test_demo_cards_pass_real_response_envelope_and_keep_frozen_ids(self):
        expected_ids = {
            "dense_autumn": ["HK-42352", "HK-44923", "HK-27222"],
            "dense_other_date": ["HK-27222", "HK-77838", "HK-72938"],
            "rare_florist": ["HK-39372"],
            "absent_category": [],
            "all_booked": [],
            "venue_free": ["HK-90012"],
            "venue_booked": [],
            "december_scarcity": ["HK-44923"],
        }
        for name, payload in demo_requests().items():
            with self.subTest(scenario=name):
                response = self.make_response(payload)
                self.assertIs(type(response.request.event_date), date)
                encoded = json.loads(response.model_dump_json())
                self.assertEqual(encoded["request"]["event_date"], payload["event_date"])
                self.assertEqual([card["id"] for card in encoded["cards"]], expected_ids[name])
                self.assertEqual(encoded["counts"]["returned_total"], len(expected_ids[name]))
                self.assertEqual(MatchResponse.model_validate(encoded), response)
                for card in encoded["cards"]:
                    profile = self.by_id[card["id"]]
                    self.assertEqual(card["event_date"], payload["event_date"])
                    self.assertEqual(card["availability"], "free_in_dataset")
                    self.assertNotIn(response.request.event_date, profile.busy_dates)
                    self.assertIs(type(card["price_from_kzt"]), int)
                    self.assertEqual(card["price_from_kzt"], profile.price_from_kzt)
                    self.assertIs(type(card["price_imputed"]), bool)
                    self.assertEqual(card["source_kind"], "provided")

    def test_ranked_json_is_deterministic_across_model_set_round_trips_and_input_order(self):
        for name, payload in demo_requests().items():
            with self.subTest(scenario=name):
                normal = self.make_response(payload).model_dump(mode="json")
                reversed_models = self.make_response(payload, reverse=True).model_dump(mode="json")
                self.assertEqual(normal, reversed_models)
                self.assertEqual(json.dumps(normal, sort_keys=True), json.dumps(reversed_models, sort_keys=True))

    def test_real_date_sets_exclude_booked_people_and_venues_at_domain_boundary(self):
        presets = demo_requests()
        for identifier, payload in (("HK-42352", presets["dense_other_date"]),
                                    ("HK-90012", presets["venue_booked"])):
            with self.subTest(profile=identifier):
                request = MatchRequest.model_validate(payload)
                profile = self.by_id[identifier]
                self.assertIn(request.event_date, profile.busy_dates)
                with self.assertRaisesRegex(ValueError, "ineligible contractor"):
                    rank_candidates(request, [profile], self.evidence)

    def test_null_hours_remain_null_in_model_and_card_evidence(self):
        payload = demo_requests()["rare_florist"] | {"duration_hours": 12}
        response = self.make_response(payload)
        encoded = json.loads(response.model_dump_json())
        self.assertEqual([card["id"] for card in encoded["cards"]], ["HK-39372"])
        self.assertIsNone(self.by_id["HK-39372"].max_hours)
        self.assertEqual(encoded["request"]["duration_hours"], 12)
        facts = encoded["cards"][0]["evidence"]
        self.assertTrue(any(fact["code"] == "duration" and fact["value"] is None for fact in facts))
        self.assertIn("не применяется", encoded["cards"][0]["explanation"])

    def test_invalid_primitives_are_rejected_before_entering_matching(self):
        payload = demo_requests()["dense_autumn"]
        for changes in ({"event_date": "2026-02-30"}, {"budget_kzt": 0},
                        {"budget_kzt": 1.5}, {"duration_hours": 0}):
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                MatchRequest.model_validate(payload | changes)


if __name__ == "__main__":
    unittest.main()
