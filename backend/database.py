import os
from pathlib import Path

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from models import new_verification_code

BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_DATABASE_URL = f"sqlite:///{BACKEND_DIR / 'users.db'}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)

engine_options = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


if DATABASE_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after a table was first created. create_all() only creates
# missing tables, so existing databases get these via ALTER TABLE. Defaults
# keep old rows valid (e.g. MVP quests become published solo quests).
ADDED_COLUMNS = {
    "users": {
        "viscon_user_id": "VARCHAR(255)",
        "hobbies": "VARCHAR(1000) NOT NULL DEFAULT ''",
        "discoverable": "BOOLEAN NOT NULL DEFAULT 0",
    },
    "quests": {
        "kind": "VARCHAR(20) NOT NULL DEFAULT 'solo'",
        "status": "VARCHAR(20) NOT NULL DEFAULT 'published'",
        "requires_approval": "BOOLEAN NOT NULL DEFAULT 0",
        "requires_code": "BOOLEAN NOT NULL DEFAULT 0",
        "verification_code": "VARCHAR(12)",
        "latitude": "FLOAT",
        "longitude": "FLOAT",
        "starts_at": "DATETIME",
        "ends_at": "DATETIME",
        "cancelled": "BOOLEAN NOT NULL DEFAULT 0",
        "author_id": "INTEGER REFERENCES users (id)",
        "review_note": "TEXT",
    },
    "pair_sessions": {
        "invited_player_id": "INTEGER REFERENCES users (id)",
    },
    "completions": {
        "status": "VARCHAR(20) NOT NULL DEFAULT 'approved'",
        "note": "TEXT",
        "reviewer_id": "INTEGER REFERENCES users (id)",
        "review_note": "TEXT",
        "reviewed_at": "DATETIME",
    },
}


def upgrade_legacy_schema():
    """Add missing columns to tables created by older versions of the app.

    Existing rows are kept. Prototype users without a VISCON identity simply
    never match a login.
    """
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table, added in ADDED_COLUMNS.items():
            if table not in tables:
                continue
            existing = {column["name"] for column in inspector.get_columns(table)}
            for column, ddl in added.items():
                if column not in existing:
                    connection.execute(
                        text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
        if "users" in tables:
            connection.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_viscon_user_id "
                "ON users (viscon_user_id)"))
        if "quests" in tables:
            rows = connection.execute(text(
                "SELECT id, verification_code FROM quests")).all()
            used = {code for _, code in rows if code}
            for quest_id, code in rows:
                if code:
                    continue
                fresh = new_verification_code()
                while fresh in used:
                    fresh = new_verification_code()
                used.add(fresh)
                connection.execute(text(
                    "UPDATE quests SET verification_code = :code WHERE id = :id"),
                    {"code": fresh, "id": quest_id})
            connection.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_quests_verification_code "
                "ON quests (verification_code)"))
