"""Public CSV directory stays authoritative, anonymous and separate from accounts."""

import csv
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from backend.app.catalog import dataset_sha256, load_catalog
from backend.app.constants import CALENDAR_END, CALENDAR_START
from backend.app.main import create_app
from scripts.matching_acceptance import demo_requests


CATALOG_PATH = Path(__file__).resolve().parents[2] / "data" / "contractors.csv"
PROFILE_FIELDS = {
    "id", "anon_name", "categories", "city", "price_from_kzt", "description",
    "event_formats", "languages", "synthetic", "city_imputed", "price_imputed", "source_kind",
}


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv("COMMUNITY_DB_PATH", str(tmp_path / "community.sqlite3"))
    with TestClient(create_app()) as client:
        yield client


def test_catalog_is_public_and_matches_all_66_normalized_source_profiles(api):
    before = CATALOG_PATH.read_bytes()
    response = api.get("/api/catalog")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert "set-cookie" not in response.headers
    body = response.json()
    assert set(body) == {"dataset_version", "calendar_start", "calendar_end", "profiles"}
    assert body["dataset_version"] == dataset_sha256(CATALOG_PATH)
    assert body["calendar_start"] == CALENDAR_START.isoformat()
    assert body["calendar_end"] == CALENDAR_END.isoformat()
    expected = [
        {field: getattr(profile, field) for field in PROFILE_FIELDS}
        for profile in sorted(load_catalog(CATALOG_PATH), key=lambda profile: profile.id)
    ]
    assert len(body["profiles"]) == 66
    assert body["profiles"] == expected
    assert len({profile["id"] for profile in body["profiles"]}) == 66
    for profile in body["profiles"]:
        assert set(profile) == PROFILE_FIELDS
        assert profile["source_kind"] == "provided"
        assert type(profile["price_from_kzt"]) is int
        for flag in ("synthetic", "city_imputed", "price_imputed"):
            assert type(profile[flag]) is bool
    assert not api.cookies
    assert CATALOG_PATH.read_bytes() == before


def test_catalog_values_and_flags_match_the_csv_directly(api):
    profiles = {profile["id"]: profile for profile in api.get("/api/catalog").json()["profiles"]}
    with CATALOG_PATH.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    assert len(rows) == len(profiles) == 66
    assert set(profiles) == {row["id"].strip() for row in rows}
    for row in rows:
        profile = profiles[row["id"].strip()]
        for field in ("id", "anon_name", "city", "description"):
            assert profile[field] == row[field].strip()
        for field in ("categories", "event_formats", "languages"):
            assert profile[field] == [part.strip() for part in row[field].split("|") if part.strip()]
        assert profile["price_from_kzt"] == int(row["price_from_kzt"])
        for flag in ("synthetic", "city_imputed", "price_imputed"):
            assert row[flag].strip().casefold() in ("true", "false")
            assert profile[flag] is (row[flag].strip().casefold() == "true")
        assert profile["source_kind"] == "provided"


def test_catalog_order_is_stable_without_reordering_the_matching_snapshot(api):
    expected = api.get("/api/catalog").json()
    api.app.state.catalog = list(reversed(api.app.state.catalog))
    original_order = [profile.id for profile in api.app.state.catalog]
    response = api.get("/api/catalog")
    assert response.status_code == 200
    assert response.json() == expected
    ids = [profile["id"] for profile in expected["profiles"]]
    assert ids == sorted(ids)
    assert [profile.id for profile in api.app.state.catalog] == original_order


def test_catalog_browsing_does_not_create_community_accounts_or_storage(api, tmp_path):
    assert api.get("/api/catalog").status_code == 200
    assert not (tmp_path / "community.sqlite3").exists()
    assert api.get("/api/community/session").json() == {"user": None}
    assert api.get("/api/community/listings").json() == {"listings": []}
    assert api.get("/api/community/events").status_code == 401
    assert not api.cookies


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
def test_catalog_has_no_write_operations(api, method):
    response = api.request(method, "/api/catalog", json={"profiles": []})
    assert response.status_code == 405


@pytest.mark.parametrize("scenario", list(demo_requests()))
def test_catalog_browsing_preserves_matching_results(api, scenario):
    payload = demo_requests()[scenario]
    before = api.post("/api/match", json=payload)
    assert before.status_code == 200
    directory = api.get("/api/catalog")
    after = api.post("/api/match", json=payload)
    assert directory.status_code == 200
    assert after.status_code == 200
    assert after.json() == before.json()
    assert directory.json()["dataset_version"] == after.json()["dataset_version"]


def test_catalog_schema_exposes_only_the_public_directory_contract(api):
    schema = api.get("/openapi.json").json()
    operation = schema["paths"]["/api/catalog"]
    assert set(operation) == {"get"}
    assert "security" not in operation["get"]
    response_schema = operation["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    assert response_schema == {"$ref": "#/components/schemas/CatalogResponse"}
    profile_schema = schema["components"]["schemas"]["CatalogProfile"]
    assert set(profile_schema["properties"]) == PROFILE_FIELDS
    assert set(profile_schema["required"]) == PROFILE_FIELDS
