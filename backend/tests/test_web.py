"""The one-server demo keeps real API semantics and exposes only built public files."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.web import create_web_app


@pytest.fixture
def website(tmp_path: Path):
    # The tiny build fixture isolates routing; real built JS is covered by browser E2E.
    directory = tmp_path / "dist"
    directory.mkdir()
    (directory / "index.html").write_text("<!doctype html><h1>Orbit test build</h1>", encoding="utf-8")
    (directory / "app.js").write_text("console.log('public asset')", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("must not be exposed", encoding="utf-8")
    with TestClient(create_web_app(directory)) as client:
        yield client


def test_home_and_assets_are_served(website):
    response = website.get("/")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Orbit test build" in response.text
    asset = website.get("/app.js")
    assert asset.status_code == 200
    assert "javascript" in asset.headers["content-type"]


def test_real_catalog_api_and_docs_take_precedence(website):
    health = website.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ready"
    assert health.json()["profile_count"] == 66
    assert website.get("/api/metadata").status_code == 200
    assert website.get("/docs").status_code == 200
    assert "/api/match" in website.get("/openapi.json").json()["paths"]
    result = website.post("/api/match", json={
        "city": "Алматы", "event_date": "2026-10-10", "event_format": "свадьба",
        "category": "Флорист", "budget_kzt": 300000,
    })
    assert result.status_code == 200
    assert [card["id"] for card in result.json()["cards"]] == ["HK-39372"]


def test_invalid_api_input_remains_json_validation_error(website):
    response = website.post("/api/match", json={})
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/json")


@pytest.mark.parametrize("path", [
    "/api/unknown", "/README.md", "/.env", "/data/contractors.csv",
    "/frontend/src/App.tsx", "/%2e%2e/secret.txt", "/missing.js",
])
def test_unknown_routes_and_private_files_are_not_html_fallbacks(website, path):
    response = website.get(path)
    assert response.status_code == 404
    assert "must not be exposed" not in response.text
    assert "Orbit test build" not in response.text


def test_missing_build_has_actionable_message(tmp_path):
    with pytest.raises(RuntimeError, match="Run python start.py"):
        create_web_app(tmp_path)
