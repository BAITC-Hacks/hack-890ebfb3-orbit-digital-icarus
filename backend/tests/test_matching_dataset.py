import hashlib
import unittest
from types import SimpleNamespace

from backend.app.matching import build_cards, load_evidence, rank_candidates
from scripts.matching_acceptance import DATASET, demo_requests, evaluate, load_reference_catalog


class RealDatasetMatchingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = load_reference_catalog()
        cls.evidence = load_evidence(cls.catalog, dataset_sha256=hashlib.sha256(DATASET.read_bytes()).hexdigest())

    def test_curated_evidence_covers_all_profiles_and_is_grounded(self):
        self.assertEqual(len(self.catalog), 66)
        self.assertEqual(set(self.evidence), {p.id for p in self.catalog})
        self.assertEqual(sum(p.synthetic for p in self.catalog), 13)
        for profile in self.catalog:
            self.assertTrue(self.evidence[profile.id])
            for item in self.evidence[profile.id]:
                self.assertIn(item.quote, profile.description)

    def test_verified_demo_outcomes_and_counts(self):
        expected = {
            "dense_autumn": ("matches_found", 10, 5, 3),
            "dense_other_date": ("matches_found", 10, 3, 3),
            "rare_florist": ("matches_found", 2, 1, 1),
            "absent_category": ("category_absent", 0, 0, 0),
            "all_booked": ("no_eligible_contractors", 1, 0, 0),
            "venue_free": ("matches_found", 1, 1, 1),
            "venue_booked": ("no_eligible_contractors", 1, 0, 0),
            "december_scarcity": ("matches_found", 10, 1, 1),
        }
        for name, payload in demo_requests().items():
            with self.subTest(name=name):
                actual = evaluate(payload, self.catalog, self.evidence)
                counts = actual["counts"]
                self.assertEqual((actual["status"], counts["city_category_total"], counts["eligible_total"], counts["returned_total"]), expected[name])
                self.assertEqual(sum(actual["exclusions"].values()), counts["city_category_total"] - counts["eligible_total"])
                self.assertEqual(actual, evaluate(payload, list(reversed(self.catalog)), self.evidence))

    def test_changed_date_changes_visible_shortlist_and_explains_date(self):
        presets = demo_requests()
        first = evaluate(presets["dense_autumn"], self.catalog, self.evidence)["cards"]
        second = evaluate(presets["dense_other_date"], self.catalog, self.evidence)["cards"]
        self.assertNotEqual([p["id"] for p in first], [p["id"] for p in second])
        for card in first:
            self.assertIn("11.10.2026", card["explanation"])
        for card in second:
            self.assertIn("10.10.2026", card["explanation"])

    def test_demo_explanations_are_distinct_without_names(self):
        for name, payload in demo_requests().items():
            cards = evaluate(payload, self.catalog, self.evidence)["cards"]
            texts = [card["explanation"].replace(card["anon_name"], "") for card in cards]
            with self.subTest(name=name):
                self.assertEqual(len(texts), len(set(texts)))
                for card in cards:
                    description_facts = [item for item in card["evidence"] if item["code"] == "description"]
                    self.assertTrue(description_facts)

    def test_every_profile_can_render_facts_without_hallucinations(self):
        for profile in self.catalog:
            free_date = next(f"2026-10-{day:02d}" for day in range(1, 32)
                             if f"2026-10-{day:02d}" not in profile.busy_dates)
            payload = dict(city=profile.city, event_date=free_date, event_format=profile.event_formats[0],
                           category=profile.categories[0], budget_kzt=profile.price_from_kzt,
                           duration_hours=profile.max_hours, language=profile.languages[0])
            request = SimpleNamespace(**payload)
            card = build_cards(request, rank_candidates(request, [profile], self.evidence), self.evidence)[0]
            with self.subTest(profile=profile.id):
                self.assertEqual(card["price_from_kzt"], profile.price_from_kzt)
                self.assertEqual(card["synthetic"], profile.synthetic)
                for fact in card["evidence"]:
                    if fact["code"] == "description":
                        self.assertIn(fact["source_quote"], profile.description)


if __name__ == "__main__":
    unittest.main()
