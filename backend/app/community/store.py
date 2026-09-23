"""Small transactional SQLite store. No accounts or messages enter the CSV matcher."""

from contextlib import contextmanager
import hashlib
from pathlib import Path
import secrets
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('organizer','provider')), password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_attempts (client TEXT NOT NULL, occurred REAL NOT NULL);
CREATE TABLE IF NOT EXISTS listings (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
 category TEXT NOT NULL, city TEXT NOT NULL, price_from_kzt INTEGER NOT NULL,
 description TEXT NOT NULL, active INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
 city TEXT NOT NULL, event_date TEXT NOT NULL, plan TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invitations (
 event_id TEXT NOT NULL REFERENCES events(id), slot_id TEXT NOT NULL,
 listing_id TEXT NOT NULL REFERENCES listings(id), user_id TEXT NOT NULL REFERENCES users(id),
 status TEXT NOT NULL CHECK(status IN ('invited','accepted','declined')), version INTEGER NOT NULL,
 PRIMARY KEY(event_id, slot_id)
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL REFERENCES events(id),
 user_id TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_event ON messages(event_id,id);
CREATE INDEX IF NOT EXISTS invitations_user ON invitations(user_id,event_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
CREATE INDEX IF NOT EXISTS attempts_client ON auth_attempts(client,occurred);
"""


class Store:
    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def transaction(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            db.execute("PRAGMA foreign_keys=ON")
            db.executescript(SCHEMA)
            # Serialize read-check-write transitions, including plan versions and invitations.
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()


def password_hash(password: str, salt: str | None = None) -> str:
    # OWASP-listed scrypt tradeoff: N=2^15, r=8, p=3, ~32 MiB per password hash.
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=3, maxmem=64 * 1024 * 1024)
    return f"scrypt${salt}${digest.hex()}"


def password_matches(password: str, stored: str) -> bool:
    _, salt, _ = stored.split("$")
    return secrets.compare_digest(password_hash(password, salt), stored)


def session_hash(token: str) -> str:
    # Fast hashing is appropriate for random 256-bit tokens, not human passwords.
    return hashlib.sha256(token.encode()).hexdigest()


def public_user(row) -> dict:
    return {key: row[key] for key in ("id", "username", "display_name", "role")}
