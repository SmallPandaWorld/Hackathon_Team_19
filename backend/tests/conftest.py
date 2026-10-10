import os
import sys
import tempfile
from pathlib import Path

import pytest

# Use a throwaway database; must be set before `database` is imported.
_db_dir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_db_dir) / 'test.db'}"
os.environ.pop("DEV_USER_ID", None)
os.environ["MAINTAINER_IDS"] = "maintainer-id"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from database import Base, SessionLocal, engine  # noqa: E402
from main import app  # noqa: E402
from sample_quests import seed_quests  # noqa: E402


@pytest.fixture
def empty_client():
    """A fresh app as on first start: no quests yet."""
    Base.metadata.drop_all(bind=engine)
    with TestClient(app) as test_client:  # runs startup: creates tables
        yield test_client


@pytest.fixture
def client(empty_client):
    """A fresh app with the sample quests."""
    with SessionLocal() as db:
        seed_quests(db)
    yield empty_client


def identity(user_id: str, name: str = "Test Player") -> dict:
    return {"X-User-Id": user_id, "X-User-Name": name}


def act(client, headers, quest_id, action_type, **fields):
    """POST a quest action; returns the response."""
    return client.post(f"/quests/{quest_id}/actions", headers=headers,
                       json={"type": action_type, **fields})
