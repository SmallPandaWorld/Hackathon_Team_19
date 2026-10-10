import logging
import os
from pathlib import Path

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_DATABASE_URL = f"sqlite:///{BACKEND_DIR / 'users.db'}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)

engine_options = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {
        "check_same_thread": False,
        "timeout": 30,
    }

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


def ensure_schema(bind=None) -> None:
    """Create missing tables.

    A database from before usernames became the user key (a `users` table
    without a `username` column) is not migrated: every existing table is
    renamed to `legacy_<name>` and a fresh schema is created. Databases already
    using usernames receive stable quest verification codes without losing rows.
    """
    import models  # noqa: F401  (registers all tables)

    bind = bind or engine
    with bind.begin() as connection:
        inspector = inspect(connection)
        tables = inspector.get_table_names()
        legacy_schema = False
        if "users" in tables:
            columns = {column["name"] for column in inspector.get_columns("users")}
            if "username" not in columns:
                legacy_schema = True
                logger.warning(
                    "Old database schema found; renaming tables %s to legacy_* "
                    "and starting with empty tables.", ", ".join(tables))
                for table in tables:
                    if table.startswith("legacy_"):
                        continue
                    # Index names are global in SQLite; free them for the new tables.
                    for index in inspector.get_indexes(table):
                        if index.get("name"):
                            connection.exec_driver_sql(f'DROP INDEX "{index["name"]}"')
                    target = f"legacy_{table}"
                    suffix = 2
                    while target in tables:
                        target = f"legacy_{table}_{suffix}"
                        suffix += 1
                    connection.exec_driver_sql(f'ALTER TABLE "{table}" RENAME TO "{target}"')
        if not legacy_schema and "quests" in tables:
            from models import new_verification_code

            columns = {column["name"] for column in inspector.get_columns("quests")}
            if "requires_code" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE quests ADD COLUMN requires_code BOOLEAN NOT NULL DEFAULT 0")
            if "verification_code" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE quests ADD COLUMN verification_code VARCHAR(12)")
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
            connection.exec_driver_sql(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_quests_verification_code "
                "ON quests (verification_code)")
        Base.metadata.create_all(bind=connection)
