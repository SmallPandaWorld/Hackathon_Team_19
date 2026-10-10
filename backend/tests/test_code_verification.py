import re
from datetime import datetime, timezone
from uuid import UUID

from conftest import act, identity
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session

from database import Base, SessionLocal, ensure_schema
from models import Quest


MAINTAINER = identity("maintainer-id", "Maintainer")
ALICE = identity("code-alice", "Alice")
BOB = identity("code-bob", "Bob")


def make_code_quest(client):
    payload = {
        "title": "Find the campus sign",
        "description": "Visit the sign and enter the printed code.",
        "points": 25,
        "kind": "solo",
        "requires_code": True,
        "status": "published",
    }
    created = client.post("/admin/quests", headers=MAINTAINER, json=payload)
    assert created.status_code == 201, created.text
    quest = created.json()
    assert re.fullmatch(r"[A-HJ-NP-Z2-9]{12}", quest["verification_code"])
    return quest


def test_code_is_private_reusable_and_awarded_once_per_player(client):
    quest = make_code_quest(client)
    other_quest = make_code_quest(client)
    quest_id = quest["id"]
    code = quest["verification_code"]
    assert other_quest["verification_code"] != code

    for headers in (ALICE, BOB):
        player_quest = client.get(f"/quests/{quest_id}", headers=headers).json()
        assert player_quest["requires_code"] is True
        assert "verification_code" not in player_quest
        assert code not in client.get("/quests", headers=headers).text
        assert client.get(f"/admin/quests/{quest_id}", headers=headers).status_code == 403

    bypass = act(client, ALICE, quest_id, "complete")
    assert bypass.status_code == 400
    assert "printed code" in bypass.json()["detail"]

    for wrong in ("WRONGCODE123", "é", other_quest["verification_code"]):
        result = act(client, ALICE, quest_id, "redeem", code=wrong)
        assert result.status_code == 400
        assert "not valid" in result.json()["detail"]
    assert client.get("/me", headers=ALICE).json()["total_points"] == 0

    first = act(client, ALICE, quest_id, "redeem", code=code.lower()).json()["completion"]
    assert first["points_awarded"] == 25
    assert first["already_completed"] is False
    again = act(client, ALICE, quest_id, "redeem", code=code).json()["completion"]
    assert again["points_awarded"] == 0
    assert again["already_completed"] is True
    second_player = act(client, BOB, quest_id, "redeem", code=code).json()["completion"]
    assert second_player["points_awarded"] == 25
    assert client.get("/me", headers=ALICE).json()["total_points"] == 25
    assert client.get("/me", headers=BOB).json()["total_points"] == 25


def test_ordinary_edits_and_startup_keep_printed_code(client):
    quest = make_code_quest(client)
    quest_id = quest["id"]
    code = quest["verification_code"]
    changed = client.patch(f"/admin/quests/{quest_id}", headers=MAINTAINER,
                           json={"title": "Find the updated campus sign"})
    assert changed.status_code == 200, changed.text
    assert changed.json()["verification_code"] == code
    assert changed.json()["requires_code"] is True

    ensure_schema()  # what startup runs
    with SessionLocal() as db:
        assert db.get(Quest, UUID(quest_id)).verification_code == code
    assert client.get(f"/admin/quests/{quest_id}", headers=MAINTAINER).json()["verification_code"] == code
    redeemed = act(client, ALICE, quest_id, "redeem", code=code)
    assert redeemed.json()["completion"]["points_awarded"] == 25


def test_code_window_boundaries_and_removal(client, monkeypatch):
    quest = make_code_quest(client)
    quest_id, code = quest["id"], quest["verification_code"]
    start = "2026-06-01T14:00:00+02:00"
    end = "2026-06-01T15:00:00+02:00"
    updated = client.patch(f"/admin/quests/{quest_id}", headers=MAINTAINER, json={
        "verification_starts_at": start, "verification_ends_at": end,
    })
    assert updated.status_code == 200, updated.text
    assert updated.json()["verification_code"] == code
    assert updated.json()["verification_starts_at"] == "2026-06-01T12:00:00Z"
    assert updated.json()["verification_ends_at"] == "2026-06-01T13:00:00Z"
    player_view = client.get(f"/quests/{quest_id}", headers=ALICE).json()
    assert player_view["verification_starts_at"] == updated.json()["verification_starts_at"]
    assert "verification_code" not in player_view

    def clock(hour, minute):
        monkeypatch.setattr("game.utcnow", lambda: datetime(
            2026, 6, 1, hour, minute, tzinfo=timezone.utc).replace(tzinfo=None))

    clock(11, 59)
    before = act(client, ALICE, quest_id, "redeem", code=code)
    assert before.status_code == 409
    assert "not valid yet" in before.json()["detail"]
    assert client.get("/me", headers=ALICE).json()["total_points"] == 0

    clock(12, 0)
    inside = act(client, ALICE, quest_id, "redeem", code=code)
    assert inside.status_code == 200
    assert inside.json()["completion"]["points_awarded"] == 25

    clock(13, 0)
    at_end = act(client, BOB, quest_id, "redeem", code=code)
    assert at_end.status_code == 409
    assert "ended" in at_end.json()["detail"]
    assert client.get("/me", headers=BOB).json()["total_points"] == 0

    removed = client.patch(f"/admin/quests/{quest_id}", headers=MAINTAINER, json={
        "verification_starts_at": None, "verification_ends_at": None,
    })
    assert removed.status_code == 200
    assert removed.json()["verification_code"] == code
    assert removed.json()["verification_starts_at"] is None
    assert removed.json()["verification_ends_at"] is None
    assert act(client, BOB, quest_id, "redeem", code=code).json()["completion"]["points_awarded"] == 25


def test_invalid_window_and_player_override_are_rejected(client, monkeypatch):
    quest = make_code_quest(client)
    quest_id, code = quest["id"], quest["verification_code"]
    invalid_create = client.post("/admin/quests", headers=MAINTAINER, json={
        "title": "Invalid window", "description": "This should not be saved.",
        "points": 10, "kind": "solo", "requires_code": True,
        "verification_starts_at": "2026-06-01T15:00:00+02:00",
        "verification_ends_at": "2026-06-01T14:00:00+02:00",
    })
    assert invalid_create.status_code == 422
    invalid = client.patch(f"/admin/quests/{quest_id}", headers=MAINTAINER, json={
        "verification_starts_at": "2026-06-01T15:00:00+02:00",
        "verification_ends_at": "2026-06-01T14:00:00+02:00",
    })
    assert invalid.status_code == 422
    assert client.get(f"/admin/quests/{quest_id}", headers=MAINTAINER).json()["verification_starts_at"] is None

    saved = client.patch(f"/admin/quests/{quest_id}", headers=MAINTAINER, json={
        "verification_starts_at": "2026-06-01T14:00:00+02:00",
    })
    assert saved.status_code == 200, saved.text
    assert client.patch(f"/admin/quests/{quest_id}", headers=ALICE, json={
        "verification_starts_at": None,
    }).status_code == 403
    monkeypatch.setattr("game.utcnow", lambda: datetime(2026, 6, 1, 11, 59))
    bypass = client.post(f"/quests/{quest_id}/actions", headers=ALICE, json={
        "type": "redeem", "code": code, "verification_starts_at": None,
        "verification_ends_at": None,
    })
    assert bypass.status_code == 409
    assert client.get("/me", headers=ALICE).json()["total_points"] == 0

    equal = client.patch(f"/admin/quests/{quest_id}", headers=MAINTAINER, json={
        "verification_ends_at": "2026-06-01T14:00:00+02:00",
    })
    assert equal.status_code == 422
    assert client.get(f"/admin/quests/{quest_id}", headers=MAINTAINER).json()["verification_ends_at"] is None


def test_existing_sqlite_quest_gains_window_columns_without_changing_code():
    old_engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=old_engine)
    with Session(old_engine) as db:
        quest = Quest(title="Existing sign", description="Already printed",
                      points=10, kind="solo", status="published", requires_code=True)
        db.add(quest)
        db.commit()
        quest_id, code = quest.id, quest.verification_code
    with old_engine.begin() as connection:
        connection.exec_driver_sql("ALTER TABLE quests DROP COLUMN verification_starts_at")
        connection.exec_driver_sql("ALTER TABLE quests DROP COLUMN verification_ends_at")

    ensure_schema(old_engine)
    columns = {column["name"] for column in inspect(old_engine).get_columns("quests")}
    assert {"verification_starts_at", "verification_ends_at"} <= columns
    with Session(old_engine) as db:
        restored = db.get(Quest, quest_id)
        assert restored.verification_code == code
        assert restored.verification_starts_at is None
        assert restored.verification_ends_at is None
