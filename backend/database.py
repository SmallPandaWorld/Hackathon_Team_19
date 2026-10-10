import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker


BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_DATABASE_URL = f"sqlite:///{BACKEND_DIR / 'users.db'}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)

engine_options = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_legacy_users():
    """Preserve profiles from the original integer-keyed SQLite table."""
    if engine.dialect.name != "sqlite":
        return

    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("users")}
    if "username" in columns:
        return

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users RENAME TO users_legacy"))

    from models import User

    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        legacy_users = connection.execute(
            text("SELECT id, name FROM users_legacy ORDER BY id")
        ).mappings()
        connection.execute(
            User.__table__.insert(),
            [
                {"username": f"legacy-{row['id']}", "name": row["name"], "score": 0}
                for row in legacy_users
            ],
        )
        connection.execute(text("DROP TABLE users_legacy"))
