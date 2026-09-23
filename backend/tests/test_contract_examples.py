"""Check the shared frontend fixtures against the response contract."""

import json
from pathlib import Path
import unittest

from backend.app.models import MatchResponse
from backend.app.main import create_app


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
EXAMPLES_PATH = REPOSITORY_ROOT / "contracts" / "examples"


class ContractExampleTests(unittest.TestCase):
    def test_published_openapi_matches_the_running_application(self) -> None:
        """Keep the team handoff schema synchronized with actual API models."""
        published = json.loads(
            (REPOSITORY_ROOT / "contracts" / "openapi.json").read_text(encoding="utf-8")
        )
        self.assertEqual(published, create_app().openapi())

    def test_all_business_outcome_fixtures_validate(self) -> None:
        expected_files = {
            "matches_found.json",
            "category_absent.json",
            "no_eligible_contractors.json",
        }
        self.assertEqual(
            {path.name for path in EXAMPLES_PATH.glob("*.json")},
            expected_files,
        )

        statuses = set()
        for name in expected_files:
            payload = json.loads((EXAMPLES_PATH / name).read_text(encoding="utf-8"))
            response = MatchResponse.model_validate(payload)
            statuses.add(response.status)

        self.assertEqual(
            statuses,
            {
                "matches_found",
                "category_absent",
                "no_eligible_contractors",
            },
        )
