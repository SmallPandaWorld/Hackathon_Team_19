import re

from conftest import identity
from database import SessionLocal, upgrade_legacy_schema
from models import Quest
from quests import seed_quests


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
    }
    created = client.post("/admin/quests", headers=MAINTAINER, json=payload)
    assert created.status_code == 201
    quest = created.json()
    assert re.fullmatch(r"[A-HJ-NP-Z2-9]{12}", quest["verification_code"])
    published = client.post(
        f"/admin/quests/{quest['id']}/status",
        headers=MAINTAINER,
        json={"status": "published"},
    )
    assert published.status_code == 200
    return quest, payload


def test_code_is_private_reusable_and_awarded_once_per_player(client):
    quest, _ = make_code_quest(client)
    other_quest, _ = make_code_quest(client)
    quest_id = quest["id"]
    code = quest["verification_code"]
    assert other_quest["verification_code"] != code

    for headers in (ALICE, BOB):
        player_quest = client.get(f"/quests/{quest_id}", headers=headers).json()
        assert player_quest["requires_code"] is True
        assert "verification_code" not in player_quest
        assert code not in client.get("/quests", headers=headers).text
        assert client.get(f"/admin/quests/{quest_id}", headers=headers).status_code == 403

    bypass = client.post(f"/quests/{quest_id}/complete", headers=ALICE)
    assert bypass.status_code == 400
    assert "printed code" in bypass.json()["detail"]

    for wrong in ("WRONGCODE123", "é", other_quest["verification_code"]):
        result = client.post(f"/quests/{quest_id}/redeem", headers=ALICE,
                             json={"code": wrong})
        assert result.status_code == 400
        assert "not valid" in result.json()["detail"]
    assert client.get("/me", headers=ALICE).json()["total_points"] == 0

    first = client.post(f"/quests/{quest_id}/redeem", headers=ALICE,
                        json={"code": code.lower()}).json()
    assert first["points_awarded"] == 25
    assert first["already_completed"] is False
    again = client.post(f"/quests/{quest_id}/redeem", headers=ALICE,
                        json={"code": code}).json()
    assert again["points_awarded"] == 0
    assert again["already_completed"] is True
    second_player = client.post(f"/quests/{quest_id}/redeem", headers=BOB,
                                json={"code": code}).json()
    assert second_player["points_awarded"] == 25
    assert client.get("/me", headers=ALICE).json()["total_points"] == 25
    assert client.get("/me", headers=BOB).json()["total_points"] == 25


def test_ordinary_edits_and_startup_upgrade_keep_printed_code(client):
    quest, payload = make_code_quest(client)
    quest_id = quest["id"]
    code = quest["verification_code"]
    changed = client.put(f"/admin/quests/{quest_id}", headers=MAINTAINER,
                         json={**payload, "title": "Find the updated campus sign"})
    assert changed.status_code == 200
    assert changed.json()["verification_code"] == code

    upgrade_legacy_schema()
    with SessionLocal() as db:
        seed_quests(db)
        assert db.get(Quest, quest_id).verification_code == code
    assert client.get(f"/admin/quests/{quest_id}", headers=MAINTAINER).json()["verification_code"] == code
    redeemed = client.post(f"/quests/{quest_id}/redeem", headers=ALICE,
                           json={"code": code})
    assert redeemed.json()["points_awarded"] == 25
