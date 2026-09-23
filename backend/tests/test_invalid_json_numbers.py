"""Rejected JSON numbers must produce useful 422 errors rather than 500."""

import asyncio
import json
import unittest

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.validation_errors import request_validation_exception_handler


BASE_REQUEST = {
    "city": "Алматы", "event_date": "2026-10-10", "event_format": "свадьба",
    "category": "Флорист", "budget_kzt": 300_000, "duration_hours": None,
    "language": None,
}


def raw_request(field, raw_value):
    fields = [f"{json.dumps(key)}:{raw_value if key == field else json.dumps(value)}"
              for key, value in BASE_REQUEST.items()]
    return "{" + ",".join(fields) + "}"


class InvalidJsonNumberTests(unittest.TestCase):
    def setUp(self):
        self.client = self.enterContext(TestClient(create_app()))

    def assert_field_error(self, response, field):
        self.assertEqual(response.status_code, 422, response.text)
        body = response.json()
        self.assertEqual(set(body), {"detail"})
        self.assertIsInstance(body["detail"], list)
        self.assertTrue(body["detail"])
        self.assertTrue(any(item["loc"] == ["body", field] for item in body["detail"]), body)
        for item in body["detail"]:
            self.assertTrue(item["type"])
            self.assertTrue(item["msg"])
            self.assertIn("input", item)
        # Fail if any nonstandard numeric constant survives into the JSON body.
        json.dumps(body, allow_nan=False)
        self.assertNotIn("Traceback", response.text)

    def test_raw_nonfinite_and_overflow_numbers_return_422_for_both_fields(self):
        for field in ("duration_hours", "budget_kzt"):
            for token in ("1e309", "-1e309", "NaN", "Infinity", "-Infinity"):
                with self.subTest(field=field, token=token):
                    response = self.client.post("/api/match", content=raw_request(field, token),
                                                headers={"Content-Type": "application/json"})
                    self.assert_field_error(response, field)
                    value = next(item["input"] for item in response.json()["detail"]
                                 if item["loc"] == ["body", field])
                    self.assertIn(value, {"inf", "-inf", "nan"})

    def test_nonfinite_values_nested_in_wrong_input_types_are_serializable(self):
        for token in ('[1e309,{"nested":NaN}]', '{"nested":[Infinity,-1e309]}'):
            with self.subTest(token=token):
                response = self.client.post("/api/match", content=raw_request("duration_hours", token),
                                            headers={"Content-Type": "application/json"})
                self.assert_field_error(response, "duration_hours")

    def test_normal_invalid_strings_keep_field_locations_and_input(self):
        for field, value in (("duration_hours", "e"), ("duration_hours", "Infinity"),
                             ("duration_hours", "NaN"), ("budget_kzt", "abc"),
                             ("event_date", "2026-10-32"), ("event_date", "2027-01-01")):
            with self.subTest(field=field, value=value):
                response = self.client.post("/api/match", json=BASE_REQUEST | {field: value})
                self.assert_field_error(response, field)
                self.assertEqual(next(item["input"] for item in response.json()["detail"]
                                      if item["loc"] == ["body", field]), value)

    def test_wrong_types_and_negative_numbers_remain_validation_errors(self):
        for field, value in (("duration_hours", True), ("duration_hours", -1),
                             ("duration_hours", []), ("budget_kzt", False),
                             ("budget_kzt", {}), ("budget_kzt", 1.5), ("budget_kzt", 0)):
            with self.subTest(field=field, value=value):
                self.assert_field_error(self.client.post("/api/match", json=BASE_REQUEST | {field: value}), field)

    def test_context_exception_objects_are_omitted_without_losing_other_context(self):
        exception = ValueError("private exception representation")
        exc = RequestValidationError([{
            "type": "value_error", "loc": ("body", "duration_hours"),
            "msg": "Invalid duration", "input": {"nested": [float("inf"), float("nan")]},
            "ctx": {"error": exception, "limit": 0},
        }])
        request = Request({"type": "http", "method": "POST", "path": "/api/match", "headers": []})
        response = asyncio.run(request_validation_exception_handler(request, exc))
        body = json.loads(response.body)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(body["detail"][0]["ctx"], {"limit": 0})
        self.assertEqual(body["detail"][0]["input"], {"nested": ["inf", "nan"]})
        self.assertNotIn("private exception representation", response.body.decode())
        self.assertIs(exc.errors()[0]["ctx"]["error"], exception)

    def test_valid_match_still_uses_the_real_catalog(self):
        response = self.client.post("/api/match", json=BASE_REQUEST)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([card["id"] for card in response.json()["cards"]], ["HK-39372"])
