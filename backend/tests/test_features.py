"""Quest kinds, pair sessions, maintainers, submissions, reports, connections, badges."""

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest

from conftest import act, identity
from database import SessionLocal
from game import utcnow
from models import PairSession, Quest
from quests import QUESTS

ALICE = identity("alice-id", "Alice")
BOB = identity("bob-id", "Bob")
CAROL = identity("carol-id", "Carol")
ADMIN = identity("maintainer-id", "Maintainer")

SOLO_ID, PAIR_ID, QUIZ_ID, STEPS_ID, MEETUP_ID = (
    str(QUESTS[number - 1]["id"]) for number in (1, 4, 5, 6, 7)
)
SECOND_QUEST_ID = str(QUESTS[1]["id"])
QUIZ_ANSWERS = [1, 2, 2]
MISSING = "00000000-0000-0000-0000-000000000001"


def me(client, headers):
    return client.get("/me", headers=headers).json()


def points(client, headers):
    return me(client, headers)["total_points"]


def badges(client, headers):
    return {b["key"]: b for b in me(client, headers)["badges"]}


def set_quest(quest_id, **fields):
    with SessionLocal() as db:
        quest = db.get(Quest, uuid.UUID(quest_id))
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


def patch(client, quest_id, **fields):
    return client.patch(f"/admin/quests/{quest_id}", headers=ADMIN, json=fields)


def start_pair(client, headers, **fields):
    return act(client, headers, PAIR_ID, "pair_start", **fields)


def pair_code(client, headers, **fields):
    return start_pair(client, headers, **fields).json()["quest"]["pair_session"]["code"]


# --- Maintainer permissions and quest editor ---------------------------------

def test_maintainer_flag(client):
    assert me(client, ADMIN)["is_maintainer"] is True
    assert me(client, ALICE)["is_maintainer"] is False


@pytest.mark.parametrize("method, path", [
    ("get", "/admin/quests"),
    ("get", f"/admin/quests/{SOLO_ID}"),
    ("post", "/admin/quests"),
    ("patch", f"/admin/quests/{SOLO_ID}"),
    ("get", "/admin/completions"),
    ("post", f"/admin/completions/{MISSING}/review"),
    ("get", "/admin/reports"),
    ("post", f"/admin/reports/{MISSING}/resolve"),
])
def test_admin_endpoints_need_maintainer(client, method, path):
    response = client.request(method, path, headers=ALICE, json={})
    assert response.status_code == 403
    assert client.request(method, path, json={}).status_code == 401


def test_admin_unknown_ids_are_404(client):
    assert client.get(f"/admin/quests/{MISSING}", headers=ADMIN).status_code == 404
    assert patch(client, MISSING, points=5).status_code == 404
    assert client.post(f"/admin/completions/{MISSING}/review", headers=ADMIN,
                       json={"approve": True}).status_code == 404
    assert client.post(f"/admin/reports/{MISSING}/resolve", headers=ADMIN,
                       json={"retire_quest": False}).status_code == 404


def test_create_draft_publish_and_play(client):
    created = client.post("/admin/quests", headers=ADMIN, json=quest_input())
    assert created.status_code == 201
    created = created.json()
    uuid.UUID(created["id"])
    assert created["status"] == "draft"
    assert created["publish_problems"] == []

    # Drafts are invisible to players.
    assert created["id"] not in [q["id"] for q in client.get("/quests", headers=ALICE).json()]
    assert client.get(f"/quests/{created['id']}", headers=ALICE).status_code == 404
    assert act(client, ALICE, created["id"], "complete").status_code == 404

    published = patch(client, created["id"], status="published").json()
    assert published["status"] == "published"
    assert created["id"] in [q["id"] for q in client.get("/quests", headers=ALICE).json()]
    result = act(client, ALICE, created["id"], "complete").json()
    assert result["completion"]["points_awarded"] == 12


def test_create_as_published(client):
    created = client.post("/admin/quests", headers=ADMIN,
                          json=quest_input(status="published")).json()
    assert created["status"] == "published"
    assert created["id"] in [q["id"] for q in client.get("/quests", headers=ALICE).json()]

    before = len(client.get("/admin/quests", headers=ADMIN).json())
    invalid = client.post("/admin/quests", headers=ADMIN,
                          json=quest_input(points=0, status="published"))
    assert invalid.status_code == 409
    assert len(client.get("/admin/quests", headers=ADMIN).json()) == before
    assert client.post("/admin/quests", headers=ADMIN,
                       json=quest_input(status="retired")).status_code == 422


def test_admin_list_newest_first_and_filter(client):
    created = client.post("/admin/quests", headers=ADMIN, json=quest_input()).json()
    quests = client.get("/admin/quests", headers=ADMIN).json()
    assert quests[0]["id"] == created["id"]
    assert len(quests) == len(QUESTS) + 1
    drafts = client.get("/admin/quests?status=draft", headers=ADMIN).json()
    assert [q["id"] for q in drafts] == [created["id"]]
    assert client.get("/admin/quests?status=bogus", headers=ADMIN).status_code == 422
    assert client.get("/admin/completions?status=bogus", headers=ADMIN).status_code == 422


def test_incomplete_quest_cannot_be_published(client):
    created = client.post("/admin/quests", headers=ADMIN, json=quest_input(
        kind="quiz", description="short", points=0)).json()
    assert len(created["publish_problems"]) == 3
    response = patch(client, created["id"], status="published")
    assert response.status_code == 409
    assert "Can't publish" in response.json()["detail"]
    assert client.get(f"/admin/quests/{created['id']}", headers=ADMIN).json()["status"] == "draft"


def test_patch_changes_only_sent_fields(client):
    before = client.get(f"/admin/quests/{QUIZ_ID}", headers=ADMIN).json()
    after = patch(client, QUIZ_ID, points=40, location=None).json()
    assert after["points"] == 40
    assert after["location"] is None
    for field in ("title", "description", "kind", "status", "questions"):
        assert after[field] == before[field]
    assert patch(client, QUIZ_ID).json()["points"] == 40  # empty patch is a no-op


def test_patch_validation(client):
    assert patch(client, SOLO_ID, title=None).status_code == 422
    assert patch(client, SOLO_ID, points=-1).status_code == 422
    assert patch(client, SOLO_ID, status="pending_review").status_code == 422
    assert patch(client, SOLO_ID, latitude=95).status_code == 422
    # Merged result is validated too: a quiz question pointing past its choices.
    bad = [{"prompt": "?", "choices": ["a", "b"], "correct_index": 5}]
    assert patch(client, QUIZ_ID, questions=bad).status_code == 422


def test_published_quest_cannot_be_edited_into_invalid_state(client):
    response = patch(client, SOLO_ID, points=0)
    assert response.status_code == 409
    assert client.get(f"/quests/{SOLO_ID}", headers=ALICE).json()["points"] == 10


def test_invalid_create_input_is_rejected(client):
    bad_quiz = quest_input(kind="quiz", questions=[
        {"prompt": "?", "choices": ["a", "b"], "correct_index": 5}])
    assert client.post("/admin/quests", headers=ADMIN, json=bad_quiz).status_code == 422
    assert client.post("/admin/quests", headers=ADMIN,
                       json=quest_input(latitude=95, longitude=8.5)).status_code == 422
    assert client.post("/admin/quests", headers=ADMIN,
                       json=quest_input(kind="dance")).status_code == 422


def test_editing_points_keeps_awarded_points(client):
    act(client, ALICE, SOLO_ID, "complete")
    patch(client, SOLO_ID, points=99)
    assert points(client, ALICE) == 10
    act(client, BOB, SOLO_ID, "complete")
    assert points(client, BOB) == 99


def test_retiring_keeps_progress(client):
    act(client, ALICE, SOLO_ID, "complete")
    assert patch(client, SOLO_ID, status="retired").json()["status"] == "retired"

    assert SOLO_ID not in [q["id"] for q in client.get("/quests", headers=ALICE).json()]
    assert points(client, ALICE) == 10
    # The player who completed it can still open it; others can't.
    assert client.get(f"/quests/{SOLO_ID}", headers=ALICE).json()["completed"] is True
    assert client.get(f"/quests/{SOLO_ID}", headers=BOB).status_code == 404
    assert act(client, BOB, SOLO_ID, "complete").status_code == 404


def test_kind_cannot_change_after_completions(client):
    act(client, ALICE, SOLO_ID, "complete")
    response = patch(client, SOLO_ID, kind="multi_step",
                     steps=[{"title": "a"}, {"title": "b"}])
    assert response.status_code == 409


def test_steps_can_be_reworded_but_not_restructured_after_progress(client):
    quest = client.get(f"/quests/{STEPS_ID}", headers=ALICE).json()
    act(client, ALICE, STEPS_ID, "step", step_id=quest["steps"][0]["id"])

    steps = [{"title": f"Step {n}", "description": ""} for n in (1, 2, 3)]
    assert patch(client, STEPS_ID, steps=steps).status_code == 200
    reloaded = client.get(f"/quests/{STEPS_ID}", headers=ALICE).json()
    assert [s["title"] for s in reloaded["steps"]] == ["Step 1", "Step 2", "Step 3"]
    assert reloaded["steps"][0]["done"] is True

    assert patch(client, STEPS_ID, steps=steps[:2]).status_code == 409


def test_admin_sees_answers_players_do_not(client):
    admin_view = client.get(f"/admin/quests/{QUIZ_ID}", headers=ADMIN).json()
    assert [q["correct_index"] for q in admin_view["questions"]] == QUIZ_ANSWERS
    assert "correct_index" not in client.get(f"/quests/{QUIZ_ID}", headers=ALICE).text


# --- Player submissions and reports -----------------------------------------

SUBMISSION = {"title": "Sing in the hall", "description": "Sing one song in the main hall."}


def test_submission_review_flow(client):
    submitted = client.post("/quests", headers=ALICE, json=SUBMISSION)
    assert submitted.status_code == 201
    quest_id = submitted.json()["id"]
    assert submitted.json()["status"] == "pending_review"
    assert quest_id not in [q["id"] for q in client.get("/quests", headers=BOB).json()]
    # The author can see their own submission, others can't.
    assert client.get(f"/quests/{quest_id}", headers=ALICE).status_code == 200
    assert client.get(f"/quests/{quest_id}", headers=BOB).status_code == 404

    pending = client.get("/admin/quests?status=pending_review", headers=ADMIN).json()
    assert [q["id"] for q in pending] == [quest_id]
    assert pending[0]["author_name"] == "Alice"

    rejected = patch(client, quest_id, status="rejected",
                     review_note="Too loud for the library.")
    assert rejected.json()["status"] == "rejected"
    mine = me(client, ALICE)["submissions"]
    assert mine[0]["status"] == "rejected"
    assert mine[0]["review_note"] == "Too loud for the library."


def test_submissions_listed_newest_first(client):
    first = client.post("/quests", headers=ALICE, json=SUBMISSION).json()["id"]
    second = client.post("/quests", headers=ALICE, json={
        **SUBMISSION, "title": "Second idea"}).json()["id"]
    assert [s["id"] for s in me(client, ALICE)["submissions"]] == [second, first]
    assert me(client, BOB)["submissions"] == []


def test_submission_can_be_published(client):
    quest_id = client.post("/quests", headers=ALICE, json=SUBMISSION).json()["id"]
    patch(client, quest_id, status="published")
    assert client.get(f"/quests/{quest_id}", headers=BOB).json()["author_name"] == "Alice"
    assert me(client, ALICE)["submissions"][0]["status"] == "published"


def test_submission_validation_and_limit(client):
    assert client.post("/quests", headers=ALICE,
                       json={"title": "x", "description": "short"}).status_code == 422
    for _ in range(5):
        assert client.post("/quests", headers=ALICE, json=SUBMISSION).status_code == 201
    assert client.post("/quests", headers=ALICE, json=SUBMISSION).status_code == 409


def test_only_pending_submissions_can_be_rejected(client):
    assert patch(client, SOLO_ID, status="rejected").status_code == 409


def test_report_and_remove_quest(client):
    act(client, ALICE, SOLO_ID, "complete")
    reported = act(client, BOB, SOLO_ID, "report", reason="This is offensive.")
    assert reported.status_code == 200
    assert reported.json()["quest"]["reported"] is True
    duplicate = act(client, BOB, SOLO_ID, "report", reason="This is offensive.")
    assert duplicate.status_code == 409
    act(client, CAROL, SOLO_ID, "report", reason="This is offensive.")
    assert client.get(f"/quests/{SOLO_ID}", headers=BOB).json()["reported"] is True
    assert client.get(f"/admin/quests/{SOLO_ID}", headers=ADMIN).json()["open_reports"] == 2

    reports = client.get("/admin/reports", headers=ADMIN).json()
    assert len(reports) == 2
    assert reports[0]["reporter_name"] == "Bob"
    resolved = client.post(f"/admin/reports/{reports[0]['id']}/resolve", headers=ADMIN,
                           json={"retire_quest": True}).json()
    assert resolved["status"] == "retired"
    assert client.get("/admin/reports", headers=ADMIN).json() == []
    assert points(client, ALICE) == 10  # progress survives removal


def test_report_validation_and_dismissal(client):
    assert act(client, BOB, SOLO_ID, "report", reason="bad").status_code == 422
    act(client, BOB, SOLO_ID, "report", reason="Not sure.")
    report_id = client.get("/admin/reports", headers=ADMIN).json()[0]["id"]
    client.post(f"/admin/reports/{report_id}/resolve", headers=ADMIN, json={"retire_quest": False})
    assert client.get("/admin/reports", headers=ADMIN).json() == []
    assert client.get(f"/quests/{SOLO_ID}", headers=ALICE).json()["status"] == "published"


# --- Maintainer-approved completion -----------------------------------------

def make_approval_quest():
    set_quest(SOLO_ID, requires_approval=True)


def test_pending_completion_awards_nothing_until_approved(client):
    make_approval_quest()
    result = act(client, ALICE, SOLO_ID, "complete", note="Photo is on my phone").json()
    assert result["completion"]["status"] == "pending"
    assert result["completion"]["completed"] is False
    assert result["completion"]["points_awarded"] == 0
    assert result["quest"]["completion_status"] == "pending"
    assert result["quest"]["completed"] is False
    assert points(client, ALICE) == 0

    pending = client.get("/admin/completions", headers=ADMIN).json()
    assert pending[0]["note"] == "Photo is on my phone"
    reviewed = client.post(f"/admin/completions/{pending[0]['id']}/review", headers=ADMIN,
                           json={"approve": True})
    assert reviewed.json()["status"] == "approved"
    assert points(client, ALICE) == 10
    approved = client.get("/admin/completions?status=approved", headers=ADMIN).json()
    assert [c["id"] for c in approved] == [pending[0]["id"]]

    # Approving again can't award twice.
    again = client.post(f"/admin/completions/{pending[0]['id']}/review", headers=ADMIN,
                        json={"approve": True})
    assert again.status_code == 409
    assert points(client, ALICE) == 10
    assert client.get("/admin/completions", headers=ADMIN).json() == []


def test_rejected_completion_shows_reason_and_can_be_resubmitted(client):
    make_approval_quest()
    act(client, ALICE, SOLO_ID, "complete")
    completion_id = client.get("/admin/completions", headers=ADMIN).json()[0]["id"]
    client.post(f"/admin/completions/{completion_id}/review", headers=ADMIN,
                json={"approve": False, "note": "Please add a photo description."})

    quest = client.get(f"/quests/{SOLO_ID}", headers=ALICE).json()
    assert quest["completion_status"] == "rejected"
    assert quest["review_note"] == "Please add a photo description."
    assert points(client, ALICE) == 0

    resubmitted = act(client, ALICE, SOLO_ID, "complete", note="Me at the railing").json()
    assert resubmitted["completion"]["status"] == "pending"
    assert resubmitted["quest"]["review_note"] is None


def test_double_submit_on_approval_quest(client):
    make_approval_quest()
    act(client, ALICE, SOLO_ID, "complete")
    again = act(client, ALICE, SOLO_ID, "complete").json()
    assert again["completion"]["already_completed"] is True
    assert len(client.get("/admin/completions", headers=ADMIN).json()) == 1


# --- Multi-step quests --------------------------------------------------------

def test_steps_in_order_and_reward_once(client):
    steps = client.get(f"/quests/{STEPS_ID}", headers=ALICE).json()["steps"]
    assert len(steps) == 3

    out_of_order = act(client, ALICE, STEPS_ID, "step", step_id=steps[1]["id"])
    assert out_of_order.status_code == 409
    assert out_of_order.json()["detail"] == "Do step 1 first."

    first = act(client, ALICE, STEPS_ID, "step", step_id=steps[0]["id"]).json()
    assert first["completion"] is None
    assert [s["done"] for s in first["quest"]["steps"]] == [True, False, False]
    assert points(client, ALICE) == 0  # no points per step

    # Progress survives (new request = refresh).
    reloaded = client.get(f"/quests/{STEPS_ID}", headers=ALICE).json()
    assert [s["done"] for s in reloaded["steps"]] == [True, False, False]
    assert reloaded["completed"] is False

    act(client, ALICE, STEPS_ID, "step", step_id=steps[1]["id"])
    last = act(client, ALICE, STEPS_ID, "step", step_id=steps[2]["id"]).json()
    assert last["completion"]["points_awarded"] == 30
    assert last["quest"]["completed"] is True
    assert points(client, ALICE) == 30

    repeat = act(client, ALICE, STEPS_ID, "step", step_id=steps[2]["id"]).json()
    assert repeat["completion"]["already_completed"] is True
    assert points(client, ALICE) == 30


def test_step_action_rejects_wrong_quest_or_step(client):
    assert act(client, ALICE, SOLO_ID, "step", step_id=MISSING).status_code == 400
    assert act(client, ALICE, STEPS_ID, "step", step_id=MISSING).status_code == 404
    assert act(client, ALICE, STEPS_ID, "step", step_id="not-a-uuid").status_code == 422
    wrong_kind = act(client, ALICE, STEPS_ID, "complete")
    assert wrong_kind.status_code == 400
    assert wrong_kind.json()["detail"] == "Complete the steps of this quest one by one."


# --- Pair quests ----------------------------------------------------------------

def test_pair_quest_completes_for_both(client):
    started = start_pair(client, ALICE).json()
    session = started["quest"]["pair_session"]
    assert started["completion"] is None
    assert session["state"] == "waiting"
    assert session["is_host"] is True
    assert len(session["code"]) == 6

    preview = client.get(f"/pair/{session['code'].lower()}", headers=BOB).json()
    assert preview["host_name"] == "Alice"
    assert preview["is_host"] is False

    joined = client.post(f"/pair/{session['code']}", headers=BOB).json()
    assert joined["completion"]["points_awarded"] == 25
    assert joined["session"]["state"] == "completed"
    assert joined["session"]["partner_name"] == "Bob"
    assert points(client, ALICE) == 25
    assert points(client, BOB) == 25

    host_view = client.get(f"/quests/{PAIR_ID}", headers=ALICE).json()["pair_session"]
    assert host_view["state"] == "completed"
    assert host_view["partner_name"] == "Bob"
    partner_view = client.get(f"/quests/{PAIR_ID}", headers=BOB).json()["pair_session"]
    assert partner_view["is_host"] is False
    assert client.get(f"/quests/{PAIR_ID}", headers=CAROL).json()["pair_session"] is None


def test_one_account_cannot_complete_pair_alone(client):
    code = pair_code(client, ALICE)
    assert client.post(f"/pair/{code}", headers=ALICE).status_code == 400
    assert act(client, ALICE, PAIR_ID, "complete").status_code == 400
    assert points(client, ALICE) == 0


def test_pair_actions_need_a_pair_quest(client):
    assert start_pair(client, ALICE).status_code == 200
    assert act(client, ALICE, SOLO_ID, "pair_start").status_code == 400
    assert act(client, ALICE, MISSING, "pair_start").status_code == 404
    assert client.get("/pair/NOPE42", headers=BOB).status_code == 404


def test_invalid_expired_cancelled_and_used_codes(client):
    assert client.post("/pair/NOPE42", headers=BOB).status_code == 404

    code = pair_code(client, ALICE)
    with SessionLocal() as db:
        session = db.query(PairSession).filter_by(code=code).one()
        session.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    expired = client.post(f"/pair/{code}", headers=BOB)
    assert expired.status_code == 410
    assert "expired" in expired.json()["detail"]

    code = pair_code(client, ALICE)
    cancelled = act(client, ALICE, PAIR_ID, "pair_cancel").json()
    assert cancelled["quest"]["pair_session"]["state"] == "cancelled"
    assert act(client, ALICE, PAIR_ID, "pair_cancel").status_code == 200  # idempotent
    assert client.post(f"/pair/{code}", headers=BOB).status_code == 410

    code = pair_code(client, ALICE)
    client.post(f"/pair/{code}", headers=BOB)
    assert client.post(f"/pair/{code}", headers=CAROL).status_code == 409
    # Bob retrying his own join is harmless.
    retry = client.post(f"/pair/{code}", headers=BOB)
    assert retry.status_code == 200
    assert retry.json()["completion"]["already_completed"] is True
    assert points(client, BOB) == 25


def test_new_code_replaces_old_one(client):
    old = pair_code(client, ALICE)
    start_pair(client, ALICE)
    assert client.post(f"/pair/{old}", headers=BOB).status_code == 410


def test_retired_pair_quest_cannot_be_joined(client):
    code = pair_code(client, ALICE)
    patch(client, PAIR_ID, status="retired")
    assert client.post(f"/pair/{code}", headers=BOB).status_code == 409


def test_completed_players_can_help_others_without_earning_again(client):
    client.post(f"/pair/{pair_code(client, ALICE)}", headers=BOB)

    # As host again: the new partner earns, the host doesn't.
    dan = identity("dan-id", "Dan")
    joined = client.post(f"/pair/{pair_code(client, ALICE)}", headers=dan).json()
    assert joined["completion"]["points_awarded"] == 25
    assert points(client, ALICE) == 25

    helped = client.post(f"/pair/{pair_code(client, CAROL)}", headers=ALICE).json()
    assert helped["completion"]["points_awarded"] == 0
    assert points(client, ALICE) == 25
    assert points(client, CAROL) == 25


def test_simultaneous_joins_have_one_winner(client):
    code = pair_code(client, ALICE)
    players = [identity(f"player-{n}", f"Player {n}") for n in range(8)]
    for headers in players:
        me(client, headers)

    with ThreadPoolExecutor(max_workers=8) as pool:
        statuses = list(pool.map(
            lambda h: client.post(f"/pair/{code}", headers=h).status_code, players))
    assert sorted(statuses) == [200] + [409] * 7
    assert points(client, ALICE) == 25
    assert sum(points(client, h) for h in players) == 25


# --- Pair invitations --------------------------------------------------------

def set_profile(client, headers, hobbies, discoverable=True):
    return client.put("/me", headers=headers,
                      json={"hobbies": hobbies, "discoverable": discoverable})


def test_invite_suggested_player_to_pair_quest(client):
    set_profile(client, ALICE, ["chess"])
    set_profile(client, BOB, ["chess"])
    session = start_pair(client, ALICE, invite_username="bob-id").json()["quest"]["pair_session"]
    assert session["invited_name"] == "Bob"

    invites = me(client, BOB)["invitations"]
    assert [i["code"] for i in invites] == [session["code"]]
    assert invites[0]["host_name"] == "Alice"
    assert me(client, CAROL)["invitations"] == []

    client.post(f"/pair/{session['code']}", headers=BOB)
    assert me(client, BOB)["invitations"] == []
    assert points(client, ALICE) == points(client, BOB) == 25


def test_invites_need_both_players_opted_in(client):
    set_profile(client, ALICE, ["chess"])
    set_profile(client, BOB, ["chess"], discoverable=False)
    for username in ("bob-id", "alice-id", "nobody"):
        response = start_pair(client, ALICE, invite_username=username)
        assert response.status_code == 400


def test_expired_or_cancelled_invites_disappear(client):
    set_profile(client, ALICE, ["chess"])
    set_profile(client, BOB, ["chess"])
    pair_code(client, ALICE, invite_username="bob-id")
    act(client, ALICE, PAIR_ID, "pair_cancel")
    assert me(client, BOB)["invitations"] == []

    code = pair_code(client, ALICE, invite_username="bob-id")
    with SessionLocal() as db:
        db.query(PairSession).filter_by(code=code).one().expires_at = \
            utcnow() - timedelta(seconds=1)
        db.commit()
    assert me(client, BOB)["invitations"] == []


# --- Meetups ----------------------------------------------------------------------

def schedule_meetup(start_offset_minutes, length_minutes=30, cancelled=False):
    start = utcnow() + timedelta(minutes=start_offset_minutes)
    set_quest(MEETUP_ID, starts_at=start,
              ends_at=start + timedelta(minutes=length_minutes), cancelled=cancelled)


def test_meetup_check_in_window(client):
    schedule_meetup(60)
    quest = client.get(f"/quests/{MEETUP_ID}", headers=ALICE).json()
    assert quest["meetup_state"] == "upcoming"
    assert quest["starts_at"].endswith(("Z", "+00:00"))
    early = act(client, ALICE, MEETUP_ID, "complete")
    assert early.status_code == 409
    assert "15 minutes" in early.json()["detail"]

    schedule_meetup(10)  # within the 15-minute early window
    assert client.get(f"/quests/{MEETUP_ID}", headers=ALICE).json()["meetup_state"] == "live"
    checked_in = act(client, ALICE, MEETUP_ID, "complete").json()
    assert checked_in["completion"]["points_awarded"] == 20

    schedule_meetup(-60)
    assert client.get(f"/quests/{MEETUP_ID}", headers=BOB).json()["meetup_state"] == "past"
    assert act(client, BOB, MEETUP_ID, "complete").status_code == 409
    # Already checked in: repeating is still fine and awards nothing.
    again = act(client, ALICE, MEETUP_ID, "complete").json()
    assert again["completion"]["already_completed"] is True


def test_cancelled_meetup(client):
    schedule_meetup(0, cancelled=True)
    assert client.get(f"/quests/{MEETUP_ID}", headers=ALICE).json()["meetup_state"] == "cancelled"
    assert act(client, ALICE, MEETUP_ID, "complete").status_code == 409
    assert act(client, ALICE, MEETUP_ID, "rsvp", attending=True).status_code == 409


def test_meetup_rsvp(client):
    schedule_meetup(120)
    joined = act(client, ALICE, MEETUP_ID, "rsvp", attending=True).json()
    assert (joined["quest"]["rsvp"], joined["quest"]["rsvp_count"]) == (True, 1)
    act(client, ALICE, MEETUP_ID, "rsvp", attending=True)  # idempotent
    act(client, BOB, MEETUP_ID, "rsvp", attending=True)
    quest = client.get(f"/quests/{MEETUP_ID}", headers=ALICE).json()
    assert (quest["rsvp"], quest["rsvp_count"]) == (True, 2)
    left = act(client, ALICE, MEETUP_ID, "rsvp", attending=False).json()
    assert (left["quest"]["rsvp"], left["quest"]["rsvp_count"]) == (False, 1)
    assert act(client, ALICE, SOLO_ID, "rsvp", attending=True).status_code == 400
    assert act(client, ALICE, MEETUP_ID, "rsvp").status_code == 422


def test_meetup_editor_stores_utc(client):
    saved = patch(client, MEETUP_ID, starts_at="2026-10-11T11:00:00+02:00",
                  ends_at="2026-10-11T12:00:00+02:00").json()
    assert saved["starts_at"].startswith("2026-10-11T09:00:00")

    backwards = patch(client, MEETUP_ID, starts_at="2026-10-11T12:00:00Z",
                      ends_at="2026-10-11T11:00:00Z")
    assert backwards.status_code == 409


# --- Map pins -----------------------------------------------------------------------

def test_map_pins(client):
    quests = {q["id"]: q for q in client.get("/quests", headers=ALICE).json()}
    assert 47.37 < quests[SOLO_ID]["latitude"] < 47.38  # ETH Zentrum
    assert 8.54 < quests[SOLO_ID]["longitude"] < 8.55
    assert quests[SECOND_QUEST_ID]["latitude"] is None  # "anywhere" quests have no pin
    assert patch(client, SOLO_ID, longitude=None).status_code == 409


# --- Hobbies and suggestions ------------------------------------------------------

def test_hobbies_are_optional_and_validated(client):
    profile = me(client, ALICE)
    assert profile["hobbies"] == [] and profile["discoverable"] is False
    assert {"key": "chess", "label": "Chess"} in profile["hobby_options"]
    assert set_profile(client, ALICE, ["napping"]).status_code == 400
    saved = set_profile(client, ALICE, ["hiking", "chess", "chess"]).json()
    assert saved["hobbies"] == ["chess", "hiking"]
    assert saved["discoverable"] is True
    assert set_profile(client, ALICE, [], False).json()["hobbies"] == []
    assert client.put("/me", headers=ALICE, json={"hobbies": []}).status_code == 422


def test_suggestions_need_opt_in_and_shared_hobbies(client):
    set_profile(client, ALICE, ["chess", "hiking", "music"])
    set_profile(client, BOB, ["chess", "hiking"])
    set_profile(client, CAROL, ["chess"], discoverable=False)  # hidden
    set_profile(client, identity("dan-id", "Dan"), ["running"])  # nothing shared

    result = me(client, ALICE)["suggestions"]
    assert result["enabled"] is True
    assert result["suggestions"] == [{
        "username": "bob-id",
        "display_name": "Bob",
        "shared_hobbies": ["Chess", "Hiking"],
    }]
    # Not opted in: no suggestions for Carol either.
    assert me(client, CAROL)["suggestions"] == {"enabled": False, "suggestions": []}


def test_suggestions_can_be_dismissed(client):
    set_profile(client, ALICE, ["chess"])
    set_profile(client, BOB, ["chess"])
    assert client.delete("/me/suggestions/bob-id", headers=ALICE).status_code == 204
    assert client.delete("/me/suggestions/bob-id", headers=ALICE).status_code == 204
    assert me(client, ALICE)["suggestions"]["suggestions"] == []
    assert client.delete("/me/suggestions/alice-id", headers=ALICE).status_code == 400
    assert client.delete("/me/suggestions/nobody", headers=ALICE).status_code == 404


def test_removing_hobbies_removes_from_suggestions(client):
    set_profile(client, ALICE, ["chess"])
    set_profile(client, BOB, ["chess"])
    set_profile(client, BOB, [], discoverable=True)
    assert me(client, ALICE)["suggestions"]["suggestions"] == []


# --- Quizzes ------------------------------------------------------------------------

def test_quiz_checks_answers_and_allows_retries(client):
    quest = client.get(f"/quests/{QUIZ_ID}", headers=ALICE).json()
    assert len(quest["questions"]) == 3
    assert all(len(q["choices"]) == 4 for q in quest["questions"])

    wrong = act(client, ALICE, QUIZ_ID, "quiz", answers=[0, 2, 2]).json()
    assert wrong["quiz"] == {"passed": False, "correct_count": 2, "total": 3,
                             "correct": [False, True, True]}
    assert wrong["completion"] is None
    assert points(client, ALICE) == 0

    right = act(client, ALICE, QUIZ_ID, "quiz", answers=QUIZ_ANSWERS).json()
    assert right["quiz"]["passed"] is True
    assert right["completion"]["points_awarded"] == 15
    assert right["quest"]["completed"] is True

    again = act(client, ALICE, QUIZ_ID, "quiz", answers=QUIZ_ANSWERS).json()
    assert again["completion"]["already_completed"] is True
    assert points(client, ALICE) == 15


def test_quiz_needs_every_answer(client):
    assert act(client, ALICE, QUIZ_ID, "quiz", answers=[1]).status_code == 400
    assert act(client, ALICE, QUIZ_ID, "complete").status_code == 400
    assert act(client, ALICE, SOLO_ID, "quiz", answers=[1]).status_code == 400


# --- Badges ---------------------------------------------------------------------------

def test_badges_follow_progress(client):
    assert not any(b["earned"] for b in badges(client, ALICE).values())

    act(client, ALICE, QUIZ_ID, "quiz", answers=QUIZ_ANSWERS)
    client.post(f"/pair/{pair_code(client, ALICE)}", headers=BOB)

    earned = badges(client, ALICE)
    assert earned["first_quest"]["earned"] and earned["first_quest"]["earned_at"]
    assert earned["quiz"]["earned"]
    assert earned["social"]["earned"]
    assert not earned["explorer"]["earned"]
    assert not earned["century"]["earned"]


def test_pending_completions_do_not_earn_badges_or_rank(client):
    make_approval_quest()
    act(client, ALICE, SOLO_ID, "complete")
    assert badges(client, ALICE)["first_quest"]["earned"] is False
    board = client.get("/leaderboard", headers=ALICE).json()
    assert board["entries"] == []
    assert board["current_player"]["points"] == 0


def test_badge_progress(client):
    progress = badges(client, ALICE)
    assert (progress["explorer"]["progress"], progress["explorer"]["target"]) == (0, 5)
    assert (progress["century"]["progress"], progress["century"]["target"]) == (0, 100)
    assert (progress["meetup"]["progress"], progress["meetup"]["target"]) == (0, 1)

<<<<<<< HEAD
    act(client, ALICE, SOLO_ID, "complete")           # 10 points
    act(client, ALICE, SECOND_QUEST_ID, "complete")   # 20 points
    progress = badges(client, ALICE)
    assert progress["explorer"]["progress"] == 2
    assert progress["century"]["progress"] == 30
    assert progress["first_quest"]["progress"] == progress["first_quest"]["target"] == 1
=======
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
>>>>>>> c29d76759120a245ef4eafc66eca2802f1120de5
