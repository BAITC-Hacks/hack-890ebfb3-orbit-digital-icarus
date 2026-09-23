import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace

from backend.app.matching import algorithm_version, build_cards, load_evidence, rank_candidates
from backend.app.matching.types import ProfileEvidence


def request(**changes):
    values = dict(city="Алматы", event_date=date(2026, 10, 10), event_format="свадьба",
                  category="Ведущий", budget_kzt=1000000, language=None, duration_hours=None)
    return SimpleNamespace(**(values | changes))


def contractor(identifier="HK-A", **changes):
    values = dict(id=identifier, anon_name=identifier, categories=["Ведущий"], city="Алматы",
                  price_from_kzt=500000, event_formats=["свадьба"], languages=["русский"],
                  max_hours=8, busy_dates=[], description="Пишу сценарии для свадеб.",
                  synthetic=False, city_imputed=False, price_imputed=False)
    return SimpleNamespace(**(values | changes))


class RankingTests(unittest.TestCase):
    def test_relevant_evidence_beats_cheapest_and_uses_integer_score(self):
        cheap = contractor("HK-A", price_from_kzt=100000)
        specific = contractor("HK-B", price_from_kzt=900000)
        evidence = {specific.id: (ProfileEvidence("HK-B:1", "сценарии для свадеб", ("свадьба",)),)}
        result = rank_candidates(request(), [cheap, specific], evidence)
        self.assertEqual([item.contractor.id for item in result], ["HK-B", "HK-A"])
        self.assertEqual([item.score for item in result], [1010, 90])

    def test_order_is_independent_of_source_order_and_uses_id_tie_break(self):
        a, b = contractor("HK-A"), contractor("HK-B")
        for candidates in ([a, b], [b, a]):
            self.assertEqual([item.contractor.id for item in rank_candidates(request(), candidates, {})], ["HK-A", "HK-B"])

    def test_wrong_format_tags_do_not_receive_score(self):
        a = contractor()
        evidence = {a.id: (ProfileEvidence("HK-A:1", "сценарии", ("корпоратив",)),)}
        self.assertEqual(rank_candidates(request(), [a], evidence)[0].score, 50)

    def test_exact_budget_and_duration_limits_pass(self):
        result = rank_candidates(request(duration_hours=8), [contractor(price_from_kzt=1000000)], {})
        self.assertEqual(result[0].score, 0)

    def test_null_hours_is_not_an_attendance_limit(self):
        result = rank_candidates(request(duration_hours=12), [contractor(max_hours=None)], {})
        self.assertEqual(len(result), 1)

    def test_ineligible_candidates_fail_closed(self):
        changes = [dict(city="Астана"), dict(categories=["Фотограф"]),
                   dict(busy_dates=["2026-10-10"]), dict(price_from_kzt=1000001),
                   dict(event_formats=["корпоратив"]), dict(languages=["английский"]),
                   dict(max_hours=2)]
        for change in changes:
            with self.subTest(change=change), self.assertRaises(ValueError):
                rank_candidates(request(language="русский", duration_hours=4), [contractor(**change)], {})

    def test_duplicate_candidates_rejected(self):
        with self.assertRaises(ValueError):
            rank_candidates(request(), [contractor(), contractor()], {})


class ExplanationTests(unittest.TestCase):
    def test_cards_cap_preserve_order_flags_and_grounded_quote(self):
        profiles = [contractor(f"HK-{n}", synthetic=True, price_imputed=True) for n in range(5)]
        evidence = {p.id: (ProfileEvidence(f"{p.id}:1", "сценарии для свадеб", ("свадьба",)),) for p in profiles}
        cards = build_cards(request(), rank_candidates(request(), profiles, evidence), evidence)
        self.assertEqual([card["id"] for card in cards], ["HK-0", "HK-1", "HK-2"])
        for card in cards:
            self.assertTrue(card["synthetic"] and card["price_imputed"])
            self.assertIn("10.10.2026", card["explanation"])
            self.assertIn("от 500 000 ₸", card["explanation"])
            self.assertEqual(card["evidence"][-1]["source_quote"], "сценарии для свадеб")

    def test_no_description_evidence_falls_back_to_actual_facts(self):
        req = request(duration_hours=10)
        cards = build_cards(req, rank_candidates(req, [contractor(max_hours=None)], {}), {})
        text = cards[0]["explanation"]
        self.assertIn("не применяется", text)
        self.assertNotIn("безлимит", text)
        self.assertFalse(any(item["code"] == "description" for item in cards[0]["evidence"]))

    def test_changed_description_is_rejected_at_render_time(self):
        p = contractor()
        evidence = {p.id: (ProfileEvidence("HK-A:1", "несуществующий факт", ("свадьба",)),)}
        with self.assertRaises(ValueError):
            build_cards(request(), rank_candidates(request(), [p], evidence), evidence)


class EvidenceValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "evidence.json"
        self.payload = {"schema_version": "1", "dataset_sha256": "test-sha", "profiles": {
            "HK-A": [{"id": "HK-A:1", "quote": "сценарии для свадеб", "event_formats": ["свадьба"]}]}}

    def save(self):
        self.path.write_text(json.dumps(self.payload, ensure_ascii=False), encoding="utf-8")

    def test_valid_source_and_hash(self):
        self.save()
        index = load_evidence([contractor()], self.path, dataset_sha256="test-sha")
        self.assertEqual(index["HK-A"][0].quote, "сценарии для свадеб")
        with self.assertRaises(TypeError):
            index["HK-B"] = ()

    def test_bad_quote_tag_id_or_hash_is_not_accepted(self):
        for field, value in [("quote", "invented"), ("event_formats", ["корпоратив"]), ("id", "HK-B:1")]:
            original = self.payload["profiles"]["HK-A"][0][field]
            self.payload["profiles"]["HK-A"][0][field] = value
            self.save()
            with self.subTest(field=field), self.assertRaises(ValueError):
                load_evidence([contractor()], self.path)
            self.payload["profiles"]["HK-A"][0][field] = original
        self.save()
        with self.assertRaises(ValueError):
            load_evidence([contractor()], self.path, dataset_sha256="changed")

    def test_algorithm_version_changes_with_evidence(self):
        self.save()
        initial = algorithm_version(self.path)
        self.payload["profiles"]["HK-A"][0]["event_formats"] = []
        self.save()
        self.assertNotEqual(initial, algorithm_version(self.path))

    def test_malformed_evidence_root_has_clear_error(self):
        for payload in (None, [], "bad"):
            self.payload = payload
            self.save()
            with self.subTest(payload=payload), self.assertRaisesRegex(ValueError, "root must be an object"):
                load_evidence([contractor()], self.path)

    def test_attribution_only_evidence_uses_structured_fallback(self):
        record = self.payload["profiles"]["HK-A"][0]
        record["event_formats"] = []
        record["use_in_explanation"] = False
        self.save()
        p = contractor()
        index = load_evidence([p], self.path)
        cards = build_cards(request(), rank_candidates(request(), [p], index), index)
        self.assertFalse(any(item["code"] == "description" for item in cards[0]["evidence"]))


if __name__ == "__main__":
    unittest.main()
