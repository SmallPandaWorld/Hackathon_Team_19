"""Core API: identity, quests, completions, leaderboard, schema setup."""

import logging
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid5

import pytest
from sqlalchemy import create_engine, inspect, text

import auth
import database
from conftest import act, identity
from database import SessionLocal
from main import app
from models import Completion, Quest
from sample_quests import QUESTS, seed_quests

ALICE = identity("alice-id", "Alice")
BOB = identity("bob-id", "Bob")
QUEST_POINTS = {str(quest["id"]): quest["points"] for quest in QUESTS}
SOLO_IDS = [quest["id"] for quest in QUESTS if quest["kind"] == "solo"]
MISSING = "00000000-0000-0000-0000-000000000999"


def quest_id(number: int):
    return QUESTS[number - 1]["id"]


def complete(client, headers, number_or_id, **fields):
    target = quest_id(number_or_id) if isinstance(number_or_id, int) else number_or_id
    return act(client, headers, target, "complete", **fields)


def me(client, headers=ALICE):
    return client.get("/me", headers=headers).json()


# --- API surface ----------------------------------------------------------------

EXPECTED_OPERATIONS = {
    ("get", "/"): "root",
    ("get", "/me"): "get_me",
    ("put", "/me"): "update_me",
    ("delete", "/me/suggestions/{username}"): "dismiss_suggestion",
    ("get", "/leaderboard"): "get_leaderboard",
    ("get", "/players"): "search_players",
    ("get", "/players/{username}"): "get_player",
    ("get", "/quests"): "list_quests",
    ("get", "/quests/{quest_id}"): "get_quest",
    ("post", "/quests"): "create_quest",
    ("post", "/quests/{quest_id}/actions"): "act_on_quest",
    ("get", "/pair/{code}"): "get_pair_code",
    ("post", "/pair/{code}"): "join_pair_session",
    ("get", "/friends"): "list_friends",
    ("post", "/friends/{username}"): "send_friend_request",
    ("post", "/friends/{username}/accept"): "accept_friend_request",
    ("delete", "/friends/{username}"): "remove_friend",
    ("get", "/admin/quests"): "admin_list_quests",
    ("get", "/admin/quests/{quest_id}"): "admin_get_quest",
    ("post", "/admin/quests"): "admin_create_quest",
    ("patch", "/admin/quests/{quest_id}"): "admin_update_quest",
    ("get", "/admin/completions"): "admin_list_completions",
    ("post", "/admin/completions/{completion_id}/review"): "admin_review_completion",
    ("get", "/admin/reports"): "admin_list_reports",
    ("post", "/admin/reports/{report_id}/resolve"): "admin_resolve_report",
}


def test_openapi_matches_contract():
    spec = app.openapi()
    operations = {
        (method, path): operation["operationId"]
        for path, methods in spec["paths"].items()
        for method, operation in methods.items()
    }
    assert operations == EXPECTED_OPERATIONS
    for methods in spec["paths"].values():
        for operation in methods.values():
            assert "200" in operation["responses"] or "201" in operation["responses"] \
                or "204" in operation["responses"]


# --- Identity ---------------------------------------------------------------------

@pytest.mark.parametrize("method, path", [
    ("get", "/me"),
    ("get", "/quests"),
    ("get", f"/quests/{quest_id(1)}"),
    ("post", f"/quests/{quest_id(1)}/actions"),
    ("get", "/leaderboard"),
    ("get", "/pair/ABCDEF"),
])
def test_missing_identity_is_rejected(client, method, path):
    response = client.request(method, path, json={"type": "complete"})
    assert response.status_code == 401
    assert "detail" in response.json()


def test_blank_identity_is_rejected(client):
    assert client.get("/me", headers={"X-User-Id": "  "}).status_code == 401


def test_player_is_created_once_and_reused(client):
    first = me(client)
    assert first == me(client)
    assert first["username"] == "alice-id"
    assert first["display_name"] == "Alice"
    assert first["total_points"] == 0
    assert first["is_maintainer"] is False
    assert first["invitations"] == [] and first["created_quests"] == []
    assert first["suggestions"] == {"enabled": False, "suggestions": []}
    assert len(first["hobby_options"]) >= 10


def test_display_name_is_percent_decoded(client):
    headers = identity("zoe-id", "Zo%C3%A9%20M%C3%BCller")
    assert me(client, headers)["display_name"] == "Zoé Müller"


def test_display_name_follows_proxy_but_missing_name_keeps_it(client):
    me(client)
    assert me(client, identity("alice-id", "Alice B"))["display_name"] == "Alice B"
    assert me(client, {"X-User-Id": "alice-id"})["display_name"] == "Alice B"


def test_dev_fallback_user_is_maintainer(client, monkeypatch):
    monkeypatch.setattr(auth, "DEV_USER_ID", "dev")
    monkeypatch.setattr(auth, "DEV_USER_NAME", "Dev Player")
    dev = client.get("/me").json()
    assert dev["username"] == "dev"
    assert dev["display_name"] == "Dev Player"
    assert dev["is_maintainer"] is True
    assert client.get("/admin/quests").status_code == 200
    # Real headers still win, and other players are not maintainers.
    assert me(client)["username"] == "alice-id"
    assert client.get("/admin/quests", headers=ALICE).status_code == 403


def test_simultaneous_first_requests_create_one_player(client):
    with ThreadPoolExecutor(max_workers=8) as pool:
        names = set(pool.map(lambda _: me(client)["display_name"], range(16)))
    assert names == {"Alice"}


# --- Quests and completions -------------------------------------------------------

def test_new_app_has_no_quests(empty_client):
    assert empty_client.get("/quests", headers=ALICE).json() == []
    with SessionLocal() as db:
        assert db.query(Quest).count() == 0


def test_new_app_shows_quest_added_by_maintainer(empty_client):
    maintainer = identity("maintainer-id", "Vis")
    created = empty_client.post("/admin/quests", headers=maintainer, json={
        "kind": "solo",
        "title": "Find the VIS office",
        "description": "Say hi at the VIS office.",
        "points": 10,
        "status": "published",
    })
    assert created.status_code == 201, created.text
    quests = empty_client.get("/quests", headers=ALICE).json()
    assert [quest["title"] for quest in quests] == ["Find the VIS office"]


def test_lists_seeded_quests_in_seed_order(client):
    quests = client.get("/quests", headers=ALICE).json()
    assert [quest["id"] for quest in quests] == [str(q["id"]) for q in QUESTS]
    for quest in quests:
        assert quest["title"] and quest["description"]
        assert quest["points"] == QUEST_POINTS[quest["id"]]
        assert quest["completed"] is False
        assert quest["completed_at"] is None
        assert quest["pair_session"] is None


def test_unknown_quest_returns_404(client):
    assert client.get(f"/quests/{MISSING}", headers=ALICE).status_code == 404
    response = complete(client, ALICE, MISSING)
    assert response.status_code == 404
    assert response.json() == {"detail": "Quest not found."}


def test_unknown_action_type_is_422(client):
    assert act(client, ALICE, quest_id(1), "dance").status_code == 422
    assert client.post(f"/quests/{quest_id(1)}/actions", headers=ALICE,
                       json={}).status_code == 422


def test_complete_awards_points_once(client):
    expected = QUEST_POINTS[str(quest_id(2))]
    first = complete(client, ALICE, 2).json()
    assert first["quiz"] is None
    assert first["quest"]["completed"] is True
    result = first["completion"]
    assert result["already_completed"] is False
    assert result["points_awarded"] == expected
    assert result["total_points"] == expected
    assert result["completed_at"].endswith(("Z", "+00:00"))

    again = complete(client, ALICE, 2).json()["completion"]
    assert again["already_completed"] is True
    assert again["points_awarded"] == 0
    assert again["total_points"] == expected
    assert again["completed_at"] == result["completed_at"]

    quest = client.get(f"/quests/{quest_id(2)}", headers=ALICE).json()
    assert quest["completed"] is True
    assert quest["completed_at"] == result["completed_at"]
    assert me(client)["total_points"] == expected


def test_client_cannot_choose_points_or_player(client):
    response = client.post(
        f"/quests/{quest_id(1)}/actions?points=9999&username=bob-id",
        headers=ALICE,
        json={"type": "complete", "points": 9999, "username": "bob-id"},
    )
    assert response.json()["completion"]["points_awarded"] == QUEST_POINTS[str(quest_id(1))]
    assert me(client, BOB)["total_points"] == 0


def test_players_have_separate_progress(client):
    complete(client, ALICE, 1)
    assert not any(q["completed"] for q in client.get("/quests", headers=BOB).json())
    assert me(client, BOB)["total_points"] == 0


def test_completing_all_solo_quests_sums_points(client):
    for solo_id in SOLO_IDS:
        complete(client, ALICE, solo_id)
    assert me(client)["total_points"] == sum(QUEST_POINTS[str(i)] for i in SOLO_IDS)


def test_simultaneous_completions_reward_once(client):
    me(client)  # create the player up front

    def run(_):
        return complete(client, ALICE, 3).json()["completion"]

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(run, range(16)))

    assert sum(r["points_awarded"] for r in results) == QUEST_POINTS[str(quest_id(3))]
    assert sum(not r["already_completed"] for r in results) == 1
    with SessionLocal() as db:
        assert db.query(Completion).count() == 1


def test_seeding_is_repeatable_and_keeps_progress(client):
    complete(client, ALICE, 1)
    with SessionLocal() as db:
        seed_quests(db)
        seed_quests(db)
        assert db.query(Quest).count() == len(QUESTS)
        assert db.query(Completion).count() == 1
    assert me(client)["total_points"] == QUEST_POINTS[str(quest_id(1))]


def test_builtin_quest_ids_are_stable():
    # Saved progress refers to these IDs; they must never change.
    namespace = UUID("9bb7b0d4-9c4b-4e16-93ef-780ce94a8831")
    assert [q["id"] for q in QUESTS] == [uuid5(namespace, f"quests:{n}") for n in range(1, 8)]


def test_point_changes_do_not_rewrite_history(client):
    complete(client, ALICE, 1)
    with SessionLocal() as db:
        db.get(Quest, quest_id(1)).points = 500
        db.commit()
    assert me(client)["total_points"] == QUEST_POINTS[str(quest_id(1))]


# --- Leaderboard ------------------------------------------------------------------

def test_leaderboard_ranks_ties_and_current_player(client):
    complete(client, ALICE, 2)                       # 20
    complete(client, BOB, 2)                         # 20
    carol = identity("carol-id", "Carol")
    complete(client, carol, 1)                       # 10
    dave = identity("dave-id", "Dave")
    me(client, dave)                                 # 0

    board = client.get("/leaderboard", headers=carol).json()
    ranking = [(e["rank"], e["display_name"], e["points"]) for e in board["entries"]]
    assert ranking == [(1, "Alice", 20), (1, "Bob", 20), (3, "Carol", 10)]
    assert [e["is_current_player"] for e in board["entries"]] == [False, False, True]
    assert board["current_player"]["display_name"] == "Carol"

    dave_board = client.get("/leaderboard", headers=dave).json()
    assert len(dave_board["entries"]) == 3
    assert dave_board["current_player"]["rank"] == 4
    assert dave_board["current_player"]["points"] == 0


def test_leaderboard_hides_external_identity(client):
    complete(client, ALICE, 1)
    assert "alice-id" not in client.get("/leaderboard", headers=ALICE).text


# --- Schema setup -----------------------------------------------------------------

def make_old_database(path):
    old = create_engine(f"sqlite:///{path}")
    with old.begin() as connection:
        connection.execute(text(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(255) NOT NULL)"))
        connection.execute(text("CREATE INDEX ix_users_id ON users (id)"))
        connection.execute(text(
            "CREATE TABLE quests (id INTEGER PRIMARY KEY, title VARCHAR(255))"))
        connection.execute(text("INSERT INTO users (name) VALUES ('old prototype user')"))
    return old


def test_old_schema_is_renamed_to_legacy_tables(tmp_path, caplog):
    old = make_old_database(tmp_path / "old.db")
    with caplog.at_level(logging.WARNING, logger="database"):
        database.ensure_schema(old)
    assert "legacy" in caplog.text

    inspector = inspect(old)
    tables = set(inspector.get_table_names())
    assert {"legacy_users", "legacy_quests", "users", "quests", "completions"} <= tables
    assert "username" in {c["name"] for c in inspector.get_columns("users")}
    with old.connect() as connection:
        assert connection.execute(text("SELECT name FROM legacy_users")).scalar() \
            == "old prototype user"
        assert connection.execute(text("SELECT count(*) FROM users")).scalar() == 0

    caplog.clear()
    database.ensure_schema(old)  # second run: nothing to do
    assert "legacy" not in caplog.text
    assert set(inspect(old).get_table_names()) == tables


def test_existing_legacy_tables_are_kept(tmp_path):
    old = make_old_database(tmp_path / "old.db")
    with old.begin() as connection:
        connection.execute(text("CREATE TABLE legacy_users (id INTEGER PRIMARY KEY)"))
    database.ensure_schema(old)
    tables = set(inspect(old).get_table_names())
    assert {"legacy_users", "legacy_users_2", "users"} <= tables


def test_current_schema_is_left_alone(client):
    complete(client, ALICE, 1)
    database.ensure_schema()
    assert me(client)["total_points"] == QUEST_POINTS[str(quest_id(1))]
