"""Tests for the features from EXTRA_FEATURES.md."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from sqlalchemy import create_engine, inspect, text

import database
from conftest import identity
from database import SessionLocal
from game import utcnow
from models import PairSession, Quest

ALICE = identity("alice-id", "Alice")
BOB = identity("bob-id", "Bob")
CAROL = identity("carol-id", "Carol")
ADMIN = identity("maintainer-id", "Maintainer")

SOLO_ID, PAIR_ID, QUIZ_ID, STEPS_ID, MEETUP_ID = 1, 4, 5, 6, 7
QUIZ_ANSWERS = [1, 2, 2]


def points(client, headers):
    return client.get("/me", headers=headers).json()["total_points"]


def set_quest(**fields):
    with SessionLocal() as db:
        quest = db.get(Quest, fields.pop("quest_id"))
        for key, value in fields.items():
            setattr(quest, key, value)
        db.commit()


def quest_input(**overrides):
    data = {
        "title": "Find the robot",
        "description": "Find the robot in the main hall and wave at it.",
        "location": "HG main hall",
        "points": 12,
        "kind": "solo",
    }
    data.update(overrides)
    return data


# --- Maintainer permissions and quest editor (#1) ---------------------------

def test_maintainer_flag(client):
    assert client.get("/me", headers=ADMIN).json()["is_maintainer"] is True
    assert client.get("/me", headers=ALICE).json()["is_maintainer"] is False


@pytest.mark.parametrize("method, path", [
    ("get", "/admin/quests"),
    ("post", "/admin/quests"),
    ("put", "/admin/quests/1"),
    ("post", "/admin/quests/1/status"),
    ("get", "/admin/completions"),
    ("post", "/admin/completions/1/review"),
    ("get", "/admin/reports"),
    ("post", "/admin/reports/1/resolve"),
])
def test_admin_endpoints_need_maintainer(client, method, path):
    response = client.request(method, path, headers=ALICE, json={})
    assert response.status_code == 403
    assert client.request(method, path, json={}).status_code == 401


def test_create_draft_publish_and_play(client):
    created = client.post("/admin/quests", headers=ADMIN, json=quest_input()).json()
    assert created["id"] >= 1000
    assert created["status"] == "draft"
    assert created["publish_problems"] == []

    # Drafts are invisible to players.
    ids = [q["id"] for q in client.get("/quests", headers=ALICE).json()]
    assert created["id"] not in ids
    assert client.get(f"/quests/{created['id']}", headers=ALICE).status_code == 404
    assert client.post(f"/quests/{created['id']}/complete", headers=ALICE).status_code == 404

    published = client.post(f"/admin/quests/{created['id']}/status", headers=ADMIN,
                            json={"status": "published"}).json()
    assert published["status"] == "published"
    ids = [q["id"] for q in client.get("/quests", headers=ALICE).json()]
    assert created["id"] in ids
    result = client.post(f"/quests/{created['id']}/complete", headers=ALICE).json()
    assert result["points_awarded"] == 12


def test_incomplete_quest_cannot_be_published(client):
    created = client.post("/admin/quests", headers=ADMIN, json=quest_input(
        kind="quiz", description="short", points=0)).json()
    assert len(created["publish_problems"]) == 3
    response = client.post(f"/admin/quests/{created['id']}/status", headers=ADMIN,
                           json={"status": "published"})
    assert response.status_code == 409
    assert "Can't publish" in response.json()["detail"]


def test_published_quest_cannot_be_edited_into_invalid_state(client):
    response = client.put(f"/admin/quests/{SOLO_ID}", headers=ADMIN,
                          json=quest_input(points=0))
    assert response.status_code == 409
    assert client.get(f"/quests/{SOLO_ID}", headers=ALICE).json()["points"] == 10


def test_invalid_input_is_rejected(client):
    bad_quiz = quest_input(kind="quiz", questions=[
        {"prompt": "?", "choices": ["a", "b"], "correct_index": 5}])
    assert client.post("/admin/quests", headers=ADMIN, json=bad_quiz).status_code == 422
    assert client.post("/admin/quests", headers=ADMIN,
                       json=quest_input(latitude=95, longitude=8.5)).status_code == 422
    assert client.post("/admin/quests", headers=ADMIN,
                       json=quest_input(kind="dance")).status_code == 422


def test_editing_points_keeps_awarded_points(client):
    client.post(f"/quests/{SOLO_ID}/complete", headers=ALICE)
    client.put(f"/admin/quests/{SOLO_ID}", headers=ADMIN, json=quest_input(points=99))
    assert points(client, ALICE) == 10
    client.post(f"/quests/{SOLO_ID}/complete", headers=BOB)
    assert points(client, BOB) == 99


def test_retiring_keeps_progress(client):
    client.post(f"/quests/{SOLO_ID}/complete", headers=ALICE)
    client.post(f"/admin/quests/{SOLO_ID}/status", headers=ADMIN, json={"status": "retired"})

    assert SOLO_ID not in [q["id"] for q in client.get("/quests", headers=ALICE).json()]
    assert points(client, ALICE) == 10
    # The player who completed it can still open it; others can't.
    assert client.get(f"/quests/{SOLO_ID}", headers=ALICE).json()["completed"] is True
    assert client.get(f"/quests/{SOLO_ID}", headers=BOB).status_code == 404
    assert client.post(f"/quests/{SOLO_ID}/complete", headers=BOB).status_code == 404


def test_kind_cannot_change_after_completions(client):
    client.post(f"/quests/{SOLO_ID}/complete", headers=ALICE)
    response = client.put(f"/admin/quests/{SOLO_ID}", headers=ADMIN, json=quest_input(
        kind="multi_step", steps=[{"title": "a"}, {"title": "b"}]))
    assert response.status_code == 409


def test_steps_can_be_reworded_but_not_restructured_after_progress(client):
    quest = client.get(f"/quests/{STEPS_ID}", headers=ALICE).json()
    client.post(f"/quests/{STEPS_ID}/steps/{quest['steps'][0]['id']}/complete", headers=ALICE)

    steps = [{"title": f"Step {n}", "description": ""} for n in (1, 2, 3)]
    edit = quest_input(kind="multi_step", steps=steps)
    assert client.put(f"/admin/quests/{STEPS_ID}", headers=ADMIN, json=edit).status_code == 200
    reloaded = client.get(f"/quests/{STEPS_ID}", headers=ALICE).json()
    assert [s["title"] for s in reloaded["steps"]] == ["Step 1", "Step 2", "Step 3"]
    assert reloaded["steps"][0]["done"] is True

    edit = quest_input(kind="multi_step", steps=steps[:2])
    assert client.put(f"/admin/quests/{STEPS_ID}", headers=ADMIN, json=edit).status_code == 409


def test_admin_sees_answers_players_do_not(client):
    admin_view = client.get(f"/admin/quests/{QUIZ_ID}", headers=ADMIN).json()
    assert [q["correct_index"] for q in admin_view["questions"]] == QUIZ_ANSWERS
    player_view = client.get(f"/quests/{QUIZ_ID}", headers=ALICE).text
    assert "correct_index" not in player_view


# --- Player submissions and reports (#2) ------------------------------------

SUBMISSION = {"title": "Sing in the hall", "description": "Sing one song in the main hall."}


def test_submission_review_flow(client):
    submitted = client.post("/submissions", headers=ALICE, json=SUBMISSION)
    assert submitted.status_code == 201
    quest_id = submitted.json()["id"]
    assert submitted.json()["status"] == "pending_review"
    assert quest_id not in [q["id"] for q in client.get("/quests", headers=BOB).json()]
    # The author can see their own submission, others can't.
    assert client.get(f"/quests/{quest_id}", headers=ALICE).status_code == 200
    assert client.get(f"/quests/{quest_id}", headers=BOB).status_code == 404

    pending = client.get("/admin/quests?status_filter=pending_review", headers=ADMIN).json()
    assert [q["id"] for q in pending] == [quest_id]
    assert pending[0]["author_name"] == "Alice"

    rejected = client.post(f"/admin/quests/{quest_id}/status", headers=ADMIN,
                           json={"status": "rejected", "note": "Too loud for the library."})
    assert rejected.json()["status"] == "rejected"
    mine = client.get("/submissions/mine", headers=ALICE).json()
    assert mine[0]["status"] == "rejected"
    assert mine[0]["review_note"] == "Too loud for the library."


def test_submission_can_be_published(client):
    quest_id = client.post("/submissions", headers=ALICE, json=SUBMISSION).json()["id"]
    client.post(f"/admin/quests/{quest_id}/status", headers=ADMIN, json={"status": "published"})
    quest = client.get(f"/quests/{quest_id}", headers=BOB).json()
    assert quest["author_name"] == "Alice"
    assert client.get("/submissions/mine", headers=ALICE).json()[0]["status"] == "published"


def test_submission_validation_and_limit(client):
    assert client.post("/submissions", headers=ALICE,
                       json={"title": "x", "description": "short"}).status_code == 422
    for _ in range(5):
        assert client.post("/submissions", headers=ALICE, json=SUBMISSION).status_code == 201
    assert client.post("/submissions", headers=ALICE, json=SUBMISSION).status_code == 409


def test_only_pending_submissions_can_be_rejected(client):
    response = client.post(f"/admin/quests/{SOLO_ID}/status", headers=ADMIN,
                           json={"status": "rejected"})
    assert response.status_code == 409


def test_report_and_remove_quest(client):
    client.post(f"/quests/{SOLO_ID}/complete", headers=ALICE)
    report = {"reason": "This is offensive."}
    assert client.post(f"/quests/{SOLO_ID}/report", headers=BOB, json=report).status_code == 204
    assert client.post(f"/quests/{SOLO_ID}/report", headers=BOB, json=report).status_code == 409
    client.post(f"/quests/{SOLO_ID}/report", headers=CAROL, json=report)
    assert client.get(f"/quests/{SOLO_ID}", headers=BOB).json()["reported"] is True

    reports = client.get("/admin/reports", headers=ADMIN).json()
    assert len(reports) == 2
    assert reports[0]["reporter_name"] == "Bob"
    resolved = client.post(f"/admin/reports/{reports[0]['id']}/resolve", headers=ADMIN,
                           json={"retire_quest": True}).json()
    assert resolved["status"] == "retired"
    assert client.get("/admin/reports", headers=ADMIN).json() == []
    assert points(client, ALICE) == 10  # progress survives removal


def test_report_can_be_dismissed(client):
    client.post(f"/quests/{SOLO_ID}/report", headers=BOB, json={"reason": "Not sure."})
    report_id = client.get("/admin/reports", headers=ADMIN).json()[0]["id"]
    client.post(f"/admin/reports/{report_id}/resolve", headers=ADMIN, json={"retire_quest": False})
    assert client.get("/admin/reports", headers=ADMIN).json() == []
    assert client.get(f"/quests/{SOLO_ID}", headers=ALICE).json()["status"] == "published"


# --- Maintainer-approved completion (#3) ------------------------------------

def make_approval_quest():
    set_quest(quest_id=SOLO_ID, requires_approval=True)


def test_pending_completion_awards_nothing_until_approved(client):
    make_approval_quest()
    result = client.post(f"/quests/{SOLO_ID}/complete", headers=ALICE,
                         json={"note": "Photo is on my phone"}).json()
    assert result["status"] == "pending"
    assert result["completed"] is False
    assert result["points_awarded"] == 0
    assert points(client, ALICE) == 0
    quest = client.get(f"/quests/{SOLO_ID}", headers=ALICE).json()
    assert quest["completion_status"] == "pending"
    assert quest["completed"] is False

    pending = client.get("/admin/completions", headers=ADMIN).json()
    assert pending[0]["note"] == "Photo is on my phone"
    reviewed = client.post(f"/admin/completions/{pending[0]['id']}/review", headers=ADMIN,
                           json={"approve": True})
    assert reviewed.json()["status"] == "approved"
    assert points(client, ALICE) == 10

    # Approving again can't award twice.
    again = client.post(f"/admin/completions/{pending[0]['id']}/review", headers=ADMIN,
                        json={"approve": True})
    assert again.status_code == 409
    assert points(client, ALICE) == 10
    assert client.get("/admin/completions", headers=ADMIN).json() == []


def test_rejected_completion_shows_reason_and_can_be_resubmitted(client):
    make_approval_quest()
    client.post(f"/quests/{SOLO_ID}/complete", headers=ALICE)
    completion_id = client.get("/admin/completions", headers=ADMIN).json()[0]["id"]
    client.post(f"/admin/completions/{completion_id}/review", headers=ADMIN,
                json={"approve": False, "note": "Please add a photo description."})

    quest = client.get(f"/quests/{SOLO_ID}", headers=ALICE).json()
    assert quest["completion_status"] == "rejected"
    assert quest["review_note"] == "Please add a photo description."
    assert points(client, ALICE) == 0

    resubmitted = client.post(f"/quests/{SOLO_ID}/complete", headers=ALICE,
                              json={"note": "Me at the railing"}).json()
    assert resubmitted["status"] == "pending"
    assert client.get(f"/quests/{SOLO_ID}", headers=ALICE).json()["review_note"] is None


def test_double_submit_on_approval_quest(client):
    make_approval_quest()
    client.post(f"/quests/{SOLO_ID}/complete", headers=ALICE)
    again = client.post(f"/quests/{SOLO_ID}/complete", headers=ALICE).json()
    assert again["already_completed"] is True
    assert len(client.get("/admin/completions", headers=ADMIN).json()) == 1


# --- Multi-step quests (#4) --------------------------------------------------

def test_steps_in_order_and_reward_once(client):
    steps = client.get(f"/quests/{STEPS_ID}", headers=ALICE).json()["steps"]
    assert len(steps) == 3

    out_of_order = client.post(f"/quests/{STEPS_ID}/steps/{steps[1]['id']}/complete",
                               headers=ALICE)
    assert out_of_order.status_code == 409
    assert out_of_order.json()["detail"] == "Do step 1 first."

    first = client.post(f"/quests/{STEPS_ID}/steps/{steps[0]['id']}/complete",
                        headers=ALICE).json()
    assert first == {"step_id": steps[0]["id"], "steps_done": 1, "steps_total": 3,
                     "completion": None}
    assert points(client, ALICE) == 0  # no points per step

    # Progress survives (new request = refresh).
    reloaded = client.get(f"/quests/{STEPS_ID}", headers=ALICE).json()
    assert [s["done"] for s in reloaded["steps"]] == [True, False, False]
    assert reloaded["completed"] is False

    client.post(f"/quests/{STEPS_ID}/steps/{steps[1]['id']}/complete", headers=ALICE)
    last = client.post(f"/quests/{STEPS_ID}/steps/{steps[2]['id']}/complete",
                       headers=ALICE).json()
    assert last["completion"]["points_awarded"] == 30
    assert points(client, ALICE) == 30

    repeat = client.post(f"/quests/{STEPS_ID}/steps/{steps[2]['id']}/complete",
                         headers=ALICE).json()
    assert repeat["completion"]["already_completed"] is True
    assert points(client, ALICE) == 30


def test_step_endpoints_reject_wrong_quest_or_step(client):
    assert client.post(f"/quests/{SOLO_ID}/steps/1/complete", headers=ALICE).status_code == 400
    assert client.post(f"/quests/{STEPS_ID}/steps/9999/complete",
                       headers=ALICE).status_code == 404
    assert client.post(f"/quests/{STEPS_ID}/complete", headers=ALICE).status_code == 400


# --- Pair quests (#5) --------------------------------------------------------

def test_pair_quest_completes_for_both(client):
    session = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE).json()
    assert session["state"] == "waiting"
    assert session["is_host"] is True
    assert len(session["code"]) == 6

    preview = client.get(f"/pair/{session['code'].lower()}", headers=BOB).json()
    assert preview["host_name"] == "Alice"
    assert preview["is_host"] is False

    joined = client.post(f"/pair/{session['code']}/join", headers=BOB).json()
    assert joined["completion"]["points_awarded"] == 25
    assert joined["session"]["state"] == "completed"
    assert joined["session"]["partner_name"] == "Bob"
    assert points(client, ALICE) == 25
    assert points(client, BOB) == 25

    host_view = client.get(f"/quests/{PAIR_ID}/pair", headers=ALICE).json()
    assert host_view["state"] == "completed"
    assert host_view["partner_name"] == "Bob"


def test_one_account_cannot_complete_pair_alone(client):
    code = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE).json()["code"]
    response = client.post(f"/pair/{code}/join", headers=ALICE)
    assert response.status_code == 400
    assert client.post(f"/quests/{PAIR_ID}/complete", headers=ALICE).status_code == 400
    assert points(client, ALICE) == 0


def test_invalid_expired_cancelled_and_used_codes(client):
    assert client.post("/pair/NOPE42/join", headers=BOB).status_code == 404

    code = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE).json()["code"]
    with SessionLocal() as db:
        session = db.query(PairSession).filter_by(code=code).one()
        session.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    expired = client.post(f"/pair/{code}/join", headers=BOB)
    assert expired.status_code == 410
    assert "expired" in expired.json()["detail"]

    code = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE).json()["code"]
    client.delete(f"/quests/{PAIR_ID}/pair", headers=ALICE)
    assert client.post(f"/pair/{code}/join", headers=BOB).status_code == 410

    code = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE).json()["code"]
    client.post(f"/pair/{code}/join", headers=BOB)
    assert client.post(f"/pair/{code}/join", headers=CAROL).status_code == 409
    # Bob retrying his own join is harmless.
    retry = client.post(f"/pair/{code}/join", headers=BOB)
    assert retry.status_code == 200
    assert retry.json()["completion"]["already_completed"] is True
    assert points(client, BOB) == 25


def test_new_code_replaces_old_one(client):
    old = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE).json()["code"]
    client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE)
    assert client.post(f"/pair/{old}/join", headers=BOB).status_code == 410


def test_completed_players_can_help_others_without_earning_again(client):
    code = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE).json()["code"]
    client.post(f"/pair/{code}/join", headers=BOB)

    # As host again: the new partner earns, the host doesn't.
    code = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE).json()["code"]
    dan = identity("dan-id", "Dan")
    assert client.post(f"/pair/{code}/join", headers=dan).json()["completion"]["points_awarded"] == 25
    assert points(client, ALICE) == 25

    code = client.post(f"/quests/{PAIR_ID}/pair", headers=CAROL).json()["code"]
    helped = client.post(f"/pair/{code}/join", headers=ALICE).json()
    assert helped["completion"]["points_awarded"] == 0
    assert points(client, ALICE) == 25
    assert points(client, CAROL) == 25


def test_simultaneous_joins_have_one_winner(client):
    code = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE).json()["code"]
    players = [identity(f"player-{n}", f"Player {n}") for n in range(8)]
    for headers in players:
        client.get("/me", headers=headers)

    with ThreadPoolExecutor(max_workers=8) as pool:
        statuses = list(pool.map(
            lambda h: client.post(f"/pair/{code}/join", headers=h).status_code, players))
    assert sorted(statuses) == [200] + [409] * 7
    assert points(client, ALICE) == 25
    assert sum(points(client, h) for h in players) == 25


# --- Meetups (#6) ------------------------------------------------------------

def schedule_meetup(start_offset_minutes, length_minutes=30, cancelled=False):
    start = utcnow() + timedelta(minutes=start_offset_minutes)
    set_quest(quest_id=MEETUP_ID, starts_at=start,
              ends_at=start + timedelta(minutes=length_minutes), cancelled=cancelled)


def test_meetup_check_in_window(client):
    schedule_meetup(60)
    quest = client.get(f"/quests/{MEETUP_ID}", headers=ALICE).json()
    assert quest["meetup_state"] == "upcoming"
    assert quest["starts_at"].endswith("Z") or quest["starts_at"].endswith("+00:00")
    early = client.post(f"/quests/{MEETUP_ID}/complete", headers=ALICE)
    assert early.status_code == 409
    assert "15 minutes" in early.json()["detail"]

    schedule_meetup(10)  # within the 15-minute early window
    assert client.get(f"/quests/{MEETUP_ID}", headers=ALICE).json()["meetup_state"] == "live"
    assert client.post(f"/quests/{MEETUP_ID}/complete",
                       headers=ALICE).json()["points_awarded"] == 20

    schedule_meetup(-60)
    assert client.get(f"/quests/{MEETUP_ID}", headers=BOB).json()["meetup_state"] == "past"
    assert client.post(f"/quests/{MEETUP_ID}/complete", headers=BOB).status_code == 409
    # Already checked in: repeating is still fine and awards nothing.
    again = client.post(f"/quests/{MEETUP_ID}/complete", headers=ALICE).json()
    assert again["already_completed"] is True


def test_cancelled_meetup(client):
    schedule_meetup(0, cancelled=True)
    quest = client.get(f"/quests/{MEETUP_ID}", headers=ALICE).json()
    assert quest["meetup_state"] == "cancelled"
    assert client.post(f"/quests/{MEETUP_ID}/complete", headers=ALICE).status_code == 409
    assert client.post(f"/quests/{MEETUP_ID}/rsvp", headers=ALICE).status_code == 409


def test_meetup_rsvp(client):
    schedule_meetup(120)
    assert client.post(f"/quests/{MEETUP_ID}/rsvp", headers=ALICE).json() == {
        "rsvp": True, "rsvp_count": 1}
    client.post(f"/quests/{MEETUP_ID}/rsvp", headers=ALICE)  # idempotent
    client.post(f"/quests/{MEETUP_ID}/rsvp", headers=BOB)
    quest = client.get(f"/quests/{MEETUP_ID}", headers=ALICE).json()
    assert quest["rsvp"] is True
    assert quest["rsvp_count"] == 2
    assert client.delete(f"/quests/{MEETUP_ID}/rsvp", headers=ALICE).json() == {
        "rsvp": False, "rsvp_count": 1}
    assert client.post(f"/quests/{SOLO_ID}/rsvp", headers=ALICE).status_code == 400


def test_meetup_editor_stores_utc(client):
    edit = quest_input(kind="meetup", starts_at="2026-10-11T11:00:00+02:00",
                       ends_at="2026-10-11T12:00:00+02:00")
    saved = client.put(f"/admin/quests/{MEETUP_ID}", headers=ADMIN, json=edit).json()
    assert saved["starts_at"].startswith("2026-10-11T09:00:00")

    backwards = quest_input(kind="meetup", starts_at="2026-10-11T12:00:00Z",
                            ends_at="2026-10-11T11:00:00Z")
    assert client.put(f"/admin/quests/{MEETUP_ID}", headers=ADMIN,
                      json=backwards).status_code == 409


# --- Map pins (#7) -----------------------------------------------------------

def test_map_pins(client):
    quests = {q["id"]: q for q in client.get("/quests", headers=ALICE).json()}
    assert 47.37 < quests[SOLO_ID]["latitude"] < 47.38  # ETH Zentrum
    assert 8.54 < quests[SOLO_ID]["longitude"] < 8.55
    assert quests[2]["latitude"] is None  # "anywhere" quests have no pin
    half_pin = client.put(f"/admin/quests/{SOLO_ID}", headers=ADMIN,
                          json=quest_input(latitude=47.376))
    assert half_pin.status_code == 409


# --- Hobbies and suggestions (#8) --------------------------------------------

def set_profile(client, headers, hobbies, discoverable=True):
    return client.put("/me/profile", headers=headers,
                      json={"hobbies": hobbies, "discoverable": discoverable})


def test_hobbies_are_optional_and_validated(client):
    me = client.get("/me", headers=ALICE).json()
    assert me["hobbies"] == [] and me["discoverable"] is False
    assert len(client.get("/hobbies", headers=ALICE).json()) >= 10
    assert set_profile(client, ALICE, ["napping"]).status_code == 400
    saved = set_profile(client, ALICE, ["hiking", "chess", "chess"]).json()
    assert saved["hobbies"] == ["chess", "hiking"]
    assert set_profile(client, ALICE, [], False).json()["hobbies"] == []


def test_suggestions_need_opt_in_and_shared_hobbies(client):
    set_profile(client, ALICE, ["chess", "hiking", "music"])
    set_profile(client, BOB, ["chess", "hiking"])
    set_profile(client, CAROL, ["chess"], discoverable=False)  # hidden
    set_profile(client, identity("dan-id", "Dan"), ["running"])  # nothing shared

    result = client.get("/suggestions", headers=ALICE).json()
    assert result["enabled"] is True
    assert result["suggestions"] == [{
        "player_id": client.get("/me", headers=BOB).json()["id"],
        "display_name": "Bob",
        "shared_hobbies": ["Chess", "Hiking"],
    }]
    # Not opted in: no suggestions for Carol either.
    assert client.get("/suggestions", headers=CAROL).json() == {
        "enabled": False, "suggestions": []}


def test_suggestions_can_be_dismissed(client):
    set_profile(client, ALICE, ["chess"])
    set_profile(client, BOB, ["chess"])
    bob_id = client.get("/me", headers=BOB).json()["id"]
    assert client.post(f"/suggestions/{bob_id}/dismiss", headers=ALICE).status_code == 204
    assert client.post(f"/suggestions/{bob_id}/dismiss", headers=ALICE).status_code == 204
    assert client.get("/suggestions", headers=ALICE).json()["suggestions"] == []
    alice_id = client.get("/me", headers=ALICE).json()["id"]
    assert client.post(f"/suggestions/{alice_id}/dismiss", headers=ALICE).status_code == 400


def test_removing_hobbies_removes_from_suggestions(client):
    set_profile(client, ALICE, ["chess"])
    set_profile(client, BOB, ["chess"])
    set_profile(client, BOB, [], discoverable=True)
    assert client.get("/suggestions", headers=ALICE).json()["suggestions"] == []


# --- Quizzes (#10) -----------------------------------------------------------

def test_quiz_checks_answers_and_allows_retries(client):
    quest = client.get(f"/quests/{QUIZ_ID}", headers=ALICE).json()
    assert len(quest["questions"]) == 3
    assert all(len(q["choices"]) == 4 for q in quest["questions"])

    wrong = client.post(f"/quests/{QUIZ_ID}/quiz", headers=ALICE,
                        json={"answers": [0, 2, 2]}).json()
    assert wrong == {"passed": False, "correct_count": 2, "total": 3,
                     "correct": [False, True, True], "completion": None}
    assert points(client, ALICE) == 0

    right = client.post(f"/quests/{QUIZ_ID}/quiz", headers=ALICE,
                        json={"answers": QUIZ_ANSWERS}).json()
    assert right["passed"] is True
    assert right["completion"]["points_awarded"] == 15

    again = client.post(f"/quests/{QUIZ_ID}/quiz", headers=ALICE,
                        json={"answers": QUIZ_ANSWERS}).json()
    assert again["completion"]["already_completed"] is True
    assert points(client, ALICE) == 15


def test_quiz_needs_every_answer(client):
    response = client.post(f"/quests/{QUIZ_ID}/quiz", headers=ALICE, json={"answers": [1]})
    assert response.status_code == 400
    assert client.post(f"/quests/{QUIZ_ID}/complete", headers=ALICE).status_code == 400


# --- Badges (#12) ------------------------------------------------------------

def test_badges_follow_progress(client):
    badges = {b["key"]: b for b in client.get("/me/badges", headers=ALICE).json()}
    assert not any(b["earned"] for b in badges.values())

    client.post(f"/quests/{QUIZ_ID}/quiz", headers=ALICE, json={"answers": QUIZ_ANSWERS})
    code = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE).json()["code"]
    client.post(f"/pair/{code}/join", headers=BOB)

    badges = {b["key"]: b for b in client.get("/me/badges", headers=ALICE).json()}
    assert badges["first_quest"]["earned"] and badges["first_quest"]["earned_at"]
    assert badges["quiz"]["earned"]
    assert badges["social"]["earned"]
    assert not badges["explorer"]["earned"]
    assert not badges["century"]["earned"]


def test_pending_completions_do_not_earn_badges(client):
    make_approval_quest()
    client.post(f"/quests/{SOLO_ID}/complete", headers=ALICE)
    badges = {b["key"]: b for b in client.get("/me/badges", headers=ALICE).json()}
    assert badges["first_quest"]["earned"] is False


def test_leaderboard_ignores_pending_points(client):
    make_approval_quest()
    client.post(f"/quests/{SOLO_ID}/complete", headers=ALICE)
    board = client.get("/leaderboard", headers=ALICE).json()
    assert board["entries"] == []
    assert board["current_player"]["points"] == 0


# --- Migration from the MVP database ----------------------------------------

def test_mvp_database_is_upgraded(tmp_path, monkeypatch):
    mvp_engine = create_engine(f"sqlite:///{tmp_path / 'mvp.db'}")
    with mvp_engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(255) NOT NULL, "
            "viscon_user_id VARCHAR(255))"))
        connection.execute(text(
            "CREATE TABLE quests (id INTEGER PRIMARY KEY, title VARCHAR(255) NOT NULL, "
            "description TEXT NOT NULL, location VARCHAR(255), points INTEGER NOT NULL)"))
        connection.execute(text(
            "CREATE TABLE completions (id INTEGER PRIMARY KEY, player_id INTEGER, "
            "quest_id INTEGER, completed_at DATETIME, points_awarded INTEGER)"))
        connection.execute(text("INSERT INTO users VALUES (1, 'Alice', 'alice-id')"))
        connection.execute(text("INSERT INTO quests VALUES (1, 'Old', 'Old quest', NULL, 10)"))
        connection.execute(text(
            "INSERT INTO completions VALUES (1, 1, 1, '2026-10-10 10:00:00', 10)"))

    monkeypatch.setattr(database, "engine", mvp_engine)
    database.upgrade_legacy_schema()
    database.upgrade_legacy_schema()

    columns = {c["name"] for c in inspect(mvp_engine).get_columns("quests")}
    assert {"kind", "status", "latitude", "starts_at"} <= columns
    with mvp_engine.connect() as connection:
        quest = connection.execute(text("SELECT kind, status FROM quests")).one()
        assert tuple(quest) == ("solo", "published")
        completion = connection.execute(text(
            "SELECT status, points_awarded FROM completions")).one()
        assert tuple(completion) == ("approved", 10)
        user = connection.execute(text("SELECT hobbies, discoverable FROM users")).one()
        assert tuple(user) == ("", 0)


# --- Review follow-ups: invitations and badge progress -----------------------

def test_invite_suggested_player_to_pair_quest(client):
    set_profile(client, ALICE, ["chess"])
    set_profile(client, BOB, ["chess"])
    bob_id = client.get("/me", headers=BOB).json()["id"]

    session = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE,
                          json={"invite_player_id": bob_id}).json()
    assert session["invited_name"] == "Bob"

    invites = client.get("/pair/invites", headers=BOB).json()
    assert [i["code"] for i in invites] == [session["code"]]
    assert invites[0]["host_name"] == "Alice"
    assert client.get("/pair/invites", headers=CAROL).json() == []

    client.post(f"/pair/{session['code']}/join", headers=BOB)
    assert client.get("/pair/invites", headers=BOB).json() == []
    assert points(client, ALICE) == points(client, BOB) == 25


def test_invites_need_both_players_opted_in(client):
    set_profile(client, ALICE, ["chess"])
    set_profile(client, BOB, ["chess"], discoverable=False)
    bob_id = client.get("/me", headers=BOB).json()["id"]
    alice_id = client.get("/me", headers=ALICE).json()["id"]
    hidden = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE, json={"invite_player_id": bob_id})
    assert hidden.status_code == 400
    self_invite = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE,
                              json={"invite_player_id": alice_id})
    assert self_invite.status_code == 400
    missing = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE, json={"invite_player_id": 9999})
    assert missing.status_code == 400


def test_expired_or_cancelled_invites_disappear(client):
    set_profile(client, ALICE, ["chess"])
    set_profile(client, BOB, ["chess"])
    bob_id = client.get("/me", headers=BOB).json()["id"]
    code = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE,
                       json={"invite_player_id": bob_id}).json()["code"]
    client.delete(f"/quests/{PAIR_ID}/pair", headers=ALICE)
    assert client.get("/pair/invites", headers=BOB).json() == []

    code = client.post(f"/quests/{PAIR_ID}/pair", headers=ALICE,
                       json={"invite_player_id": bob_id}).json()["code"]
    with SessionLocal() as db:
        db.query(PairSession).filter_by(code=code).one().expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert client.get("/pair/invites", headers=BOB).json() == []


def test_badge_progress(client):
    badges = {b["key"]: b for b in client.get("/me/badges", headers=ALICE).json()}
    assert (badges["explorer"]["progress"], badges["explorer"]["target"]) == (0, 5)
    assert (badges["century"]["progress"], badges["century"]["target"]) == (0, 100)
    assert (badges["meetup"]["progress"], badges["meetup"]["target"]) == (0, 1)

    client.post(f"/quests/{SOLO_ID}/complete", headers=ALICE)        # 10 points
    client.post(f"/quests/2/complete", headers=ALICE)                # 20 points
    badges = {b["key"]: b for b in client.get("/me/badges", headers=ALICE).json()}
    assert badges["explorer"]["progress"] == 2
    assert badges["century"]["progress"] == 30
    assert badges["first_quest"]["progress"] == badges["first_quest"]["target"] == 1


def test_player_profile_of_self(client):
    me = client.get("/me", headers=ALICE).json()
    assert client.get(f"/players/{me['id']}", headers=ALICE).json() == me


def test_player_profile_requires_opt_in(client):
    bob = client.get("/me", headers=BOB).json()

    # Bob has not opted in, so he is hidden from others.
    assert client.get(f"/players/{bob['id']}", headers=ALICE).status_code == 404

    client.put("/me/profile", headers=BOB, json={"hobbies": ["chess"], "discoverable": True})
    seen = client.get(f"/players/{bob['id']}", headers=ALICE).json()
    assert seen["display_name"] == "Bob"
    assert seen["hobbies"] == ["chess"]
    assert seen["is_maintainer"] is False


def test_player_profile_hides_maintainer_flag(client):
    admin = client.get("/me", headers=ADMIN).json()
    assert admin["is_maintainer"] is True
    client.put("/me/profile", headers=ADMIN, json={"hobbies": [], "discoverable": True})
    seen = client.get(f"/players/{admin['id']}", headers=ALICE).json()
    assert seen["is_maintainer"] is False


def test_player_profile_unknown_player_and_missing_identity(client):
    assert client.get("/players/99999", headers=ALICE).status_code == 404
    assert client.get("/players/abc", headers=ALICE).status_code == 422
    assert client.get("/players/1").status_code == 401


def test_player_search_finds_only_opted_in_players(client):
    client.get("/me", headers=ALICE)
    set_profile(client, BOB, [], discoverable=True)
    set_profile(client, CAROL, [], discoverable=False)  # hidden

    found = client.get("/players/search", params={"q": "bo"}, headers=ALICE).json()
    assert [r["display_name"] for r in found] == ["Bob"]
    assert client.get("/players/search", params={"q": "car"}, headers=ALICE).json() == []
    # Case-insensitive, and never returns the searcher.
    set_profile(client, ALICE, [], discoverable=True)
    assert client.get("/players/search", params={"q": "ALI"}, headers=ALICE).json() == []


def test_player_search_validates_query_and_treats_wildcards_literally(client):
    set_profile(client, BOB, [], discoverable=True)
    assert client.get("/players/search", params={"q": "b"}, headers=ALICE).status_code == 422
    assert client.get("/players/search", headers=ALICE).status_code == 422
    assert client.get("/players/search", params={"q": "bo"}).status_code == 401
    assert client.get("/players/search", params={"q": "%%"}, headers=ALICE).json() == []
    assert client.get("/players/search", params={"q": "__"}, headers=ALICE).json() == []
