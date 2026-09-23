"""Authenticated collaboration extension; the original recommendation API stays public."""

from datetime import datetime, timezone
import json
from pathlib import Path
import secrets
import sqlite3
import time
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .models import Credentials, DecisionInput, EventInput, InvitationInput, ListingInput, MessageInput, PlanInput, Registration
from .store import Store, password_hash, password_matches, public_user, session_hash
from .security import BodyLimitMiddleware
from .templates import CITIES, EVENT_TEMPLATES, SERVICES

COOKIE = "tandau_session"
COOKIE_PATH = "/api/community"
SESSION_SECONDS = 7 * 24 * 60 * 60


def fail(status: int, code: str):
    raise HTTPException(status, detail={"code": code})


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def current_user(db, request: Request, *, required: bool = True):
    token = request.cookies.get(COOKIE, "")
    row = db.execute(
        "SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?",
        (session_hash(token), time.time()),
    ).fetchone() if token else None
    if row is None and required:
        fail(401, "sign_in_required")
    return row


def issue_session(db, request: Request, response: Response, user_id: str):
    # Rotate the current browser's session; no credentials are exposed to JavaScript.
    previous = request.cookies.get(COOKIE)
    if previous:
        db.execute("DELETE FROM sessions WHERE token_hash=?", (session_hash(previous),))
    db.execute("DELETE FROM sessions WHERE expires<=?", (time.time(),))
    token = secrets.token_urlsafe(32)
    db.execute("INSERT INTO sessions VALUES (?,?,?)", (session_hash(token), user_id, time.time() + SESSION_SECONDS))
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True,
                        secure=request.url.scheme == "https", samesite="strict", path=COOKIE_PATH)


def listing_record(db, listing_id: str):
    row = db.execute("SELECT l.*,u.display_name AS provider_name FROM listings l JOIN users u ON u.id=l.owner_id WHERE l.id=?", (listing_id,)).fetchone()
    if row is None:
        fail(404, "listing_not_found")
    return dict(row) | {"active": bool(row["active"])}


def event_record(db, event_id: str, user):
    event = db.execute("SELECT e.*,u.display_name AS owner_name FROM events e JOIN users u ON u.id=e.owner_id WHERE e.id=?", (event_id,)).fetchone()
    if event is None:
        fail(404, "event_not_found")
    member = db.execute("SELECT 1 FROM invitations WHERE event_id=? AND user_id=?", (event_id, user["id"])).fetchone()
    if event["owner_id"] != user["id"] and member is None:
        fail(404, "event_not_found")  # Do not reveal private event existence to outsiders.
    return event


def require_owner(event, user):
    if event["owner_id"] != user["id"]:
        fail(403, "owner_required")


def check_version(event, version: int):
    if event["version"] != version:
        fail(409, "event_changed")


def advance_version(db, event_id: str):
    # The revision covers both plan text and offered services. A stale tab must
    # never accept a replacement listing or changed price it has not reviewed.
    db.execute("UPDATE events SET version=version+1 WHERE id=?", (event_id,))
    db.execute("UPDATE invitations SET version=version+1 WHERE event_id=?", (event_id,))


def messages(db, event_id: str):
    rows = db.execute("SELECT m.*,u.display_name FROM messages m JOIN users u ON u.id=m.user_id WHERE event_id=? ORDER BY m.id DESC LIMIT 100", (event_id,)).fetchall()
    return [dict(row) for row in reversed(rows)]


def event_detail(db, event, user, *, include_messages: bool = True):
    slots = json.loads(event["plan"])
    invites = [dict(row) for row in db.execute(
        "SELECT i.*,u.display_name AS provider_name,l.title AS listing_title,l.price_from_kzt,l.description AS listing_description FROM invitations i JOIN users u ON u.id=i.user_id JOIN listings l ON l.id=i.listing_id WHERE i.event_id=? ORDER BY i.slot_id",
        (event["id"],),
    )]
    accepted = {item["slot_id"] for item in invites if item["status"] == "accepted" and item["version"] == event["version"]}
    can_chat = event["owner_id"] == user["id"] or any(item["user_id"] == user["id"] and item["slot_id"] in accepted for item in invites)
    result = {key: event[key] for key in ("id", "owner_id", "owner_name", "title", "city", "event_date", "version", "created_at")}
    return result | {"slots": slots, "invitations": invites,
                     "team_ready": bool(slots) and all(slot["id"] in accepted for slot in slots),
                     "can_chat": can_chat, "messages": messages(db, event["id"]) if can_chat and include_messages else []}


def scope_of(slots):
    # Completing a checklist task changes progress, not the terms providers accepted.
    return [{"id": slot["id"], "category": slot["category"], "notes": slot["notes"],
             "checklist": [item["text"] for item in slot["checklist"]]} for slot in slots]


def create_community_app(database_path: Path, allowed_origins: tuple[str, ...] = ()) -> FastAPI:
    app = FastAPI(title="Tandau Community — optional collaboration", version="1.0.0")
    store = Store(database_path)
    app.state.store = store

    @app.middleware("http")
    async def private_boundaries(request: Request, call_next):
        # SameSite cookies + JSON-only writes + explicit Origin checks protect browser mutations.
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            own_origin = f"{request.url.scheme}://{request.url.netloc}"
            if origin and origin not in {*allowed_origins, own_origin}:
                return JSONResponse({"detail": {"code": "origin_rejected"}}, status_code=403)
            if request.headers.get("content-type", "").split(";")[0].lower() != "application/json":
                return JSONResponse({"detail": {"code": "json_required"}}, status_code=415)
        response = await call_next(request)
        # Avoid shared/private browser caches retaining account details or event messages.
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(RequestValidationError)
    async def input_error(request, error):
        # Never echo submitted passwords, user bodies or non-JSON-safe validator contexts.
        fields = [{"loc": item["loc"], "msg": item["msg"], "type": item["type"]} for item in error.errors()]
        return JSONResponse({"detail": {"code": "invalid_input", "fields": fields}}, status_code=422)

    @app.exception_handler(sqlite3.OperationalError)
    async def storage_error(request, error):
        return JSONResponse({"detail": {"code": "storage_unavailable"}}, status_code=503)

    def throttle(request):
        # Bound online guessing/signup churn locally; a deployed service also needs edge limits.
        client = session_hash(request.client.host if request.client else "unknown")
        with store.transaction() as db:
            db.execute("DELETE FROM auth_attempts WHERE occurred<?", (time.time() - 300,))
            attempts = db.execute("SELECT COUNT(*) FROM auth_attempts WHERE client=?", (client,)).fetchone()[0]
            if attempts >= 30:
                fail(429, "too_many_attempts")
            db.execute("INSERT INTO auth_attempts VALUES (?,?)", (client, time.time()))

    @app.get("/templates")
    def templates():
        return {"services": SERVICES, "events": EVENT_TEMPLATES, "cities": CITIES}

    @app.get("/session")
    def session(request: Request):
        with store.transaction() as db:
            user = current_user(db, request, required=False)
            return {"user": public_user(user) if user else None}

    @app.post("/register", status_code=201)
    def register(body: Registration, request: Request, response: Response):
        throttle(request)
        hashed = password_hash(body.password)
        with store.transaction() as db:
            user_id = uuid4().hex
            try:
                db.execute("INSERT INTO users VALUES (?,?,?,?,?)", (user_id, body.username, body.display_name, body.role, hashed))
            except sqlite3.IntegrityError:
                fail(409, "username_taken")
            issue_session(db, request, response, user_id)
            return {"user": public_user(db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())}

    @app.post("/login")
    def login(body: Credentials, request: Request, response: Response):
        throttle(request)
        with store.transaction() as db:
            user = db.execute("SELECT * FROM users WHERE username=?", (body.username,)).fetchone()
            if user is None:
                password_hash(body.password)  # Comparable work for unknown accounts; one generic error.
                fail(401, "invalid_credentials")
            if not password_matches(body.password, user["password_hash"]):
                fail(401, "invalid_credentials")
            issue_session(db, request, response, user["id"])
            return {"user": public_user(user)}

    @app.post("/logout")
    def logout(request: Request, response: Response):
        with store.transaction() as db:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (session_hash(request.cookies.get(COOKIE, "")),))
        response.delete_cookie(COOKIE, path=COOKIE_PATH, httponly=True, samesite="strict", secure=request.url.scheme == "https")
        return {"ok": True}

    @app.get("/listings")
    def listings(request: Request, city: str = Query("", max_length=80), category: str = Query("", max_length=120), mine: bool = False):
        with store.transaction() as db:
            clauses, values = ["l.active=1"], []
            if mine:
                clauses, values = ["l.owner_id=?"], [current_user(db, request)["id"]]
            for field, value in (("city", city), ("category", category)):
                if value:
                    clauses.append(f"l.{field}=?")  # Field names are fixed above, never caller SQL.
                    values.append(value)
            rows = db.execute("SELECT l.*,u.display_name AS provider_name FROM listings l JOIN users u ON u.id=l.owner_id WHERE " + " AND ".join(clauses) + " ORDER BY l.created_at DESC,l.id LIMIT 200", values)
            return {"listings": [dict(row) | {"active": bool(row["active"])} for row in rows]}

    @app.post("/listings", status_code=201)
    def publish(body: ListingInput, request: Request):
        with store.transaction() as db:
            user = current_user(db, request)
            if user["role"] != "provider":
                fail(403, "provider_required")
            if db.execute("SELECT COUNT(*) FROM listings WHERE owner_id=?", (user["id"],)).fetchone()[0] >= 20:
                fail(409, "listing_limit")
            listing_id = uuid4().hex
            db.execute("INSERT INTO listings VALUES (?,?,?,?,?,?,?,?,?)", (listing_id, user["id"], body.title, body.category, body.city, body.price_from_kzt, body.description, int(body.active), now()))
            return listing_record(db, listing_id)

    @app.put("/listings/{listing_id}")
    def edit_listing(listing_id: str, body: ListingInput, request: Request):
        with store.transaction() as db:
            user = current_user(db, request)
            listing = listing_record(db, listing_id)
            if listing["owner_id"] != user["id"]:
                fail(403, "owner_required")
            db.execute("UPDATE listings SET title=?,category=?,city=?,price_from_kzt=?,description=?,active=? WHERE id=?", (body.title, body.category, body.city, body.price_from_kzt, body.description, int(body.active), listing_id))
            # Service edits/deactivation cannot silently preserve earlier provider agreements.
            if any(listing[key] != value for key, value in body.model_dump().items()):
                affected = db.execute("SELECT DISTINCT event_id FROM invitations WHERE listing_id=?", (listing_id,)).fetchall()
                for event in affected:
                    advance_version(db, event["event_id"])
                db.execute("UPDATE invitations SET status='invited' WHERE listing_id=? AND status='accepted'", (listing_id,))
            return listing_record(db, listing_id)

    @app.get("/events")
    def events(request: Request):
        with store.transaction() as db:
            user = current_user(db, request)
            rows = db.execute("SELECT DISTINCT e.*,u.display_name AS owner_name FROM events e JOIN users u ON u.id=e.owner_id LEFT JOIN invitations i ON i.event_id=e.id WHERE e.owner_id=? OR i.user_id=? ORDER BY e.created_at DESC LIMIT 100", (user["id"], user["id"])).fetchall()
            return {"events": [event_detail(db, row, user, include_messages=False) for row in rows]}

    @app.post("/events", status_code=201)
    def create_event(body: EventInput, request: Request):
        template = next((item for item in EVENT_TEMPLATES if item["id"] == body.template_id), None)
        if template is None:
            fail(422, "unknown_template")
        slots = [{"id": uuid4().hex, "category": category, "notes": "", "checklist": [dict(text=text, done=False) for text in next(item for item in SERVICES if item["category"] == category)["checklist"][body.locale]]} for category in template["services"]]
        with store.transaction() as db:
            user = current_user(db, request)
            if db.execute("SELECT COUNT(*) FROM events WHERE owner_id=?", (user["id"],)).fetchone()[0] >= 50:
                fail(409, "event_limit")
            event_id = uuid4().hex
            db.execute("INSERT INTO events VALUES (?,?,?,?,?,?,?,?)", (event_id, user["id"], body.title, body.city, body.event_date.isoformat(), json.dumps(slots, ensure_ascii=False), 1, now()))
            return event_detail(db, event_record(db, event_id, user), user)

    @app.get("/events/{event_id}")
    def get_event(event_id: str, request: Request):
        with store.transaction() as db:
            user = current_user(db, request)
            return event_detail(db, event_record(db, event_id, user), user)

    @app.put("/events/{event_id}/plan")
    def edit_plan(event_id: str, body: PlanInput, request: Request):
        with store.transaction() as db:
            user = current_user(db, request)
            event = event_record(db, event_id, user)
            require_owner(event, user)
            check_version(event, body.version)
            old_slots, slots = json.loads(event["plan"]), [slot.model_dump() for slot in body.slots]
            if slots == old_slots:
                return event_detail(db, event, user)
            changed_scope = scope_of(old_slots) != scope_of(slots)
            old_categories = {slot["id"]: slot["category"] for slot in old_slots}
            retained = {slot["id"] for slot in slots if old_categories.get(slot["id"]) == slot["category"]}
            for invitation in db.execute("SELECT slot_id FROM invitations WHERE event_id=?", (event_id,)).fetchall():
                if invitation["slot_id"] not in retained:
                    db.execute("DELETE FROM invitations WHERE event_id=? AND slot_id=?", (event_id, invitation["slot_id"]))
            version = event["version"] + 1
            db.execute("UPDATE events SET plan=?,version=? WHERE id=?", (json.dumps(slots, ensure_ascii=False), version, event_id))
            db.execute("UPDATE invitations SET version=? WHERE event_id=?", (version, event_id))
            if changed_scope:
                db.execute("UPDATE invitations SET status='invited' WHERE event_id=? AND status='accepted'", (event_id,))
            return event_detail(db, event_record(db, event_id, user), user)

    @app.post("/events/{event_id}/invitations")
    def invite(event_id: str, body: InvitationInput, request: Request):
        with store.transaction() as db:
            user = current_user(db, request)
            event = event_record(db, event_id, user)
            require_owner(event, user)
            check_version(event, body.version)
            slot = next((item for item in json.loads(event["plan"]) if item["id"] == body.slot_id), None)
            if slot is None:
                fail(404, "slot_not_found")
            listing = listing_record(db, body.listing_id)
            if not listing["active"] or listing["city"] != event["city"] or listing["category"] != slot["category"]:
                fail(422, "listing_not_suitable")
            version = event["version"]
            if db.execute("SELECT 1 FROM invitations WHERE event_id=? AND slot_id=?", (event_id, body.slot_id)).fetchone():
                advance_version(db, event_id)
                version += 1
            db.execute("INSERT INTO invitations VALUES (?,?,?,?,?,?) ON CONFLICT(event_id,slot_id) DO UPDATE SET listing_id=excluded.listing_id,user_id=excluded.user_id,status=excluded.status,version=excluded.version", (event_id, body.slot_id, body.listing_id, listing["owner_id"], "invited", version))
            return event_detail(db, event_record(db, event_id, user), user)

    @app.post("/events/{event_id}/invitations/{slot_id}/respond")
    def respond(event_id: str, slot_id: str, body: DecisionInput, request: Request):
        with store.transaction() as db:
            user = current_user(db, request)
            event = event_record(db, event_id, user)
            check_version(event, body.version)
            invitation = db.execute("SELECT * FROM invitations WHERE event_id=? AND slot_id=? AND user_id=?", (event_id, slot_id, user["id"])).fetchone()
            if invitation is None:
                fail(403, "invitation_required")
            if body.decision == "accepted":
                listing = listing_record(db, invitation["listing_id"])
                slot = next(item for item in json.loads(event["plan"]) if item["id"] == slot_id)
                if not listing["active"] or listing["city"] != event["city"] or listing["category"] != slot["category"]:
                    fail(422, "listing_not_suitable")
            db.execute("UPDATE invitations SET status=?,version=? WHERE event_id=? AND slot_id=?", (body.decision, event["version"], event_id, slot_id))
            return event_detail(db, event_record(db, event_id, user), user)

    def chat_permission(db, event_id, request):
        user = current_user(db, request)
        event = event_record(db, event_id, user)
        if not event_detail(db, event, user, include_messages=False)["can_chat"]:
            fail(403, "accept_invitation_first")
        return user

    @app.get("/events/{event_id}/messages")
    def read_messages(event_id: str, request: Request):
        with store.transaction() as db:
            chat_permission(db, event_id, request)
            return {"messages": messages(db, event_id)}

    @app.post("/events/{event_id}/messages", status_code=201)
    def send_message(event_id: str, body: MessageInput, request: Request):
        with store.transaction() as db:
            user = chat_permission(db, event_id, request)
            # Simple local flood control; no external message delivery occurs.
            recent = db.execute("SELECT created_at FROM messages WHERE event_id=? AND user_id=? ORDER BY id DESC LIMIT 1", (event_id, user["id"])).fetchone()
            if recent and (datetime.now(timezone.utc) - datetime.fromisoformat(recent["created_at"])).total_seconds() < 0.5:
                fail(429, "message_rate_limit")
            timestamp = now()
            cursor = db.execute("INSERT INTO messages(event_id,user_id,text,created_at) VALUES (?,?,?,?)", (event_id, user["id"], body.text, timestamp))
            return {"message": dict(id=cursor.lastrowid, event_id=event_id, user_id=user["id"], display_name=user["display_name"], text=body.text, created_at=timestamp)}

    # Added last so the streaming bound runs before all request-body consumers.
    app.add_middleware(BodyLimitMiddleware)
    return app
