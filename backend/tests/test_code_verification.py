import re
from uuid import UUID

from conftest import act, identity
from database import SessionLocal, ensure_schema
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
