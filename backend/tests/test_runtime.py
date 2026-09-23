"""Runtime configuration, startup, and CORS checks."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.catalog import dataset_sha256
from backend.app.matching import algorithm_version
from backend.app.settings import AppSettings, DEFAULT_CORS_ORIGINS


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = REPOSITORY_ROOT / "data" / "contractors.csv"


class RuntimeTests(unittest.TestCase):
    def test_custom_settings_load_evidence_and_report_actual_versions(self) -> None:
        app = create_app(
            AppSettings(
                data_path=CATALOG_PATH,
                cors_origins=DEFAULT_CORS_ORIGINS,
            )
        )
        with TestClient(app) as client:
            response = client.get("/api/health")
            matched = client.post("/api/match", json={
                "city": "Алматы", "event_date": "2026-10-10",
                "event_format": "свадьба", "category": "Флорист",
                "budget_kzt": 300000,
            })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["algorithm_version"], algorithm_version())
        self.assertEqual(response.json()["dataset_version"], dataset_sha256(CATALOG_PATH))
        self.assertEqual(matched.status_code, 200)
        self.assertEqual([card["id"] for card in matched.json()["cards"]], ["HK-39372"])
        self.assertTrue(matched.json()["cards"][0]["evidence"])

    def test_environment_cannot_spoof_the_algorithm_version(self) -> None:
        with patch.dict("os.environ", {
            "ALGORITHM_VERSION": "spoofed-version",
            "DATA_PATH": str(CATALOG_PATH),
        }):
            app = create_app()
        with TestClient(app) as client:
            response = client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["algorithm_version"], algorithm_version())

    def test_cors_allows_the_configured_vite_origin(self) -> None:
        app = create_app(
            AppSettings(
                data_path=CATALOG_PATH,
                cors_origins=("http://localhost:5173",),
            )
        )
        with TestClient(app) as client:
            response = client.options(
                "/api/match",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "POST",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "http://localhost:5173",
        )

    def test_startup_fails_clearly_for_a_missing_catalog(self) -> None:
        with TemporaryDirectory() as directory:
            missing_path = Path(directory) / "missing.csv"
            app = create_app(
                AppSettings(
                    data_path=missing_path,
                    cors_origins=(),
                )
            )
            with self.assertRaisesRegex(RuntimeError, "Catalog/evidence startup validation failed"):
                with TestClient(app):
                    pass

    def test_startup_rejects_evidence_for_a_different_dataset_hash(self) -> None:
        with TemporaryDirectory() as directory:
            changed_path = Path(directory) / "contractors.csv"
            # Still a valid CSV; changing its bytes must invalidate pinned evidence.
            changed_path.write_bytes(CATALOG_PATH.read_bytes() + b"\n")
            app = create_app(AppSettings(data_path=changed_path, cors_origins=()))
            with self.assertRaisesRegex(RuntimeError, "different dataset"):
                with TestClient(app):
                    pass
