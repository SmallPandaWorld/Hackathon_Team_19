"""Quest actions work immediately; only meetups have attendance lists."""

from datetime import timedelta

import pytest

from conftest import identity, post_action
from game import utcnow
from sample_quests import QUESTS
from test_features import QUIZ_ANSWERS, set_quest

ALICE = identity("alice-id", "Alice")
BOB = identity("bob-id", "Bob")
CAROL = identity("carol-id", "Carol")
DAVE = identity("dave-id", "Dave")
ADMIN = identity("maintainer-id", "Maintainer")

SOLO_ID, PAIR_ID, QUIZ_ID, STEPS_ID, MEETUP_ID = (
    str(QUESTS[number - 1]["id"]) for number in (1, 4, 5, 6, 7)
)


def quest(client, headers, quest_id):
    response = client.get(f"/quests/{quest_id}", headers=headers)
    assert response.status_code == 200
    return response.json()


def opt_in(client, headers, hobbies=(), discoverable=True):
    assert client.put("/me", headers=headers, json={
        "hobbies": list(hobbies), "discoverable": discoverable}).status_code == 200


def make_live():
    now = utcnow()
    set_quest(MEETUP_ID, starts_at=now - timedelta(minutes=5),
              ends_at=now + timedelta(minutes=30))


@pytest.mark.parametrize("quest_id, action, fields", [
    (SOLO_ID, "complete", {}),
    (QUIZ_ID, "quiz", {"answers": QUIZ_ANSWERS}),
    (PAIR_ID, "pair_start", {}),
])
def test_first_attempt_works_without_joining(client, quest_id, action, fields):
    response = post_action(client, ALICE, quest_id, action, **fields)
    assert response.status_code == 200, response.text
    view = response.json()["quest"]
    assert "joined" not in view
    assert view["participants"] is None
    assert view["participant_count"] == 0
    if action == "pair_start":
        assert view["pair_session"]["state"] == "waiting"
    else:
        assert view["completed"] is True
        assert response.json()["completion"]["points_awarded"] > 0
    assert quest(client, BOB, quest_id)["completed"] is False


def test_steps_can_be_started_and_resumed_directly(client):
    steps = quest(client, ALICE, STEPS_ID)["steps"]
    for index, step in enumerate(steps):
        response = post_action(client, ALICE, STEPS_ID, "step", step_id=step["id"])
        assert response.status_code == 200, response.text
        view = quest(client, ALICE, STEPS_ID)
        assert view["steps"][index]["done"] is True
    assert view["completed"] is True


def test_printed_code_can_be_redeemed_directly(client):
    created = client.post("/admin/quests", headers=ADMIN, json={
        "title": "Find the campus sign", "points": 25, "kind": "solo",
        "requires_code": True, "status": "published",
    })
    assert created.status_code == 201, created.text
    data = created.json()
    redeemed = post_action(client, ALICE, data["id"], "redeem", code=data["verification_code"])
    assert redeemed.status_code == 200, redeemed.text
    assert redeemed.json()["completion"]["points_awarded"] == 25


def test_password_can_be_redeemed_directly(client):
    created = client.post("/quests", headers=BOB, json={
        "title": "Find Bob at the fountain", "kind": "solo", "password": "Fountain 7",
    })
    assert created.status_code == 201, created.text
    quest_id = created.json()["id"]
    assert post_action(client, ALICE, quest_id, "redeem", code="wrong").status_code == 400
    redeemed = post_action(client, ALICE, quest_id, "redeem", code="Fountain 7")
    assert redeemed.status_code == 200, redeemed.text
    assert redeemed.json()["completion"]["points_awarded"] == 10


@pytest.mark.parametrize("action", ["join", "leave"])
def test_enrollment_actions_are_removed(client, action):
    assert post_action(client, ALICE, SOLO_ID, action).status_code == 422


def test_profiles_no_longer_expose_joined_quests(client):
    opt_in(client, BOB)
    assert "current_quests" not in client.get("/me", headers=BOB).json()
    assert "current_quests" not in client.get("/players/bob-id", headers=ALICE).json()


def test_meetup_attendees_need_rsvp_and_consent_to_be_named(client):
    make_live()
    opt_in(client, BOB)
    for player in (BOB, CAROL):
        assert post_action(client, player, MEETUP_ID, "rsvp", attending=True).status_code == 200

    outside = quest(client, ALICE, MEETUP_ID)
    assert outside["participants"] is None
    assert outside["participant_count"] == 2
    view = post_action(client, ALICE, MEETUP_ID, "rsvp", attending=True).json()["quest"]
    assert view["participants"] == [
        {"username": "bob-id", "display_name": "Bob", "shared_hobbies": []}]
    assert view["participant_count"] == 2
    listed = next(q for q in client.get("/quests", headers=ALICE).json() if q["id"] == MEETUP_ID)
    assert listed["participants"] == view["participants"]

    # Checking in keeps the guest list; walk-ins also work without an RSVP.
    for player in (ALICE, BOB, DAVE):
        assert post_action(client, player, MEETUP_ID, "complete").status_code == 200
    assert quest(client, ALICE, MEETUP_ID)["participants"] == view["participants"]
    assert quest(client, DAVE, MEETUP_ID)["participants"] is None

    opt_in(client, BOB, discoverable=False)
    assert quest(client, ALICE, MEETUP_ID)["participants"] == []


def test_meetup_attendees_with_shared_hobbies_come_first(client):
    make_live()
    opt_in(client, ALICE, ["chess", "hiking"], discoverable=False)
    opt_in(client, BOB, ["music"])
    opt_in(client, CAROL, ["hiking", "chess", "coding"])
    opt_in(client, DAVE, ["hiking"])
    for player in (ALICE, BOB, CAROL, DAVE):
        post_action(client, player, MEETUP_ID, "rsvp", attending=True)
    people = quest(client, ALICE, MEETUP_ID)["participants"]
    assert [p["display_name"] for p in people] == ["Carol", "Dave", "Bob"]
    assert people[0]["shared_hobbies"] == ["Chess", "Hiking"]


def test_meetup_guest_list_closes_after_withdrawing_or_event_ending(client):
    make_live()
    opt_in(client, BOB)
    for player in (ALICE, BOB):
        post_action(client, player, MEETUP_ID, "rsvp", attending=True)
    assert len(quest(client, ALICE, MEETUP_ID)["participants"]) == 1
    post_action(client, ALICE, MEETUP_ID, "rsvp", attending=False)
    assert quest(client, ALICE, MEETUP_ID)["participants"] is None
    post_action(client, ALICE, MEETUP_ID, "rsvp", attending=True)
    now = utcnow()
    set_quest(MEETUP_ID, starts_at=now - timedelta(hours=2), ends_at=now - timedelta(hours=1))
    assert quest(client, ALICE, MEETUP_ID)["participants"] is None
