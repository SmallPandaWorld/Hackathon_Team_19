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


# --- Meetups: scan the QR to check in ------------------------------------------

def make_qr_meetup(client, starts_in_minutes: int, duration_minutes: int = 60):
    from datetime import timedelta
    from game import utcnow
    starts = utcnow() + timedelta(minutes=starts_in_minutes)
    payload = {
        "title": "VISCON group photo",
        "description": "Scan the organiser's QR code when you arrive.",
        "points": 20,
        "kind": "meetup",
        "requires_code": True,
        "starts_at": starts.isoformat() + "Z",
        "ends_at": (starts + timedelta(minutes=duration_minutes)).isoformat() + "Z",
        "status": "published",
    }
    created = client.post("/admin/quests", headers=MAINTAINER, json=payload)
    assert created.status_code == 201, created.text
    return created.json()


def test_qr_meetup_needs_the_code_and_the_check_in_window(client):
    quest = make_qr_meetup(client, starts_in_minutes=60)
    quest_id, code = quest["id"], quest["verification_code"]
    assert client.get(f"/quests/{quest_id}", headers=ALICE).json()["requires_code"] is True

    # The plain check-in button is disabled for QR meetups.
    bypass = act(client, ALICE, quest_id, "complete")
    assert bypass.status_code == 400
    assert "QR" in bypass.json()["detail"]

    # Right code, but the meetup is not live yet.
    early = act(client, ALICE, quest_id, "redeem", code=code)
    assert early.status_code == 409
    assert "15 minutes" in early.json()["detail"]

    live = make_qr_meetup(client, starts_in_minutes=5)
    live_id, live_code = live["id"], live["verification_code"]
    wrong = act(client, ALICE, live_id, "redeem", code=code)  # the other meetup's code
    assert wrong.status_code == 400
    checked_in = act(client, ALICE, live_id, "redeem", code=live_code.lower()).json()["completion"]
    assert checked_in["points_awarded"] == 20
    assert checked_in["already_completed"] is False
    assert client.get(f"/quests/{live_id}", headers=ALICE).json()["completed"] is True

    # Scanning again is harmless; a second player earns their own points.
    again = act(client, ALICE, live_id, "redeem", code=live_code).json()["completion"]
    assert again["already_completed"] is True and again["points_awarded"] == 0
    assert act(client, BOB, live_id, "redeem", code=live_code).json()["completion"]["points_awarded"] == 20


def test_qr_meetup_closes_after_the_end(client):
    quest = make_qr_meetup(client, starts_in_minutes=-120, duration_minutes=30)
    quest_id, code = quest["id"], quest["verification_code"]
    late = act(client, ALICE, quest_id, "redeem", code=code)
    assert late.status_code == 409
    assert "over" in late.json()["detail"]


def test_qr_meetup_can_be_switched_back_to_plain_check_in(client):
    quest = make_qr_meetup(client, starts_in_minutes=5)
    quest_id = quest["id"]
    changed = client.patch(f"/admin/quests/{quest_id}", headers=MAINTAINER,
                           json={"requires_code": False})
    assert changed.status_code == 200, changed.text
    assert changed.json()["requires_code"] is False
    assert act(client, ALICE, quest_id, "complete").json()["completion"]["points_awarded"] == 20


def test_code_verification_is_solo_or_meetup_only(client):
    for kind in ("pair", "quiz", "multi_step"):
        payload = {
            "title": "Nope", "description": "Code verification does not apply here.",
            "points": 5, "kind": kind, "requires_code": True,
        }
        assert client.post("/admin/quests", headers=MAINTAINER, json=payload).status_code == 422
