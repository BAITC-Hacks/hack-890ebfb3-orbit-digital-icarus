"""Compare dates without confusing changed rank with a booked calendar."""

import json
import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app


def test_dense_date_pair_names_actual_booked_profiles():
    previous = dict(city="Алматы", category="Ведущий", event_format="свадьба", event_date="2026-10-11", budget_kzt=3000000)
    with TestClient(create_app()) as client:
        result = client.post("/api/insights/dates", json={"previous": previous, "current": previous | {"event_date": "2026-10-10"}})
        assert result.status_code == 200
        assert {item["id"]: item["reason"] for item in result.json()["removed"]} == {"HK-42352": "booked", "HK-44923": "booked"}
        assert result.json()["current_ids"] == ["HK-27222", "HK-77838", "HK-72938"]
        # In the reverse direction still-free people may be displaced by returning profiles.
        reverse = client.post("/api/insights/dates", json={"previous": previous | {"event_date": "2026-10-10"}, "current": previous}).json()
        assert {item["id"]: item["reason"] for item in reverse["removed"]} == {"HK-77838": "out_ranked", "HK-72938": "out_ranked"}


def test_comparison_rejects_multiple_changed_conditions_and_invalid_dates():
    base = dict(city="Алматы", category="Ведущий", event_format="свадьба", event_date="2026-10-11", budget_kzt=3000000)
    with TestClient(create_app()) as client:
        assert client.post("/api/insights/dates", json={"previous": base, "current": base | {"budget_kzt": 300000}}).status_code == 422
        assert client.post("/api/insights/dates", json={"previous": base, "current": base | {"event_date": "2030-01-01"}}).status_code == 422
        same = client.post("/api/insights/dates", json={"previous": base, "current": base}).json()
        assert same["added"] == [] and same["removed"] == []


@pytest.mark.parametrize("number", [float("nan"), float("inf"), float("-inf")])
def test_malformed_numbers_cannot_break_insights_validation_response(number):
    base = dict(city="Алматы", category="Ведущий", event_format="свадьба", event_date="2026-10-11", budget_kzt=3000000)
    # The sub-app must use the matching app's JSON-safe validation handler too.
    with TestClient(create_app(), raise_server_exceptions=False) as client:
        response = client.post("/api/insights/dates", content=json.dumps({"previous": base, "current": base | {"duration_hours": number}}), headers={"Content-Type": "application/json"})
        assert response.status_code == 422, response.text
        json.dumps(response.json(), allow_nan=False)
