"""Community authorization, persistence and coordination contracts.

Every test uses its own SQLite database and real password hashing.  Independent
TestClients model independent cookie jars; mounting exercises the production
cookie path without importing main.app or touching its default database.
The existing test_api.py suite separately covers anonymous CSV matching.
"""

import asyncio
from contextlib import ExitStack, asynccontextmanager
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from http.cookies import SimpleCookie
import json
from pathlib import Path
import sqlite3
from types import SimpleNamespace
from uuid import UUID, uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest


PREFIX = "/api/community"
PASSWORD = "Community-test-password-73!"
CATALOG_PATH = Path(__file__).resolve().parents[2] / "data" / "contractors.csv"
CATALOG_SHA256 = "6a724b6b7dfb5973343e68ba18dadb60fc807d87e3d78f03ee86fb26cb089f7d"


def success(response, status=None):
    assert response.status_code in ((status,) if status is not None else (200, 201)), response.text
    return response.json()


def private_resource_denied(response):
    # A 404 can conceal private event existence from outsiders and former members.
    assert response.status_code in (403, 404), response.text
    return rejected(response, response.status_code)


def rejected(response, status=None):
    if status is None:
        assert response.status_code in (400, 404, 409, 422), response.text
    else:
        assert response.status_code == status, response.text
    detail = response.json()["detail"]
    if response.status_code == 422 and isinstance(detail, list):
        assert detail
    else:
        assert isinstance(detail, dict), detail
        assert isinstance(detail.get("code"), str) and detail["code"], detail
    assert "Traceback (most recent call last)" not in response.text
    return response.json()


def registration(**changes):
    return {
        "username": "sample_user",
        "password": PASSWORD,
        "display_name": "Алия / Aliya",
        "role": "provider",
    } | changes


def slot(category, **changes):
    return {
        "id": str(uuid4()),
        "category": category,
        "notes": "",
        "checklist": [{"text": "Confirm the schedule", "done": False}],
    } | changes


def invitation_for(event, slot_id):
    return next(invite for invite in event["invitations"] if invite["slot_id"] == slot_id)


def assert_public_user(user):
    assert set(user) == {"id", "username", "display_name", "role"}
    UUID(user["id"])
    assert user["role"] in ("organizer", "provider")


@dataclass
class Account:
    client: TestClient
    user: dict


class Community:
    def __init__(self, database_path, *, allowed_origins=()):
        # Deliberately lazy: tests can be collected while the API is being built.
        from backend.app.community.api import create_community_app

        self.database_path = database_path
        self.stack = ExitStack()
        self.account_count = 0
        child = create_community_app(database_path, allowed_origins=allowed_origins)

        @asynccontextmanager
        async def lifespan(app):
            async with child.router.lifespan_context(child):
                yield

        self.app = FastAPI(lifespan=lifespan)
        self.app.mount(PREFIX, child)
        self.public = self.client()
        self.templates = success(self.public.get(f"{PREFIX}/templates"))
        self.categories = [service["category"] for service in self.templates["services"]]

    def close(self):
        self.stack.close()

    def client(self, *, https=False):
        return self.stack.enter_context(
            TestClient(self.app, base_url=f"{'https' if https else 'http'}://testserver")
        )

    def account(self, role="provider", **changes):
        self.account_count += 1
        client = self.client()
        body = success(client.post(
            f"{PREFIX}/register",
            json=registration(username=f"member_{self.account_count}", role=role, **changes),
        ), status=201)
        assert_public_user(body["user"])
        assert success(client.get(f"{PREFIX}/session"))["user"] == body["user"]
        return Account(client, body["user"])

    def listing_payload(self, **changes):
        return {
            "title": "Independent community service",
            "category": self.categories[0],
            "city": "Алматы",
            "price_from_kzt": 150_000,
            "description": "Community service with a clear scope and working schedule.",
            "active": True,
        } | changes

    def listing(self, provider, **changes):
        return success(provider.client.post(
            f"{PREFIX}/listings", json=self.listing_payload(**changes),
        ), status=201)

    def event_payload(self, **changes):
        template = next(item for item in self.templates["events"] if item["services"])
        return {
            "title": "Community celebration",
            "city": "Алматы",
            "event_date": "2027-05-20",
            "template_id": template["id"],
            "locale": "en",
        } | changes

    def event(self, owner, **changes):
        return success(owner.client.post(f"{PREFIX}/events", json=self.event_payload(**changes)), status=201)

    def detail(self, account, event):
        return success(account.client.get(f"{PREFIX}/events/{event['id']}"))

    def plan(self, owner, event, slots):
        return success(owner.client.put(
            f"{PREFIX}/events/{event['id']}/plan",
            json={"version": event["version"], "slots": slots},
        ))

    def invite(self, owner, event, slot_id, listing):
        return success(owner.client.post(
            f"{PREFIX}/events/{event['id']}/invitations",
            json={"version": event["version"], "slot_id": slot_id, "listing_id": listing["id"]},
        ))

    def respond(self, provider, event, slot_id, decision="accepted"):
        return success(provider.client.post(
            f"{PREFIX}/events/{event['id']}/invitations/{slot_id}/respond",
            json={"version": event["version"], "decision": decision},
        ))

    def message(self, account, event, text):
        return success(account.client.post(
            f"{PREFIX}/events/{event['id']}/messages", json={"text": text},
        ), status=201)["message"]

    def messages(self, account, event):
        return success(account.client.get(f"{PREFIX}/events/{event['id']}/messages"))["messages"]


@pytest.fixture
def community_factory(tmp_path):
    instances = []

    def factory(database_path=None, **kwargs):
        instance = Community(database_path or tmp_path / "community.sqlite3", **kwargs)
        instances.append(instance)
        return instance

    yield factory
    for instance in reversed(instances):
        instance.close()


@pytest.fixture
def community(community_factory):
    return community_factory()


@pytest.fixture
def clock(monkeypatch):
    """Control only the API's clocks; retain real hashing and rate-limit logic."""
    from backend.app.community import api

    class Clock:
        current = datetime.now(timezone.utc)

        def advance(self, seconds):
            self.current += timedelta(seconds=seconds)

    clock = Clock()

    class ControlledDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return clock.current.astimezone(tz) if tz else clock.current.replace(tzinfo=None)

    monkeypatch.setattr(api, "datetime", ControlledDatetime)
    monkeypatch.setattr(api, "time", SimpleNamespace(time=lambda: clock.current.timestamp()))
    return clock


@pytest.fixture
def owner(community):
    return community.account("organizer")


@pytest.fixture
def provider(community):
    return community.account()


@pytest.fixture
def event(community, owner):
    return community.event(owner)


@pytest.fixture
def invited(community, owner, provider, event):
    event = community.plan(owner, event, [slot(community.categories[0])])
    listing = community.listing(provider)
    return community.invite(owner, event, event["slots"][0]["id"], listing)


@pytest.fixture
def accepted(community, provider, invited):
    return community.respond(provider, invited, invited["slots"][0]["id"])


def test_anonymous_session_templates_and_listings_are_public(community):
    assert success(community.public.get(f"{PREFIX}/session")) == {"user": None}
    assert success(community.public.get(f"{PREFIX}/listings")) == {"listings": []}
    templates = community.templates
    assert set(templates["cities"]) == {"Алматы", "Астана", "Зарубежье"}
    assert len(community.categories) == len(set(community.categories)) >= 2
    assert templates["events"]
    assert len({item["id"] for item in templates["events"]}) == len(templates["events"])
    for service in templates["services"]:
        for locale in ("ru", "en"):
            assert service["label"][locale].strip()
            assert service["checklist"][locale]
            assert all(text.strip() for text in service["checklist"][locale])
    for template in templates["events"]:
        assert all(template["label"][locale].strip() for locale in ("ru", "en"))
        assert set(template["services"]) <= set(community.categories)


def test_all_private_routes_require_authentication(community, owner, invited):
    event_id = invited["id"]
    slot_id = invited["slots"][0]["id"]
    listing_id = invited["invitations"][0]["listing_id"]
    version = invited["version"]
    requests = [
        ("GET", "/listings?mine=true", None),
        ("POST", "/listings", community.listing_payload()),
        ("PUT", f"/listings/{listing_id}", community.listing_payload()),
        ("GET", "/events", None),
        ("POST", "/events", community.event_payload()),
        ("GET", f"/events/{event_id}", None),
        ("PUT", f"/events/{event_id}/plan", {"version": version, "slots": invited["slots"]}),
        ("POST", f"/events/{event_id}/invitations", {
            "version": version, "slot_id": slot_id, "listing_id": listing_id,
        }),
        ("POST", f"/events/{event_id}/invitations/{slot_id}/respond", {
            "version": version, "decision": "accepted",
        }),
        ("GET", f"/events/{event_id}/messages", None),
        ("POST", f"/events/{event_id}/messages", {"text": "Unauthorized message"}),
    ]
    for method, path, body in requests:
        rejected(community.public.request(method, PREFIX + path, json=body), 401)
    assert community.detail(owner, invited) == invited


def test_registration_casefold_uniqueness_and_case_insensitive_login(community):
    original = success(community.public.post(
        f"{PREFIX}/register", json=registration(username="Alice_Example"),
    ))["user"]
    assert_public_user(original)
    assert original["username"] == "alice_example"
    duplicate = community.client()
    rejected(duplicate.post(f"{PREFIX}/register", json=registration(username="ALICE_EXAMPLE")), 409)
    assert success(duplicate.get(f"{PREFIX}/session"))["user"] is None
    logged_in = success(duplicate.post(
        f"{PREFIX}/login", json={"username": "aLiCe_ExAmPlE", "password": PASSWORD},
    ))
    assert logged_in["user"] == original


@pytest.mark.parametrize("changes", [
    {"username": "ab"}, {"username": "x" * 33}, {"username": "Алия"},
    {"username": "name space"}, {"username": "x' OR 1=1--"},
    {"password": "short1234"}, {"password": "x" * 129},
    {"display_name": " \t\n"}, {"role": "admin"},
])
def test_invalid_registration_never_creates_a_session(community, changes):
    payload = registration(**changes)
    response = community.public.post(f"{PREFIX}/register", json=payload)
    rejected(response)
    assert payload["password"] not in response.text, "Validation must not echo submitted passwords"
    assert success(community.public.get(f"{PREFIX}/session"))["user"] is None


@pytest.mark.parametrize("endpoint", ["register", "login"])
def test_credential_validation_errors_do_not_echo_plaintext_passwords(community, endpoint):
    secret = "Never-echo-this-submitted-password!"
    payload = {"username": "invalid username", "password": secret}
    if endpoint == "register":
        payload = registration(**payload)
    response = community.public.post(f"{PREFIX}/{endpoint}", json=payload)
    rejected(response, 422)
    assert secret not in response.text
    assert success(community.public.get(f"{PREFIX}/session"))["user"] is None


@pytest.mark.parametrize("length", [10, 128])
def test_password_length_boundaries_round_trip(community, length):
    password = "p" * length
    user = success(community.public.post(
        f"{PREFIX}/register", json=registration(password=password),
    ))["user"]
    success(community.public.post(f"{PREFIX}/logout", json={}))
    assert success(community.public.post(
        f"{PREFIX}/login", json={"username": user["username"], "password": password},
    ))["user"] == user


def test_passwords_are_salted_hashes_and_sessions_are_not_stored_as_bearer_tokens(community):
    first = community.account()
    second = community.account()
    with sqlite3.connect(community.database_path) as connection:
        hashes = [row[0] for row in connection.execute("SELECT password_hash FROM users")]
        stored_tokens = {row[0] for row in connection.execute("SELECT token_hash FROM sessions")}
        dump = "\n".join(connection.iterdump())
    assert len(hashes) == 2
    assert len(set(hashes)) == 2, "Identical passwords must use different salts"
    assert all(value.startswith("scrypt$") for value in hashes)
    assert PASSWORD not in dump
    for account in (first, second):
        assert PASSWORD not in str(account.user)
        cookies = list(account.client.cookies.jar)
        assert cookies
        for cookie in cookies:
            assert cookie.value not in stored_tokens
            assert cookie.value not in dump


def test_login_failure_does_not_enumerate_accounts(community, provider):
    wrong_password = community.public.post(f"{PREFIX}/login", json={
        "username": provider.user["username"], "password": "definitely-wrong-password",
    })
    unknown_user = community.public.post(f"{PREFIX}/login", json={
        "username": "nobody_registered", "password": "definitely-wrong-password",
    })
    assert rejected(wrong_password, 401) == rejected(unknown_user, 401)
    assert not wrong_password.headers.get("set-cookie")
    assert not unknown_user.headers.get("set-cookie")
    assert success(community.public.get(f"{PREFIX}/session"))["user"] is None


@pytest.mark.parametrize("https", [False, True], ids=["local-http", "https"])
def test_session_cookie_flags_scope_and_private_response_headers(community, https):
    client = community.client(https=https)
    response = client.post(f"{PREFIX}/register", json=registration())
    user = success(response)["user"]
    parsed = SimpleCookie()
    for header in response.headers.get_list("set-cookie"):
        parsed.load(header)
    assert parsed
    for cookie in parsed.values():
        assert cookie["httponly"]
        assert cookie["samesite"].lower() in ("lax", "strict")
        assert cookie["path"] == PREFIX
        assert not cookie["domain"]
        assert bool(cookie["secure"]) is https
    session = client.get(f"{PREFIX}/session")
    assert success(session)["user"] == user
    for protected in (response, session):
        assert "no-store" in protected.headers.get("cache-control", "").lower()
        assert protected.headers.get("x-content-type-options") == "nosniff"
    assert client.build_request("GET", "/api/match").headers.get("cookie") is None


def test_logout_revokes_copied_session_and_login_issues_a_new_token(community, provider):
    copied = community.client()
    copied.cookies.update(provider.client.cookies)
    original_tokens = {cookie.value for cookie in copied.cookies.jar}
    assert success(copied.get(f"{PREFIX}/session"))["user"] == provider.user
    assert success(provider.client.post(f"{PREFIX}/logout", json={})) == {"ok": True}
    assert success(provider.client.get(f"{PREFIX}/session"))["user"] is None
    assert success(copied.get(f"{PREFIX}/session"))["user"] is None
    rejected(copied.post(f"{PREFIX}/listings", json=community.listing_payload()), 401)
    assert not list(provider.client.cookies.jar)
    success(provider.client.post(f"{PREFIX}/login", json={
        "username": provider.user["username"], "password": PASSWORD,
    }))
    assert original_tokens.isdisjoint({cookie.value for cookie in provider.client.cookies.jar})
    assert success(copied.get(f"{PREFIX}/session"))["user"] is None


def test_forged_cookie_cannot_authenticate(community, provider):
    client = community.client()
    for cookie in provider.client.cookies.jar:
        forged = ("0" if cookie.value[0] != "0" else "1") + cookie.value[1:]
        client.cookies.set(cookie.name, forged, domain=cookie.domain, path=cookie.path)
    assert success(client.get(f"{PREFIX}/session"))["user"] is None
    rejected(client.post(f"{PREFIX}/listings", json=community.listing_payload()), 401)


def test_login_rotates_and_revokes_the_previous_browser_session(community, provider):
    copied = community.client()
    copied.cookies.update(provider.client.cookies)
    success(provider.client.post(f"{PREFIX}/login", json={
        "username": provider.user["username"], "password": PASSWORD,
    }))
    assert success(provider.client.get(f"{PREFIX}/session"))["user"] == provider.user
    assert success(copied.get(f"{PREFIX}/session"))["user"] is None
    rejected(copied.post(f"{PREFIX}/listings", json=community.listing_payload()), 401)


def test_expired_session_cannot_read_private_data_or_mutate(community, provider, clock):
    clock.advance(7 * 24 * 60 * 60 + 1)
    assert success(provider.client.get(f"{PREFIX}/session"))["user"] is None
    rejected(provider.client.get(f"{PREFIX}/listings?mine=true"), 401)
    rejected(provider.client.post(f"{PREFIX}/listings", json=community.listing_payload()), 401)


def test_auth_rate_limit_is_shared_across_login_signup_and_cookie_jars(community, clock):
    provider = community.account()
    credentials = {"username": provider.user["username"], "password": "wrong-password-123"}
    # Registration consumes one attempt; 29 failed logins exhaust this IP's window.
    for _ in range(29):
        rejected(community.public.post(f"{PREFIX}/login", json=credentials), 401)
    another_browser = community.client()
    rejected(another_browser.post(f"{PREFIX}/login", json=credentials), 429)
    rejected(another_browser.post(f"{PREFIX}/register", json=registration()), 429)
    assert success(provider.client.get(f"{PREFIX}/session"))["user"] == provider.user
    assert success(community.public.get(f"{PREFIX}/listings"))["listings"] == []
    with sqlite3.connect(community.database_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    clock.advance(301)
    assert success(another_browser.post(f"{PREFIX}/login", json={
        "username": provider.user["username"], "password": PASSWORD,
    }))["user"] == provider.user


@pytest.mark.parametrize("origin", ["https://evil.example", "http://testserver.evil.example", "null"])
def test_untrusted_origin_cannot_register_or_mutate_or_logout(community, provider, origin):
    headers = {"Origin": origin}
    rejected(community.public.post(f"{PREFIX}/register", json=registration(), headers=headers), 403)
    rejected(community.public.post(f"{PREFIX}/login", json={
        "username": provider.user["username"], "password": PASSWORD,
    }, headers=headers), 403)
    rejected(provider.client.post(
        f"{PREFIX}/listings", json=community.listing_payload(), headers=headers,
    ), 403)
    rejected(provider.client.post(f"{PREFIX}/logout", json={}, headers=headers), 403)
    assert success(provider.client.get(f"{PREFIX}/session"))["user"] == provider.user
    assert success(community.public.get(f"{PREFIX}/listings"))["listings"] == []


def test_same_origin_and_explicitly_allowed_origin_can_mutate(community_factory):
    community = community_factory(allowed_origins=("https://planner.example",))
    client = community.public
    success(client.post(f"{PREFIX}/register", json=registration(), headers={"Origin": "http://testserver"}))
    listing = success(client.post(f"{PREFIX}/listings", json=community.listing_payload(), headers={
        "Origin": "https://planner.example",
    }))
    assert listing["active"] is True


def test_browser_form_posts_and_oversized_json_bodies_are_rejected(community, provider):
    rejected(provider.client.post(f"{PREFIX}/listings", data=community.listing_payload()), 415)
    rejected(provider.client.post(f"{PREFIX}/listings", content='{"title":"Form attack"}', headers={
        "Content-Type": "text/plain",
    }), 415)
    rejected(provider.client.post(f"{PREFIX}/listings", json=community.listing_payload(
        description="x" * (512 * 1024 + 1),
    )), 413)
    assert success(community.public.get(f"{PREFIX}/listings"))["listings"] == []


@pytest.mark.parametrize("content_length", [None, b"1"], ids=["no-content-length", "false-content-length"])
def test_body_limit_counts_streamed_bytes_and_stops_before_consuming_the_whole_body(community, content_length):
    # TestClient combines iterable bodies into one ASGI message.  Send real ASGI
    # chunks here so the streaming limit cannot accidentally rely on headers.
    payload = b'{"ignored":"' + b"x" * (768 * 1024) + b'"}'
    chunks = [payload[start:start + 128 * 1024] for start in range(0, len(payload), 128 * 1024)]
    headers = [(b"host", b"testserver"), (b"content-type", b"application/json")]
    if content_length is not None:
        headers.append((b"content-length", content_length))
    consumed = 0
    responses = []

    async def receive():
        nonlocal consumed
        assert consumed < len(chunks), "Middleware should reject before exhausting the body"
        consumed += 1
        return {"type": "http.request", "body": chunks[consumed - 1], "more_body": consumed < len(chunks)}

    async def send(message):
        responses.append(message)

    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "POST", "scheme": "http", "path": f"{PREFIX}/register",
        "raw_path": f"{PREFIX}/register".encode(), "query_string": b"", "root_path": "",
        "headers": headers, "client": ("testclient", 50000), "server": ("testserver", 80),
    }
    asyncio.run(community.app(scope, receive, send))
    start = next(item for item in responses if item["type"] == "http.response.start")
    assert start["status"] == 413
    assert consumed == 5
    assert consumed < len(chunks)
    body = json.loads(b"".join(item.get("body", b"") for item in responses if item["type"] == "http.response.body"))
    assert isinstance(body["detail"]["code"], str)
    assert success(community.public.get(f"{PREFIX}/session"))["user"] is None


def test_listing_publication_filters_editing_and_private_inactive_visibility(community, provider):
    other = community.account()
    first = community.listing(provider)
    second = community.listing(other, city="Астана", category=community.categories[1])
    hidden = community.listing(provider, active=False, title="Not published")
    assert first["owner_id"] == provider.user["id"]
    assert first["provider_name"] == provider.user["display_name"]
    UUID(first["id"])
    assert first["created_at"]
    assert {row["id"] for row in success(community.public.get(f"{PREFIX}/listings"))["listings"]} == {
        first["id"], second["id"],
    }
    filtered = success(community.public.get(f"{PREFIX}/listings", params={
        "city": first["city"], "category": first["category"],
    }))["listings"]
    assert filtered == [first]
    mine = success(provider.client.get(f"{PREFIX}/listings", params={"mine": "true"}))["listings"]
    assert {row["id"] for row in mine} == {first["id"], hidden["id"]}
    assert all(row["owner_id"] == provider.user["id"] for row in mine)
    updated = success(provider.client.put(f"{PREFIX}/listings/{first['id']}", json=community.listing_payload(
        title="Updated offer", price_from_kzt=275_000, active=False,
    )))
    assert updated["id"] == first["id"]
    assert updated["owner_id"] == first["owner_id"]
    assert updated["title"] == "Updated offer"
    assert updated["price_from_kzt"] == 275_000
    assert updated["active"] is False
    assert success(community.public.get(f"{PREFIX}/listings"))["listings"] == [second]


def test_organizer_cannot_publish_or_edit_and_provider_cannot_edit_another_listing(community, owner, provider):
    listing = community.listing(provider)
    other = community.account()
    payload = community.listing_payload(title="Hijacked listing")
    rejected(owner.client.post(f"{PREFIX}/listings", json=payload), 403)
    for account in (owner, other):
        rejected(account.client.put(f"{PREFIX}/listings/{listing['id']}", json=payload), 403)
    assert success(community.public.get(f"{PREFIX}/listings"))["listings"] == [listing]


@pytest.mark.parametrize("changes", [
    {"title": " \t"}, {"title": "x" * 121}, {"category": "unknown-category"},
    {"city": "unknown-city"}, {"price_from_kzt": 0}, {"price_from_kzt": -1},
    {"price_from_kzt": 100_000_001}, {"price_from_kzt": True},
    {"price_from_kzt": 12.5}, {"price_from_kzt": "100"},
    {"description": "x" * 19}, {"description": " " * 25}, {"description": "x" * 2001},
])
def test_invalid_listing_create_and_update_are_atomic(community, provider, changes):
    listing = community.listing(provider)
    payload = community.listing_payload(**changes)
    rejected(provider.client.post(f"{PREFIX}/listings", json=payload))
    rejected(provider.client.put(f"{PREFIX}/listings/{listing['id']}", json=payload))
    assert success(community.public.get(f"{PREFIX}/listings"))["listings"] == [listing]


def test_listing_validation_accepts_exact_numeric_and_text_boundaries(community, provider):
    for price, length in ((1, 20), (100_000_000, 2000)):
        listing = community.listing(provider, price_from_kzt=price, description="d" * length, title="t" * 120)
        assert listing["price_from_kzt"] == price
        assert listing["description"] == "d" * length


def test_ownership_and_publication_fields_cannot_be_supplied_by_the_caller(community, owner, provider, event):
    listing = community.listing(provider)
    forged_listing = community.listing_payload(owner_id=owner.user["id"], provider_name="Forged owner")
    rejected(provider.client.post(f"{PREFIX}/listings", json=forged_listing))
    rejected(provider.client.put(f"{PREFIX}/listings/{listing['id']}", json=forged_listing))
    rejected(provider.client.post(f"{PREFIX}/events", json=community.event_payload(
        owner_id=owner.user["id"], team_ready=True,
    )))
    rejected(owner.client.put(f"{PREFIX}/events/{event['id']}/plan", json={
        "version": event["version"], "slots": event["slots"], "team_ready": True,
    }))
    assert success(community.public.get(f"{PREFIX}/listings"))["listings"] == [listing]
    assert community.detail(owner, event) == event


@pytest.mark.parametrize("locale", ["ru", "en"])
def test_templates_create_localized_independent_editable_plans(community, owner, locale):
    templates_before = deepcopy(community.templates)
    services = {service["category"]: service for service in templates_before["services"]}
    template = next(item for item in templates_before["events"] if item["services"])
    event = community.event(owner, template_id=template["id"], locale=locale)
    assert event["owner_id"] == owner.user["id"]
    assert event["owner_name"] == owner.user["display_name"]
    assert event["version"] >= 1
    assert event["team_ready"] is False
    assert event["can_chat"] is True
    assert event["invitations"] == []
    assert event["messages"] == []
    UUID(event["id"])
    assert [item["category"] for item in event["slots"]] == template["services"]
    assert len({item["id"] for item in event["slots"]}) == len(event["slots"])
    for item in event["slots"]:
        assert item["checklist"] == [
            {"text": text, "done": False} for text in services[item["category"]]["checklist"][locale]
        ]
    edited_slots = deepcopy(event["slots"])
    edited_slots[0]["notes"] = "Своя программа / Our own schedule"
    edited_slots[0]["checklist"][0] = {"text": "Custom requirement", "done": True}
    edited_slots.append(slot(community.categories[-1]))
    edited = community.plan(owner, event, edited_slots)
    assert edited["slots"] == edited_slots
    assert edited["version"] > event["version"]
    assert community.detail(owner, edited)["slots"] == edited_slots
    assert success(community.public.get(f"{PREFIX}/templates")) == templates_before
    another = community.event(owner, template_id=template["id"], locale=locale)
    assert another["slots"][0]["checklist"] == event["slots"][0]["checklist"]
    assert {item["id"] for item in another["slots"]}.isdisjoint(item["id"] for item in event["slots"])


def test_every_template_is_usable_and_empty_plan_is_never_ready(community, owner):
    for template in community.templates["events"]:
        event = community.event(owner, template_id=template["id"])
        assert [item["category"] for item in event["slots"]] == template["services"]
        assert event["team_ready"] is False
    empty = community.plan(owner, event, [])
    assert empty["slots"] == []
    assert empty["team_ready"] is False


@pytest.mark.parametrize("changes", [
    {"title": " \n"}, {"title": "x" * 121}, {"city": "unknown-city"},
    {"template_id": "unknown-template"}, {"locale": "fr"},
    {"event_date": "2025-12-31"}, {"event_date": "2036-01-01"},
    {"event_date": "2027-02-30"}, {"event_date": "2027-05-20T00:00:00"},
])
def test_invalid_events_are_not_persisted(community, owner, changes):
    rejected(owner.client.post(f"{PREFIX}/events", json=community.event_payload(**changes)))
    assert success(owner.client.get(f"{PREFIX}/events"))["events"] == []


def test_community_event_dates_have_their_own_supported_range(community, owner):
    for day in ("2026-01-01", "2027-02-28", "2035-12-31"):
        assert community.event(owner, event_date=day)["event_date"] == day


def test_event_visibility_is_limited_to_owner_and_invitees(community, owner, provider, invited):
    outsider = community.account("organizer")
    for account in (owner, provider):
        visible = success(account.client.get(f"{PREFIX}/events"))["events"]
        assert [item["id"] for item in visible] == [invited["id"]]
    assert community.detail(provider, invited)["owner_id"] == owner.user["id"]
    assert success(outsider.client.get(f"{PREFIX}/events"))["events"] == []
    private_resource_denied(outsider.client.get(f"{PREFIX}/events/{invited['id']}"))


def test_only_owner_can_edit_plan_or_invite_and_only_recipient_can_respond(community, owner, provider, invited):
    outsider = community.account()
    event_id, slot_id = invited["id"], invited["slots"][0]["id"]
    for account in (provider, outsider):
        denial = rejected if account is provider else private_resource_denied
        kwargs = {"status": 403} if account is provider else {}
        denial(account.client.put(f"{PREFIX}/events/{event_id}/plan", json={
            "version": invited["version"], "slots": [],
        }), **kwargs)
        denial(account.client.post(f"{PREFIX}/events/{event_id}/invitations", json={
            "version": invited["version"], "slot_id": slot_id,
            "listing_id": invited["invitations"][0]["listing_id"],
        }), **kwargs)
    for account in (owner, outsider):
        response = account.client.post(f"{PREFIX}/events/{event_id}/invitations/{slot_id}/respond", json={
            "version": invited["version"], "decision": "accepted",
        })
        if account is owner:
            rejected(response, 403)
        else:
            private_resource_denied(response)
    assert community.detail(owner, invited) == invited


def test_every_slot_requires_its_provider_explicit_current_version_acceptance(community, owner, provider, event):
    second_provider = community.account()
    plan = [slot(community.categories[0]), slot(community.categories[1])]
    event = community.plan(owner, event, plan)
    first_listing = community.listing(provider, category=plan[0]["category"])
    second_listing = community.listing(second_provider, category=plan[1]["category"])
    original_version = event["version"]
    event = community.invite(owner, event, plan[0]["id"], first_listing)
    assert event["version"] == original_version, "An initial invitation does not revise existing offers"
    assert event["team_ready"] is False
    assert invitation_for(event, plan[0]["id"])["status"] == "invited"
    event = community.respond(provider, event, plan[0]["id"])
    assert event["team_ready"] is False, "An unfilled slot prevents readiness"
    event = community.invite(owner, event, plan[1]["id"], second_listing)
    assert event["version"] == original_version
    assert event["team_ready"] is False, "An invitation alone is not acceptance"
    assert invitation_for(event, plan[1]["id"])["status"] == "invited"
    rejected(provider.client.post(
        f"{PREFIX}/events/{event['id']}/invitations/{plan[1]['id']}/respond",
        json={"version": event["version"], "decision": "accepted"},
    ), 403)
    event = community.respond(second_provider, event, plan[1]["id"])
    assert event["team_ready"] is True
    assert len(event["invitations"]) == 2
    assert all(invite["status"] == "accepted" and invite["version"] == event["version"]
               for invite in event["invitations"])
    assert community.detail(owner, event)["team_ready"] is True


def test_provider_can_chat_before_every_other_provider_accepts(community, owner, provider, event):
    other = community.account()
    slots = [slot(community.categories[0]), slot(community.categories[1])]
    event = community.plan(owner, event, slots)
    for account, item in zip((provider, other), slots):
        listing = community.listing(account, category=item["category"])
        event = community.invite(owner, event, item["id"], listing)
    event = community.respond(provider, event, slots[0]["id"])
    assert event["team_ready"] is False
    assert community.detail(provider, event)["can_chat"] is True
    message = community.message(provider, event, "We can plan while the other invitation is pending")
    assert community.messages(provider, event) == [message]
    assert community.messages(owner, event) == [message]
    assert community.detail(other, event)["can_chat"] is False
    rejected(other.client.get(f"{PREFIX}/events/{event['id']}/messages"), 403)


def test_one_provider_may_explicitly_accept_multiple_service_roles(community, owner, provider, event):
    slots = [slot(category) for category in community.categories[:3]]
    event = community.plan(owner, event, slots)
    for item in slots:
        listing = community.listing(provider, category=item["category"])
        event = community.invite(owner, event, item["id"], listing)
    for index, item in enumerate(slots):
        event = community.respond(provider, event, item["id"])
        assert event["team_ready"] is (index == len(slots) - 1)
    assert {item["user_id"] for item in event["invitations"]} == {provider.user["id"]}
    assert len(event["invitations"]) == 3
    assert event["can_chat"] is True


def test_pending_invitee_and_outsider_cannot_read_or_send_chat(community, owner, provider, invited):
    outsider = community.account()
    message = community.message(owner, invited, "Private planning details")
    for account in (provider, outsider):
        read = account.client.get(f"{PREFIX}/events/{invited['id']}/messages")
        write = account.client.post(f"{PREFIX}/events/{invited['id']}/messages", json={
            "text": "Unapproved message",
        })
        for response in (read, write):
            if account is provider:
                rejected(response, 403)
            else:
                private_resource_denied(response)
    pending = community.detail(provider, invited)
    assert pending["can_chat"] is False
    assert pending["messages"] == []
    summaries = success(provider.client.get(f"{PREFIX}/events"))["events"]
    assert summaries[0]["can_chat"] is False
    assert summaries[0]["messages"] == []
    assert community.messages(owner, invited) == [message]


def test_accepted_chat_read_write_uses_server_side_identity(community, owner, provider, accepted):
    assert accepted["can_chat"] is True
    first = community.message(owner, accepted, "Добро пожаловать / Welcome")
    second = community.message(provider, accepted, "Schedule confirmed")
    for message, author in ((first, owner), (second, provider)):
        assert isinstance(message["id"], int)
        assert message["event_id"] == accepted["id"]
        assert message["user_id"] == author.user["id"]
        assert message["display_name"] == author.user["display_name"]
        assert message["created_at"]
    assert second["id"] > first["id"]
    for account in (owner, provider):
        assert community.messages(account, accepted) == [first, second]
        assert community.detail(account, accepted)["messages"] == [first, second]
    forged = provider.client.post(f"{PREFIX}/events/{accepted['id']}/messages", json={
        "text": "Forged authorship", "user_id": owner.user["id"], "display_name": "Owner",
    })
    rejected(forged)
    assert community.messages(owner, accepted) == [first, second]


def test_accepted_provider_can_decline_and_immediately_loses_chat_access(community, owner, provider, accepted):
    message = community.message(provider, accepted, "My earlier message")
    declined = community.respond(provider, accepted, accepted["slots"][0]["id"], "declined")
    assert invitation_for(declined, accepted["slots"][0]["id"])["status"] == "declined"
    assert declined["team_ready"] is False
    assert declined["can_chat"] is False
    assert declined["messages"] == []
    rejected(provider.client.get(f"{PREFIX}/events/{accepted['id']}/messages"), 403)
    rejected(provider.client.post(f"{PREFIX}/events/{accepted['id']}/messages", json={"text": "Late message"}), 403)
    assert community.detail(provider, accepted)["messages"] == []
    assert community.messages(owner, accepted) == [message]


def test_removed_provider_loses_event_visibility_chat_and_response_rights(community, owner, provider, accepted):
    message = community.message(provider, accepted, "Retained history")
    old_slot = accepted["slots"][0]["id"]
    updated = community.plan(owner, accepted, [])
    assert updated["invitations"] == []
    assert updated["team_ready"] is False
    assert success(provider.client.get(f"{PREFIX}/events"))["events"] == []
    for path in (f"/events/{accepted['id']}", f"/events/{accepted['id']}/messages"):
        private_resource_denied(provider.client.get(PREFIX + path))
    private_resource_denied(provider.client.post(f"{PREFIX}/events/{accepted['id']}/messages", json={"text": "Removed member"}))
    private_resource_denied(provider.client.post(f"{PREFIX}/events/{accepted['id']}/invitations/{old_slot}/respond", json={
        "version": updated["version"], "decision": "accepted",
    }))
    assert community.messages(owner, updated) == [message]


@pytest.mark.parametrize("change", ["notes", "checklist", "add-slot"])
def test_plan_changes_revoke_acceptance_and_chat_until_reconfirmation(community, owner, provider, accepted, change):
    community.message(owner, accepted, "Existing private history")
    changed = deepcopy(accepted["slots"])
    if change == "notes":
        changed[0]["notes"] = "The agreed scope has changed"
    elif change == "checklist":
        changed[0]["checklist"][0]["text"] = "A newly agreed requirement"
    else:
        changed.append(slot(community.categories[1]))
    updated = community.plan(owner, accepted, changed)
    assert updated["version"] > accepted["version"]
    assert updated["team_ready"] is False
    assert all(item["status"] == "invited" and item["version"] == updated["version"]
               for item in updated["invitations"])
    detail = community.detail(provider, updated)
    assert detail["can_chat"] is False
    assert detail["messages"] == []
    rejected(provider.client.get(f"{PREFIX}/events/{updated['id']}/messages"), 403)
    rejected(provider.client.post(f"{PREFIX}/events/{updated['id']}/messages", json={"text": "Old consent"}), 403)
    rejected(provider.client.post(
        f"{PREFIX}/events/{updated['id']}/invitations/{changed[0]['id']}/respond",
        json={"version": accepted["version"], "decision": "accepted"},
    ), 409)
    reconfirmed = community.respond(provider, updated, changed[0]["id"])
    assert reconfirmed["can_chat"] is True
    assert reconfirmed["team_ready"] is (change != "add-slot")


def test_plan_change_revokes_every_provider_acceptance(community, owner, provider, event):
    second = community.account()
    slots = [slot(community.categories[0]), slot(community.categories[1])]
    event = community.plan(owner, event, slots)
    for account, item in zip((provider, second), slots):
        listing = community.listing(account, category=item["category"])
        event = community.invite(owner, event, item["id"], listing)
        event = community.respond(account, event, item["id"])
    assert event["team_ready"] is True
    slots[0]["notes"] = "One change requires everyone's reconfirmation"
    updated = community.plan(owner, event, slots)
    assert [item["status"] for item in updated["invitations"]] == ["invited", "invited"]
    for account in (provider, second):
        assert community.detail(account, updated)["can_chat"] is False
    updated = community.respond(provider, updated, slots[0]["id"])
    assert updated["team_ready"] is False
    updated = community.respond(second, updated, slots[1]["id"])
    assert updated["team_ready"] is True


def test_checkbox_progress_bumps_version_but_preserves_acceptance_and_chat(community, owner, provider, accepted):
    message = community.message(provider, accepted, "Agreed scope stays the same")
    changed = deepcopy(accepted["slots"])
    changed[0]["checklist"][0]["done"] = True
    updated = community.plan(owner, accepted, changed)
    assert updated["version"] > accepted["version"]
    assert updated["slots"] == changed
    assert updated["team_ready"] is True
    assert all(item["status"] == "accepted" and item["version"] == updated["version"]
               for item in updated["invitations"])
    provider_detail = community.detail(provider, updated)
    assert provider_detail["can_chat"] is True
    assert provider_detail["messages"] == [message]
    assert community.messages(provider, updated) == [message]
    rejected(owner.client.put(f"{PREFIX}/events/{updated['id']}/plan", json={
        "version": accepted["version"], "slots": accepted["slots"],
    }), 409)


def test_scope_change_preserves_a_declined_invitation(community, owner, provider, invited):
    declined = community.respond(provider, invited, invited["slots"][0]["id"], "declined")
    slots = deepcopy(declined["slots"])
    slots[0]["notes"] = "Changed scope does not erase a refusal"
    updated = community.plan(owner, declined, slots)
    invitation = invitation_for(updated, slots[0]["id"])
    assert invitation["status"] == "declined"
    assert invitation["version"] == updated["version"]
    assert updated["version"] > declined["version"]
    assert updated["team_ready"] is False
    assert community.detail(provider, updated)["can_chat"] is False
    rejected(provider.client.get(f"{PREFIX}/events/{updated['id']}/messages"), 403)


def test_changing_slot_category_removes_the_incompatible_invitation(community, owner, provider, accepted):
    slots = deepcopy(accepted["slots"])
    slots[0]["category"] = community.categories[1]
    updated = community.plan(owner, accepted, slots)
    assert updated["version"] > accepted["version"]
    assert updated["invitations"] == []
    assert updated["team_ready"] is False
    private_resource_denied(provider.client.get(f"{PREFIX}/events/{updated['id']}"))
    private_resource_denied(provider.client.get(f"{PREFIX}/events/{updated['id']}/messages"))


def test_replacing_an_invitation_revokes_the_previous_providers_access(community, owner, provider, accepted):
    replacement = community.account()
    listing = community.listing(replacement)
    slot_id = accepted["slots"][0]["id"]
    updated = community.invite(owner, accepted, slot_id, listing)
    assert updated["version"] == accepted["version"] + 1
    assert updated["team_ready"] is False
    assert len(updated["invitations"]) == 1
    assert invitation_for(updated, slot_id)["user_id"] == replacement.user["id"]
    assert invitation_for(updated, slot_id)["status"] == "invited"
    assert invitation_for(updated, slot_id)["version"] == updated["version"]
    assert community.detail(replacement, updated)["can_chat"] is False
    assert success(provider.client.get(f"{PREFIX}/events"))["events"] == []
    private_resource_denied(provider.client.get(f"{PREFIX}/events/{updated['id']}/messages"))
    private_resource_denied(provider.client.post(f"{PREFIX}/events/{updated['id']}/messages", json={"text": "Old invite"}))
    assert community.respond(replacement, updated, slot_id)["team_ready"] is True


@pytest.mark.parametrize("initial_status", ["invited", "accepted", "declined"])
def test_replacing_offer_for_same_provider_rejects_old_decisions_and_plan(community, owner, provider, invited, initial_status):
    slot_id = invited["slots"][0]["id"]
    if initial_status != "invited":
        invited = community.respond(provider, invited, slot_id, initial_status)
    original_listing_id = invitation_for(invited, slot_id)["listing_id"]
    replacement = community.listing(provider, title="Replacement service offer", price_from_kzt=350_000,
                                    description="The replacement offer includes a different scope of services.")
    updated = community.invite(owner, invited, slot_id, replacement)
    assert updated["version"] == invited["version"] + 1
    assignment = invitation_for(community.detail(provider, updated), slot_id)
    assert assignment["listing_id"] == replacement["id"]
    assert assignment["listing_title"] == replacement["title"]
    assert assignment["price_from_kzt"] == replacement["price_from_kzt"]
    assert assignment["listing_description"] == replacement["description"]
    assert assignment["user_id"] == provider.user["id"]
    assert assignment["status"] == "invited"
    assert assignment["version"] == updated["version"]
    assert updated["team_ready"] is False
    assert community.detail(provider, updated)["can_chat"] is False
    base = f"{PREFIX}/events/{updated['id']}"
    for decision in ("accepted", "declined"):
        rejected(provider.client.post(base + f"/invitations/{slot_id}/respond", json={
            "version": invited["version"], "decision": decision,
        }), 409)
    rejected(owner.client.put(base + "/plan", json={"version": invited["version"], "slots": []}), 409)
    rejected(owner.client.post(base + "/invitations", json={
        "version": invited["version"], "slot_id": slot_id, "listing_id": original_listing_id,
    }), 409)
    assert community.detail(owner, updated) == updated
    confirmed = community.respond(provider, updated, slot_id)
    assert invitation_for(confirmed, slot_id)["listing_id"] == replacement["id"]
    assert confirmed["team_ready"] is True
    assert confirmed["can_chat"] is True


def test_replacing_one_invitation_advances_all_versions_and_preserves_other_statuses(community, owner, provider, event):
    other = community.account()
    original = community.listing(provider)
    replacement = community.listing(provider, title="New offer for the same service")
    unrelated = community.listing(other)
    slots = [slot(community.categories[0]) for _ in range(4)]
    event = community.plan(owner, event, slots)
    for item, account, listing, status in zip(
        slots, (provider, other, other, other),
        (original, unrelated, unrelated, unrelated),
        ("accepted", "accepted", "invited", "declined"),
    ):
        event = community.invite(owner, event, item["id"], listing)
        if status != "invited":
            event = community.respond(account, event, item["id"], status)
    updated = community.invite(owner, event, slots[0]["id"], replacement)
    assert updated["version"] == event["version"] + 1
    assert updated["slots"] == event["slots"]
    for item, status in zip(slots, ("invited", "accepted", "invited", "declined")):
        invitation = invitation_for(updated, item["id"])
        assert invitation["status"] == status
        assert invitation["version"] == updated["version"]
    assert community.detail(provider, updated)["can_chat"] is False
    assert community.detail(other, updated)["can_chat"] is True
    message = community.message(other, updated, "My unchanged agreement still permits planning")
    assert community.messages(owner, updated) == [message]
    rejected(other.client.post(
        f"{PREFIX}/events/{updated['id']}/invitations/{slots[1]['id']}/respond",
        json={"version": event["version"], "decision": "declined"},
    ), 409)
    assert invitation_for(community.detail(owner, updated), slots[1]["id"])["status"] == "accepted"


@pytest.mark.parametrize("initial_status", ["invited", "accepted", "declined"])
def test_linked_listing_price_edit_rejects_stale_decisions_and_plan(community, owner, provider, invited, initial_status):
    slot_id = invited["slots"][0]["id"]
    if initial_status != "invited":
        invited = community.respond(provider, invited, slot_id, initial_status)
    listing_id = invitation_for(invited, slot_id)["listing_id"]
    success(provider.client.put(f"{PREFIX}/listings/{listing_id}", json=community.listing_payload(
        price_from_kzt=950_000,
    )))
    updated = community.detail(owner, invited)
    assert updated["version"] == invited["version"] + 1
    assert updated["slots"] == invited["slots"]
    invitation = invitation_for(community.detail(provider, updated), slot_id)
    assert invitation["price_from_kzt"] == 950_000
    assert invitation["listing_description"] == community.listing_payload()["description"]
    assert invitation["version"] == updated["version"]
    assert invitation["status"] == ("declined" if initial_status == "declined" else "invited")
    assert updated["team_ready"] is False
    assert community.detail(provider, updated)["can_chat"] is False
    base = f"{PREFIX}/events/{updated['id']}"
    for decision in ("accepted", "declined"):
        rejected(provider.client.post(base + f"/invitations/{slot_id}/respond", json={
            "version": invited["version"], "decision": decision,
        }), 409)
    rejected(owner.client.put(base + "/plan", json={"version": invited["version"], "slots": []}), 409)
    rejected(owner.client.post(base + "/invitations", json={
        "version": invited["version"], "slot_id": slot_id, "listing_id": listing_id,
    }), 409)
    assert community.detail(owner, updated) == updated
    confirmed = community.respond(provider, updated, slot_id)
    assert confirmed["team_ready"] is True
    assert confirmed["can_chat"] is True


@pytest.mark.parametrize("field", ["title", "description", "category", "city", "active"])
def test_all_linked_listing_field_changes_revise_consent(community, owner, provider, accepted, field):
    changes = {
        "title": "A revised service title",
        "description": "A revised description with materially different service terms.",
        "category": community.categories[1],
        "city": "Астана",
        "active": False,
    }
    listing_id = accepted["invitations"][0]["listing_id"]
    success(provider.client.put(f"{PREFIX}/listings/{listing_id}", json=community.listing_payload(
        **{field: changes[field]},
    )))
    updated = community.detail(owner, accepted)
    assert updated["version"] == accepted["version"] + 1
    expected_description = changes["description"] if field == "description" else community.listing_payload()["description"]
    assert updated["invitations"][0]["listing_description"] == expected_description
    assert updated["invitations"][0]["status"] == "invited"
    assert updated["invitations"][0]["version"] == updated["version"]
    assert updated["team_ready"] is False
    assert community.detail(provider, updated)["can_chat"] is False
    rejected(provider.client.post(
        f"{PREFIX}/events/{updated['id']}/invitations/{updated['slots'][0]['id']}/respond",
        json={"version": accepted["version"], "decision": "accepted"},
    ), 409)


def test_listing_edit_revises_each_linked_event_once_and_preserves_unrelated_consent(community, owner, provider, event):
    other = community.account()
    linked = community.listing(provider)
    unrelated = community.listing(other)
    slots = [slot(community.categories[0]) for _ in range(6)]
    event = community.plan(owner, event, slots)
    # Multiple links in one event must produce one revision, across all statuses.
    for item, account, listing, status in zip(
        slots, (provider,) * 3 + (other,) * 3,
        (linked,) * 3 + (unrelated,) * 3,
        ("accepted", "invited", "declined") * 2,
    ):
        event = community.invite(owner, event, item["id"], listing)
        if status != "invited":
            event = community.respond(account, event, item["id"], status)
    # A different event with no accepted invitations must still be revised.
    pending_event = community.plan(owner, community.event(owner), [slot(linked["category"])])
    pending_event = community.invite(owner, pending_event, pending_event["slots"][0]["id"], linked)
    unaffected_event = community.plan(owner, community.event(owner), [slot(unrelated["category"])])
    unaffected_event = community.invite(owner, unaffected_event, unaffected_event["slots"][0]["id"], unrelated)
    unaffected_event = community.respond(other, unaffected_event, unaffected_event["slots"][0]["id"])
    unaffected_event = community.detail(owner, unaffected_event)
    success(provider.client.put(f"{PREFIX}/listings/{linked['id']}", json=community.listing_payload(
        price_from_kzt=275_000,
    )))
    updated = community.detail(owner, event)
    assert updated["version"] == event["version"] + 1
    assert updated["slots"] == event["slots"]
    expected_statuses = ("invited", "invited", "declined", "accepted", "invited", "declined")
    for item, status in zip(slots, expected_statuses):
        invitation = invitation_for(updated, item["id"])
        assert invitation["status"] == status
        assert invitation["version"] == updated["version"]
    assert community.detail(provider, updated)["can_chat"] is False
    assert community.detail(other, updated)["can_chat"] is True
    message = community.message(other, updated, "An unrelated provider keeps their accepted role")
    assert community.messages(owner, updated) == [message]
    rejected(other.client.post(
        f"{PREFIX}/events/{updated['id']}/invitations/{slots[3]['id']}/respond",
        json={"version": event["version"], "decision": "declined"},
    ), 409)
    pending_updated = community.detail(owner, pending_event)
    assert pending_updated["version"] == pending_event["version"] + 1
    assert pending_updated["invitations"][0]["status"] == "invited"
    assert pending_updated["invitations"][0]["version"] == pending_updated["version"]
    assert community.detail(owner, unaffected_event) == unaffected_event


def test_unchanged_invalid_unauthorized_and_unlinked_listing_edits_do_not_revise_events(community, owner, provider, accepted):
    listing_id = accepted["invitations"][0]["listing_id"]
    before = community.detail(owner, accepted)
    success(provider.client.put(f"{PREFIX}/listings/{listing_id}", json=community.listing_payload()))
    assert community.detail(owner, accepted) == before
    rejected(provider.client.put(f"{PREFIX}/listings/{listing_id}", json=community.listing_payload(
        price_from_kzt=0,
    )), 422)
    rejected(owner.client.put(f"{PREFIX}/listings/{listing_id}", json=community.listing_payload(
        price_from_kzt=275_000,
    )), 403)
    unlinked = community.listing(provider)
    success(provider.client.put(f"{PREFIX}/listings/{unlinked['id']}", json=community.listing_payload(
        price_from_kzt=275_000,
    )))
    assert community.detail(owner, accepted) == before
    assert community.detail(provider, accepted)["can_chat"] is True


def test_stale_plan_invitation_and_decision_versions_conflict_without_writes(community, owner, provider, invited):
    old_version = invited["version"]
    changed = deepcopy(invited["slots"])
    changed[0]["notes"] = "Latest version"
    latest = community.plan(owner, invited, changed)
    base = f"{PREFIX}/events/{invited['id']}"
    rejected(owner.client.put(base + "/plan", json={"version": old_version, "slots": []}), 409)
    rejected(owner.client.post(base + "/invitations", json={
        "version": old_version, "slot_id": changed[0]["id"],
        "listing_id": invited["invitations"][0]["listing_id"],
    }), 409)
    for decision in ("accepted", "declined"):
        rejected(provider.client.post(base + f"/invitations/{changed[0]['id']}/respond", json={
            "version": old_version, "decision": decision,
        }), 409)
    assert community.detail(owner, latest) == latest


@pytest.mark.parametrize("mismatch", ["city", "category", "inactive"])
def test_invites_require_active_listing_in_same_city_and_category(community, owner, provider, event, mismatch):
    item = event["slots"][0]
    changes = {"category": item["category"]}
    if mismatch == "city":
        changes["city"] = "Астана"
    elif mismatch == "category":
        changes["category"] = next(value for value in community.categories if value != item["category"])
    else:
        changes["active"] = False
    listing = community.listing(provider, **changes)
    rejected(owner.client.post(f"{PREFIX}/events/{event['id']}/invitations", json={
        "version": event["version"], "slot_id": item["id"], "listing_id": listing["id"],
    }))
    assert community.detail(owner, event) == event
    assert success(provider.client.get(f"{PREFIX}/events"))["events"] == []


@pytest.mark.parametrize("change", ["city", "category", "inactive"])
def test_listing_suitability_is_rechecked_when_provider_accepts(community, owner, provider, invited, change):
    changes = {"city": "Астана"} if change == "city" else (
        {"category": community.categories[1]} if change == "category" else {"active": False}
    )
    listing_id = invited["invitations"][0]["listing_id"]
    success(provider.client.put(f"{PREFIX}/listings/{listing_id}", json=community.listing_payload(**changes)))
    updated = community.detail(owner, invited)
    assert updated["version"] == invited["version"] + 1
    rejected(provider.client.post(
        f"{PREFIX}/events/{invited['id']}/invitations/{invited['slots'][0]['id']}/respond",
        json={"version": updated["version"], "decision": "accepted"},
    ), 422)
    detail = community.detail(owner, invited)
    assert detail == updated
    assert detail["team_ready"] is False
    assert detail["invitations"][0]["status"] == "invited"
    assert community.detail(provider, invited)["can_chat"] is False


def test_csv_profile_and_unknown_ids_cannot_be_invited(community, owner, provider, event):
    item = event["slots"][0]
    listing = community.listing(provider, category=item["category"])
    for slot_id, listing_id in ((item["id"], "HK-39372"), (item["id"], uuid4().hex), (uuid4().hex, listing["id"])):
        rejected(owner.client.post(f"{PREFIX}/events/{event['id']}/invitations", json={
            "version": event["version"], "slot_id": slot_id, "listing_id": listing_id,
        }))
    assert community.detail(owner, event) == event


def test_slot_ids_from_another_event_cannot_target_this_event(community, owner, provider, invited):
    another = community.event(owner)
    foreign_slot = another["slots"][0]["id"]
    rejected(owner.client.post(f"{PREFIX}/events/{invited['id']}/invitations", json={
        "version": invited["version"], "slot_id": foreign_slot,
        "listing_id": invited["invitations"][0]["listing_id"],
    }))
    response = provider.client.post(f"{PREFIX}/events/{invited['id']}/invitations/{foreign_slot}/respond", json={
        "version": invited["version"], "decision": "accepted",
    })
    assert response.status_code in (403, 404, 422), response.text
    rejected(response, response.status_code)
    assert community.detail(owner, invited) == invited
    assert community.detail(owner, another) == another


def test_unknown_and_sql_tampered_resource_ids_do_not_expose_or_modify_data(community, owner, provider, accepted):
    original = community.detail(owner, accepted)
    for identifier in (uuid4().hex, "x%27%20OR%201%3D1--"):
        for method, path, body in (
            ("GET", f"/events/{identifier}", None),
            ("PUT", f"/events/{identifier}/plan", {"version": accepted["version"], "slots": []}),
            ("GET", f"/events/{identifier}/messages", None),
            ("POST", f"/events/{identifier}/messages", {"text": "Injected target"}),
            ("PUT", f"/listings/{identifier}", community.listing_payload()),
        ):
            response = provider.client.request(method, PREFIX + path, json=body)
            assert response.status_code in (403, 404, 422), response.text
            rejected(response, response.status_code)
    assert community.detail(owner, accepted) == original


@pytest.mark.parametrize("invalid", ["duplicate-id", "too-many-slots", "too-many-tasks", "task-too-long", "blank-task", "notes-too-long", "unknown-category"])
def test_invalid_plan_changes_are_atomic_and_preserve_acceptance(community, owner, accepted, invalid):
    slots = deepcopy(accepted["slots"])
    if invalid == "duplicate-id":
        slots.append(deepcopy(slots[0]))
    elif invalid == "too-many-slots":
        slots = [slot(community.categories[0]) for _ in range(31)]
    elif invalid == "too-many-tasks":
        slots[0]["checklist"] = [{"text": "Task", "done": False} for _ in range(16)]
    elif invalid == "task-too-long":
        slots[0]["checklist"][0]["text"] = "x" * 121
    elif invalid == "blank-task":
        slots[0]["checklist"][0]["text"] = " \n\t"
    elif invalid == "notes-too-long":
        slots[0]["notes"] = "x" * 1001
    else:
        slots[0]["category"] = "unknown-category"
    rejected(owner.client.put(f"{PREFIX}/events/{accepted['id']}/plan", json={
        "version": accepted["version"], "slots": slots,
    }))
    unchanged = community.detail(owner, accepted)
    assert unchanged["slots"] == accepted["slots"]
    assert unchanged["version"] == accepted["version"]
    assert unchanged["invitations"] == accepted["invitations"]
    assert unchanged["team_ready"] is True


def test_plan_size_boundaries_are_accepted(community, owner, event):
    slots = [slot(community.categories[0]) for _ in range(30)]
    slots[0]["notes"] = "n" * 1000
    slots[0]["checklist"] = [{"text": "t" * 120, "done": False} for _ in range(15)]
    assert community.plan(owner, event, slots)["slots"] == slots


def test_versions_and_decisions_cannot_be_coerced_or_forged(community, owner, provider, invited):
    base = f"{PREFIX}/events/{invited['id']}"
    for version in (0, -1, True, str(invited["version"]), 1.5):
        rejected(owner.client.put(base + "/plan", json={"version": version, "slots": invited["slots"]}))
        rejected(provider.client.post(base + f"/invitations/{invited['slots'][0]['id']}/respond", json={
            "version": version, "decision": "accepted",
        }))
    rejected(provider.client.post(base + f"/invitations/{invited['slots'][0]['id']}/respond", json={
        "version": invited["version"], "decision": "booked",
    }))
    assert community.detail(owner, invited) == invited


def test_blank_and_oversized_messages_are_rejected_without_writes(community, owner, provider, accepted, clock):
    for text in ("", " ", "\t\r\n", "\u2003\u00a0", "x" * 2001):
        rejected(provider.client.post(f"{PREFIX}/events/{accepted['id']}/messages", json={"text": text}))
    assert community.messages(owner, accepted) == []
    first = community.message(provider, accepted, "x")
    clock.advance(1)
    last = community.message(provider, accepted, "я" * 2000)
    assert first["text"] == "x"
    assert last["text"] == "я" * 2000
    assert community.messages(owner, accepted) == [first, last]


def test_event_detail_includes_only_the_latest_hundred_messages(community, owner, provider, accepted, clock):
    sent = []
    for index in range(103):
        sent.append(community.message(owner, accepted, f"Planning message {index:03d}"))
        clock.advance(1)
    for account in (owner, provider):
        assert community.detail(account, accepted)["messages"] == sent[-100:]


def test_message_rate_limit_is_per_user_and_event_and_recovers_at_boundary(community, owner, provider, accepted, clock):
    first = community.message(provider, accepted, "First message")
    rejected(provider.client.post(f"{PREFIX}/events/{accepted['id']}/messages", json={"text": "Too fast"}), 429)
    owner_message = community.message(owner, accepted, "Another author can reply immediately")
    another_event = community.event(provider)
    elsewhere = community.message(provider, another_event, "Same author in another event")
    assert community.messages(provider, another_event) == [elsewhere]
    clock.advance(0.499)
    rejected(provider.client.post(f"{PREFIX}/events/{accepted['id']}/messages", json={"text": "Still too fast"}), 429)
    assert community.messages(owner, accepted) == [first, owner_message]
    clock.advance(0.001)
    last = community.message(provider, accepted, "Boundary is allowed")
    assert community.messages(owner, accepted) == [first, owner_message, last]


def test_listing_filter_sql_fragments_are_bound_as_data(community, provider):
    listing = community.listing(provider)
    community.listing(provider, active=False)
    for field in ("city", "category"):
        result = success(community.public.get(f"{PREFIX}/listings", params={field: "' OR 1=1 --"}))
        assert result["listings"] == []
    assert success(community.public.get(f"{PREFIX}/listings"))["listings"] == [listing]


def test_sql_injection_text_is_stored_as_plain_data(community, owner, provider, accepted):
    attack = "Robert'); DROP TABLE users; --"
    listing = community.listing(provider, title=attack, description=attack)
    assert listing["title"] == attack
    assert listing["description"] == attack
    created = community.event(owner, title=attack)
    assert created["title"] == attack
    slots = deepcopy(accepted["slots"])
    slots[0]["notes"] = attack
    slots[0]["checklist"][0]["text"] = attack
    event = community.plan(owner, accepted, slots)
    event = community.respond(provider, event, slots[0]["id"])
    message = community.message(provider, event, attack)
    assert message["text"] == attack
    assert community.messages(owner, event) == [message]
    assert community.detail(owner, event)["slots"] == slots
    for account in (owner, provider):
        assert success(account.client.get(f"{PREFIX}/session"))["user"] == account.user
    assert listing in success(community.public.get(f"{PREFIX}/listings"))["listings"]
    with sqlite3.connect(community.database_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 2


def test_accounts_sessions_listings_plans_acceptances_and_chat_persist_across_factories(community, community_factory, owner, provider, accepted):
    message = community.message(provider, accepted, "Durable conversation")
    original = community.detail(owner, accepted)
    listings = success(community.public.get(f"{PREFIX}/listings"))
    original_path = community.database_path
    owner_cookies = dict(owner.client.cookies)
    community.close()
    restarted = community_factory(database_path=original_path)
    assert success(restarted.public.get(f"{PREFIX}/session"))["user"] is None
    assert success(restarted.public.get(f"{PREFIX}/listings")) == listings
    owner_client = restarted.client()
    owner_client.cookies.update(owner_cookies)
    assert success(owner_client.get(f"{PREFIX}/session"))["user"] == owner.user
    assert success(owner_client.get(f"{PREFIX}/events/{accepted['id']}")) == original
    provider_client = restarted.client()
    assert success(provider_client.post(f"{PREFIX}/login", json={
        "username": provider.user["username"], "password": PASSWORD,
    }))["user"] == provider.user
    detail = success(provider_client.get(f"{PREFIX}/events/{accepted['id']}"))
    assert detail["team_ready"] is True
    assert detail["can_chat"] is True
    assert detail["messages"] == [message]
    assert detail["invitations"] == original["invitations"]


def test_separate_databases_do_not_share_accounts_or_listings(community, community_factory, tmp_path, provider):
    community.listing(provider)
    isolated = community_factory(database_path=tmp_path / "isolated.sqlite3")
    assert success(isolated.public.get(f"{PREFIX}/listings"))["listings"] == []
    rejected(isolated.public.post(f"{PREFIX}/login", json={
        "username": provider.user["username"], "password": PASSWORD,
    }), 401)


def test_community_operations_leave_the_supplied_csv_catalog_unchanged(community, owner, provider):
    before = CATALOG_PATH.read_bytes()
    assert sha256(before).hexdigest() == CATALOG_SHA256
    listing = community.listing(provider)
    event = community.event(owner)
    event = community.plan(owner, event, [slot(listing["category"])])
    event = community.invite(owner, event, event["slots"][0]["id"], listing)
    event = community.respond(provider, event, event["slots"][0]["id"])
    community.message(provider, event, "Community-only coordination")
    success(provider.client.put(f"{PREFIX}/listings/{listing['id']}", json=community.listing_payload(active=False)))
    after = CATALOG_PATH.read_bytes()
    assert after == before
    assert sha256(after).hexdigest() == CATALOG_SHA256
    # Read-only catalog loading proves community publication did not add a row.
    from backend.app.catalog import load_catalog

    catalog = load_catalog(CATALOG_PATH)
    assert len(catalog) == 66
    assert listing["id"] not in {profile.id for profile in catalog}
