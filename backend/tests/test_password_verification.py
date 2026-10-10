from uuid import UUID

from conftest import act, identity
from database import SessionLocal, ensure_schema
from models import Quest


MAINTAINER = identity("maintainer-id", "Maintainer")
ALICE = identity("password-alice", "Alice")
BOB = identity("password-bob", "Bob")
PASSWORD = "Catwalk 42"


def make_password_quest(client):
    response = client.post("/admin/quests", headers=MAINTAINER, json={
        "title": "Find the secret word",
        "description": "Ask the organizer for the password after finishing.",
        "points": 25,
        "kind": "solo",
        "requires_password": True,
        "password": PASSWORD,
        "status": "published",
    })
    assert response.status_code == 201, response.text
    return response.json()


def test_password_quest_is_private_and_awards_each_player_once(client):
    quest = make_password_quest(client)
    quest_id = quest["id"]
    assert quest["requires_password"] is True
    assert quest["requires_code"] is False
    assert quest["verification_code"] is None
    assert PASSWORD not in str(quest)

    with SessionLocal() as db:
        saved = db.get(Quest, UUID(quest_id))
        assert saved.password_hash != PASSWORD
        assert saved.password_hash.startswith("sha256$")

    for headers in (ALICE, BOB):
        player_quest = client.get(f"/quests/{quest_id}", headers=headers).json()
        assert player_quest["requires_password"] is True
        assert "password" not in player_quest
        assert PASSWORD not in client.get("/quests", headers=headers).text
        assert client.get(f"/admin/quests/{quest_id}", headers=headers).status_code == 403

    assert act(client, ALICE, quest_id, "complete").status_code == 400
    assert act(client, ALICE, quest_id, "redeem", code="catwalk 42").status_code == 400
    assert client.get("/me", headers=ALICE).json()["total_points"] == 0

    first = act(client, ALICE, quest_id, "redeem", code=PASSWORD).json()["completion"]
    assert first["points_awarded"] == 25
    assert first["already_completed"] is False
    again = act(client, ALICE, quest_id, "redeem", code=PASSWORD).json()["completion"]
    assert again["points_awarded"] == 0
    assert again["already_completed"] is True
    assert act(client, BOB, quest_id, "redeem", code=PASSWORD).json()["completion"]["points_awarded"] == 25


def test_password_edits_rotation_and_switch_to_printed_code(client):
    quest = make_password_quest(client)
    quest_id = quest["id"]
    changed = client.patch(f"/admin/quests/{quest_id}", headers=MAINTAINER,
                           json={"title": "Find the updated secret word"})
    assert changed.status_code == 200, changed.text
    ensure_schema()
    assert act(client, ALICE, quest_id, "redeem", code=PASSWORD).status_code == 200

    rotated = client.patch(f"/admin/quests/{quest_id}", headers=MAINTAINER,
                           json={"password": "New secret 8"})
    assert rotated.status_code == 200, rotated.text
    assert PASSWORD not in rotated.text
    assert act(client, BOB, quest_id, "redeem", code=PASSWORD).status_code == 400
    assert act(client, BOB, quest_id, "redeem", code="New secret 8").status_code == 200

    switched = client.patch(f"/admin/quests/{quest_id}", headers=MAINTAINER,
                            json={"requires_password": False, "requires_code": True})
    assert switched.status_code == 200, switched.text
    printed_code = switched.json()["verification_code"]
    assert printed_code
    with SessionLocal() as db:
        assert db.get(Quest, UUID(quest_id)).password_hash is None
    charlie = identity("password-charlie", "Charlie")
    assert act(client, charlie, quest_id, "redeem", code="New secret 8").status_code == 400
    assert act(client, charlie, quest_id, "redeem", code=printed_code).json()["completion"]["points_awarded"] == 25


def test_password_method_requires_a_valid_password_and_is_solo_only(client):
    base = {"title": "Password quest", "description": "Ask for the secret after completing it.",
            "points": 10, "kind": "solo", "requires_password": True}
    missing = client.post("/admin/quests", headers=MAINTAINER, json=base)
    assert missing.status_code == 400
    assert "Set a password" in missing.json()["detail"]
    for changes in (
        {"password": PASSWORD, "requires_code": True},
        {"password": PASSWORD, "kind": "pair"},
    ):
        invalid = client.post("/admin/quests", headers=MAINTAINER,
                              json={**base, **changes})
        assert invalid.status_code == 422, invalid.text
