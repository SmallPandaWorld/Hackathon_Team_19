"""Joining a quest before doing it, and seeing who else is on it."""

from datetime import timedelta

import pytest

from conftest import act, identity, post_action
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


def join(client, headers, quest_id):
    response = post_action(client, headers, quest_id, "join")
    assert response.status_code == 200, response.text
    return response.json()["quest"]


def opt_in(client, headers, hobbies=(), discoverable=True):
    assert client.put("/me", headers=headers, json={
        "hobbies": list(hobbies), "discoverable": discoverable}).status_code == 200


def names(view):
    return [p["display_name"] for p in view["participants"]]


def first_step(client, quest_id=STEPS_ID):
    return quest(client, ALICE, quest_id)["steps"][0]["id"]


def make_live(quest_id=MEETUP_ID):
    now = utcnow()
    set_quest(quest_id, starts_at=now - timedelta(minutes=5),
              ends_at=now + timedelta(minutes=30))


# --- Join before the first attempt ------------------------------------------------

@pytest.mark.parametrize("quest_id, action, fields", [
    (SOLO_ID, "complete", {}),
    (QUIZ_ID, "quiz", {"answers": QUIZ_ANSWERS}),
    (PAIR_ID, "pair_start", {}),
])
def test_first_attempt_needs_a_join(client, quest_id, action, fields):
    assert quest(client, ALICE, quest_id)["joined"] is False
    refused = post_action(client, ALICE, quest_id, action, **fields)
    assert refused.status_code == 409
    assert refused.json() == {"detail": "Join this quest first."}
    assert client.get("/me", headers=ALICE).json()["total_points"] == 0

    assert join(client, ALICE, quest_id)["joined"] is True
    assert join(client, ALICE, quest_id)["joined"] is True  # idempotent
    assert post_action(client, ALICE, quest_id, action, **fields).status_code == 200
    # One player joining says nothing about another.
    assert quest(client, BOB, quest_id)["joined"] is False


def test_step_needs_a_join(client):
    step = first_step(client)
    assert post_action(client, ALICE, STEPS_ID, "step", step_id=step).status_code == 409
    join(client, ALICE, STEPS_ID)
    done = post_action(client, ALICE, STEPS_ID, "step", step_id=step)
    assert done.json()["quest"]["steps"][0]["done"] is True


def test_printed_code_needs_a_join(client):
    created = client.post("/admin/quests", headers=ADMIN, json={
        "title": "Find the campus sign",
        "description": "Visit the sign and enter the printed code.",
        "points": 25, "kind": "solo", "requires_code": True, "status": "published",
    }).json()
    code = created["verification_code"]
    assert post_action(client, ALICE, created["id"], "redeem", code=code).status_code == 409
    join(client, ALICE, created["id"])
    redeemed = post_action(client, ALICE, created["id"], "redeem", code=code)
    assert redeemed.json()["completion"]["points_awarded"] == 25


def test_password_needs_a_join(client):
    created = client.post("/quests", headers=BOB, json={
        "title": "Find Bob at the fountain", "kind": "solo", "password": "Fountain 7",
    })
    assert created.status_code == 201, created.text
    quest_id = created.json()["id"]
    refused = post_action(client, ALICE, quest_id, "redeem", code="Fountain 7")
    assert refused.status_code == 409
    join(client, ALICE, quest_id)
    assert post_action(client, ALICE, quest_id, "redeem", code="wrong").status_code == 400
    redeemed = post_action(client, ALICE, quest_id, "redeem", code="Fountain 7")
    assert redeemed.json()["completion"]["points_awarded"] == 10


def test_join_needs_a_published_quest(client):
    set_quest(SOLO_ID, status="retired")
    assert post_action(client, ALICE, SOLO_ID, "join").status_code == 404


def test_leave_keeps_progress_but_needs_a_new_join(client):
    step = first_step(client)
    join(client, ALICE, STEPS_ID)
    post_action(client, ALICE, STEPS_ID, "step", step_id=step)

    left = post_action(client, ALICE, STEPS_ID, "leave")
    assert left.status_code == 200
    assert left.json()["quest"]["joined"] is False
    assert left.json()["quest"]["steps"][0]["done"] is True
    assert post_action(client, ALICE, STEPS_ID, "leave").status_code == 200  # idempotent

    second = left.json()["quest"]["steps"][1]["id"]
    assert post_action(client, ALICE, STEPS_ID, "step", step_id=second).status_code == 409
    join(client, ALICE, STEPS_ID)
    assert post_action(client, ALICE, STEPS_ID, "step", step_id=second).status_code == 200


def test_started_quests_stay_open_without_a_join(client):
    """Completions from before a join (or after leaving) are never locked out."""
    join(client, ALICE, SOLO_ID)
    post_action(client, ALICE, SOLO_ID, "complete")
    post_action(client, ALICE, SOLO_ID, "leave")
    again = post_action(client, ALICE, SOLO_ID, "complete")
    assert again.status_code == 200
    assert again.json()["completion"]["already_completed"] is True

    # A rejected claim can be sent again.
    set_quest(SOLO_ID, requires_approval=True)
    join(client, BOB, SOLO_ID)
    post_action(client, BOB, SOLO_ID, "complete", note="first try")
    claim = client.get("/admin/completions", headers=ADMIN).json()[0]
    client.post(f"/admin/completions/{claim['id']}/review", headers=ADMIN,
                json={"approve": False})
    post_action(client, BOB, SOLO_ID, "leave")
    retry = post_action(client, BOB, SOLO_ID, "complete", note="second try")
    assert retry.status_code == 200
    assert retry.json()["completion"]["status"] == "pending"


def test_pair_partner_joins_with_the_code(client):
    join(client, ALICE, PAIR_ID)
    code = post_action(client, ALICE, PAIR_ID, "pair_start").json()["quest"]["pair_session"]["code"]
    joined = client.post(f"/pair/{code}", headers=BOB)
    assert joined.status_code == 200
    assert joined.json()["completion"]["points_awarded"] > 0
    # Having completed it, Bob can host for someone else without joining.
    assert post_action(client, BOB, PAIR_ID, "pair_start").status_code == 200


def test_meetups_use_rsvp_instead(client):
    refused = post_action(client, ALICE, MEETUP_ID, "join")
    assert refused.status_code == 400
    assert "coming" in refused.json()["detail"]
    assert post_action(client, ALICE, MEETUP_ID, "leave").status_code == 400

    make_live()
    assert quest(client, ALICE, MEETUP_ID)["joined"] is False
    rsvp = post_action(client, ALICE, MEETUP_ID, "rsvp", attending=True).json()["quest"]
    assert rsvp["joined"] is True
    # Walk-ins can still check in.
    assert post_action(client, BOB, MEETUP_ID, "complete").status_code == 200


# --- Who else is on the quest -----------------------------------------------------

def test_participants_are_only_for_players_on_the_quest(client):
    opt_in(client, BOB)
    join(client, BOB, SOLO_ID)

    outside = quest(client, ALICE, SOLO_ID)
    assert outside["participants"] is None
    assert outside["participant_count"] == 1

    inside = join(client, ALICE, SOLO_ID)
    assert inside["participants"] == [
        {"username": "bob-id", "display_name": "Bob", "shared_hobbies": []}]
    assert inside["participant_count"] == 1  # never counts the viewer
    listed = next(q for q in client.get("/quests", headers=ALICE).json()
                  if q["id"] == SOLO_ID)
    assert listed["participants"] == inside["participants"]

    # Other quests are unaffected.
    assert join(client, ALICE, QUIZ_ID)["participants"] == []


def test_participants_need_to_opt_in_to_be_named(client):
    opt_in(client, BOB)
    for player in (ALICE, BOB, CAROL):
        join(client, player, SOLO_ID)

    view = quest(client, ALICE, SOLO_ID)
    assert names(view) == ["Bob"]
    assert view["participant_count"] == 2  # Carol is counted, not named
    assert "carol-id" not in client.get(f"/quests/{SOLO_ID}", headers=ALICE).text
    # Alice did not opt in either, so Bob can't see her name.
    assert names(quest(client, BOB, SOLO_ID)) == []

    opt_in(client, BOB, discoverable=False)
    assert names(quest(client, ALICE, SOLO_ID)) == []


def test_participants_with_shared_hobbies_come_first(client):
    opt_in(client, ALICE, ["chess", "hiking"], discoverable=False)
    opt_in(client, BOB, ["music"])
    opt_in(client, CAROL, ["hiking", "chess", "coding"])
    opt_in(client, DAVE, ["hiking"])
    for player in (ALICE, BOB, CAROL, DAVE):
        join(client, player, SOLO_ID)

    people = quest(client, ALICE, SOLO_ID)["participants"]
    assert [p["display_name"] for p in people] == ["Carol", "Dave", "Bob"]
    assert people[0]["shared_hobbies"] == ["Chess", "Hiking"]
    assert people[2]["shared_hobbies"] == []


def test_finished_and_departed_players_are_not_listed(client):
    set_quest(SOLO_ID, requires_approval=True)
    for player in (BOB, CAROL, DAVE):
        opt_in(client, player)
        join(client, player, SOLO_ID)
    join(client, ALICE, SOLO_ID)
    assert names(quest(client, ALICE, SOLO_ID)) == ["Bob", "Carol", "Dave"]

    post_action(client, BOB, SOLO_ID, "leave")
    post_action(client, CAROL, SOLO_ID, "complete")  # now waiting for review
    view = quest(client, ALICE, SOLO_ID)
    assert names(view) == ["Dave"]
    assert view["participant_count"] == 1

    # Carol is done herself, so the list is gone for her until she retries.
    assert quest(client, CAROL, SOLO_ID)["participants"] is None
    claim = client.get("/admin/completions", headers=ADMIN).json()[0]
    client.post(f"/admin/completions/{claim['id']}/review", headers=ADMIN,
                json={"approve": False})
    assert names(quest(client, CAROL, SOLO_ID)) == ["Dave"]
    assert names(quest(client, ALICE, SOLO_ID)) == ["Carol", "Dave"]

    set_quest(SOLO_ID, requires_approval=False)
    post_action(client, DAVE, SOLO_ID, "complete")
    assert names(quest(client, ALICE, SOLO_ID)) == ["Carol"]
    assert quest(client, DAVE, SOLO_ID)["participants"] is None


def test_meetup_participants_are_the_players_coming(client):
    make_live()
    opt_in(client, BOB)
    for player in (BOB, CAROL):
        post_action(client, player, MEETUP_ID, "rsvp", attending=True)

    assert quest(client, ALICE, MEETUP_ID)["participants"] is None
    view = post_action(client, ALICE, MEETUP_ID, "rsvp", attending=True).json()["quest"]
    assert names(view) == ["Bob"]
    assert view["participant_count"] == 2

    # Checking in doesn't take anyone off the guest list.
    post_action(client, BOB, MEETUP_ID, "complete")
    post_action(client, ALICE, MEETUP_ID, "complete")
    assert names(quest(client, ALICE, MEETUP_ID)) == ["Bob"]

    now = utcnow()
    set_quest(MEETUP_ID, starts_at=now - timedelta(hours=2), ends_at=now - timedelta(hours=1))
    assert quest(client, ALICE, MEETUP_ID)["participants"] is None
