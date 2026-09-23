"""Runtime configuration, startup, and CORS checks."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.settings import AppSettings, DEFAULT_CORS_ORIGINS


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = REPOSITORY_ROOT / "data" / "contractors.csv"


class RuntimeTests(unittest.TestCase):
    def test_custom_settings_drive_health_versions(self) -> None:
        app = create_app(
            AppSettings(
                data_path=CATALOG_PATH,
                algorithm_version="test-version",
                cors_origins=DEFAULT_CORS_ORIGINS,
            )
        )
        with TestClient(app) as client:
            response = client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["algorithm_version"], "test-version")

    def test_cors_allows_the_configured_vite_origin(self) -> None:
        app = create_app(
            AppSettings(
                data_path=CATALOG_PATH,
                algorithm_version="test-version",
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
                    algorithm_version="test-version",
                    cors_origins=(),
                )
            )
            with self.assertRaisesRegex(RuntimeError, "Catalog startup validation failed"):
                with TestClient(app):
                    pass
