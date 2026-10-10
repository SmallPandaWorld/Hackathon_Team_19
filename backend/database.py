import os
from pathlib import Path
from uuid import uuid4

from sqlalchemy import Integer, create_engine, inspect, text
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


def migrate_legacy_quest_ids():
    """Replace integer quest IDs in existing SQLite databases with UUIDs."""
    if engine.dialect.name != "sqlite":
        return

    inspector = inspect(engine)
    if "quests" not in inspector.get_table_names():
        return

    quest_id_column = next(
        column for column in inspector.get_columns("quests") if column["name"] == "id"
    )
    if not isinstance(quest_id_column["type"], Integer):
        return

    tables = set(inspector.get_table_names())
    with engine.connect() as connection:
        # SQLite enforces foreign keys only when enabled for the connection.
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()
        with connection.begin():
            quests = connection.execute(text("SELECT * FROM quests")).mappings().all()
            assignments = (
                connection.execute(text("SELECT * FROM quest_assignments")).mappings().all()
                if "quest_assignments" in tables
                else []
            )
            solvers = (
                connection.execute(text("SELECT * FROM quest_solvers")).mappings().all()
                if "quest_solvers" in tables
                else []
            )
            id_map = {row["id"]: uuid4().hex for row in quests}

            for table in ("quest_assignments", "quest_solvers", "quests"):
                if table in tables:
                    connection.execute(text(f"DROP TABLE {table}"))

            from models import Base as ModelBase

            ModelBase.metadata.create_all(bind=connection)
            for row in quests:
                connection.execute(
                    text(
                        "INSERT INTO quests (id, question, answer, points) "
                        "VALUES (:id, :question, :answer, :points)"
                    ),
                    {
                        "id": id_map[row["id"]],
                        "question": row["question"],
                        "answer": row["answer"],
                        "points": row["points"],
                    },
                )

            for row in assignments:
                connection.execute(
                    text(
                        "INSERT INTO quest_assignments "
                        "(username, quest_id, seen_at, submitted_answer, is_correct, answered_at) "
                        "VALUES (:username, :quest_id, :seen_at, :submitted_answer, "
                        ":is_correct, :answered_at)"
                    ),
                    {
                        "username": row["username"],
                        "quest_id": id_map[row["quest_id"]],
                        "seen_at": row["seen_at"],
                        "submitted_answer": row.get("submitted_answer"),
                        "is_correct": row.get("is_correct"),
                        "answered_at": row.get("answered_at"),
                    },
                )

            for row in solvers:
                connection.execute(
                    text(
                        "INSERT INTO quest_solvers (quest_id, username, solved_at) "
                        "VALUES (:quest_id, :username, :solved_at)"
                    ),
                    {
                        "quest_id": id_map[row["quest_id"]],
                        "username": row["username"],
                        "solved_at": row["solved_at"],
                    },
                )
