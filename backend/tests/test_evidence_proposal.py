import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from backend.app.matching.evidence import DEFAULT_EVIDENCE_PATH
from scripts.matching_acceptance import DATASET, load_reference_catalog
from scripts.validate_evidence_proposal import ROOT, validate_proposal


class ProposalValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = load_reference_catalog()
        cls.profile = cls.catalog[0]
        cls.dataset_sha256 = hashlib.sha256(DATASET.read_bytes()).hexdigest()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "proposal.json"
        self.payload = {
            "schema_version": "1",
            "dataset_sha256": self.dataset_sha256,
            "method": "llm-proposal",
            "model": "test-model",
            "prompt_version": "extract-v1",
            "profiles": {
                self.profile.id: [{
                    "id": f"{self.profile.id}:proposal-1",
                    "quote": self.profile.description,
                    "event_formats": [],
                    "use_in_explanation": False,
                }],
            },
        }

    def save(self):
        self.path.write_text(json.dumps(self.payload, ensure_ascii=False), encoding="utf-8")

    def test_subset_report_respects_explanation_flag_and_does_not_promote(self):
        self.save()
        production_before = DEFAULT_EVIDENCE_PATH.read_bytes()
        proposal_before = self.path.read_bytes()
        report = validate_proposal(self.path)
        self.assertEqual(report["catalog_profile_count"], len(self.catalog))
        self.assertEqual(report["profiles_with_records"], 1)
        self.assertEqual(report["record_count"], 1)
        self.assertEqual(report["explanation_record_count"], 0)
        self.assertEqual(report["excluded_record_count"], 1)
        self.assertEqual(report["missing_profile_ids"], sorted(p.id for p in self.catalog[1:]))
        self.assertTrue(report["review_required"])
        self.assertFalse(report["promotion_performed"])
        self.assertEqual(DEFAULT_EVIDENCE_PATH.read_bytes(), production_before)
        self.assertEqual(self.path.read_bytes(), proposal_before)

    def test_llm_provenance_is_required_and_must_be_strings(self):
        original = copy.deepcopy(self.payload)
        for field, value in (("method", ""), ("model", None), ("model", " "),
                             ("prompt_version", None), ("prompt_version", 1)):
            with self.subTest(field=field, value=value):
                self.payload = copy.deepcopy(original)
                self.payload[field] = value
                self.save()
                with self.assertRaisesRegex(ValueError, field):
                    validate_proposal(self.path)

    def test_manual_proposal_needs_no_model_credentials_or_model_provenance(self):
        self.payload["method"] = "manual-proposal"
        del self.payload["model"]
        del self.payload["prompt_version"]
        self.save()
        self.assertEqual(validate_proposal(self.path)["provenance"], {"method": "manual-proposal"})

    def test_source_hash_must_match_the_actual_csv_bytes(self):
        self.payload["dataset_sha256"] = "0" * 64
        self.save()
        with self.assertRaisesRegex(ValueError, "different dataset"):
            validate_proposal(self.path)

    def test_tampered_id_quote_and_format_fail_at_the_import_boundary(self):
        original = copy.deepcopy(self.payload)
        mutations = (
            ("id", "UNKNOWN:proposal-1"),
            ("quote", "A fabricated capability not found in the source profile."),
            ("event_formats", ["unsupported-test-format"]),
            ("use_in_explanation", "False"),
        )
        for field, value in mutations:
            with self.subTest(field=field):
                self.payload = copy.deepcopy(original)
                self.payload["profiles"][self.profile.id][0][field] = value
                self.save()
                with self.assertRaises(ValueError):
                    validate_proposal(self.path)
        self.payload = copy.deepcopy(original)
        self.payload["profiles"]["UNKNOWN"] = self.payload["profiles"].pop(self.profile.id)
        self.save()
        with self.assertRaisesRegex(ValueError, "unknown contractor"):
            validate_proposal(self.path)

    def test_duplicate_quote_is_rejected_even_with_different_evidence_ids(self):
        duplicate = dict(self.payload["profiles"][self.profile.id][0])
        duplicate["id"] = f"{self.profile.id}:proposal-2"
        self.payload["profiles"][self.profile.id].append(duplicate)
        self.save()
        with self.assertRaisesRegex(ValueError, "Duplicate evidence quote"):
            validate_proposal(self.path)

    def test_duplicate_json_keys_cannot_silently_replace_proposed_evidence(self):
        self.path.write_text('{"profiles": {}, "profiles": {}}', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Duplicate JSON key"):
            validate_proposal(self.path)

    def test_cli_works_outside_repository_and_exposes_no_promotion_switch(self):
        self.save()
        command = [sys.executable, str(ROOT / "scripts" / "validate_evidence_proposal.py"),
                   "--input", str(self.path)]
        completed = subprocess.run(command, cwd=self.tmp.name, capture_output=True, encoding="utf-8")
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads(completed.stdout)["validation"], "passed")
        rejected = subprocess.run(command + ["--promote"], cwd=self.tmp.name,
                                  capture_output=True, encoding="utf-8")
        self.assertEqual(rejected.returncode, 2)
        self.assertIn("unrecognized arguments: --promote", rejected.stderr)


if __name__ == "__main__":
    unittest.main()
