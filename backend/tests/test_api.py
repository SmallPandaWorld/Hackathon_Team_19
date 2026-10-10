from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import create_engine, inspect, text

import database
from conftest import identity
from database import SessionLocal
from models import Completion, Quest
from quests import QUESTS, seed_quests

ALICE = identity("alice-id", "Alice")
BOB = identity("bob-id", "Bob")
QUEST_POINTS = {quest["id"]: quest["points"] for quest in QUESTS}
SOLO_IDS = [quest["id"] for quest in QUESTS if quest["kind"] == "solo"]


@pytest.mark.parametrize("method, path", [
    ("get", "/me"),
    ("get", "/quests"),
    ("get", "/quests/1"),
    ("post", "/quests/1/complete"),
    ("get", "/leaderboard"),
])
def test_missing_identity_is_rejected(client, method, path):
    response = getattr(client, method)(path)
    assert response.status_code == 401
    assert "detail" in response.json()


def test_blank_identity_is_rejected(client):
    assert client.get("/me", headers={"X-User-Id": "  "}).status_code == 401


def test_player_is_created_once_and_reused(client):
    first = client.get("/me", headers=ALICE).json()
    second = client.get("/me", headers=ALICE).json()
    assert first == second
    assert first["display_name"] == "Alice"
    assert first["total_points"] == 0
    assert first["is_maintainer"] is False


def test_display_name_is_percent_decoded(client):
    headers = identity("zoe-id", "Zo%C3%A9%20M%C3%BCller")
    assert client.get("/me", headers=headers).json()["display_name"] == "Zoé Müller"


def test_display_name_follows_proxy_but_missing_name_keeps_it(client):
    client.get("/me", headers=ALICE)
    renamed = client.get("/me", headers=identity("alice-id", "Alice B")).json()
    assert renamed["display_name"] == "Alice B"
    unnamed = client.get("/me", headers={"X-User-Id": "alice-id"}).json()
    assert unnamed["display_name"] == "Alice B"


def test_lists_seeded_quests(client):
    quests = client.get("/quests", headers=ALICE).json()
    assert [quest["id"] for quest in quests] == [q["id"] for q in QUESTS]
    for quest in quests:
        assert quest["title"] and quest["description"]
        assert quest["points"] == QUEST_POINTS[quest["id"]]
        assert quest["completed"] is False
        assert quest["completed_at"] is None


def test_unknown_quest_returns_404(client):
    assert client.get("/quests/999", headers=ALICE).status_code == 404
    response = client.post("/quests/999/complete", headers=ALICE)
    assert response.status_code == 404
    assert response.json() == {"detail": "Quest not found."}


def test_complete_awards_points_once(client):
    first = client.post("/quests/2/complete", headers=ALICE).json()
    assert first["already_completed"] is False
    assert first["points_awarded"] == QUEST_POINTS[2]
    assert first["total_points"] == QUEST_POINTS[2]
    assert first["completed_at"].endswith(("Z", "+00:00"))

    again = client.post("/quests/2/complete", headers=ALICE).json()
    assert again["already_completed"] is True
    assert again["points_awarded"] == 0
    assert again["total_points"] == QUEST_POINTS[2]
    assert again["completed_at"] == first["completed_at"]

    quest = client.get("/quests/2", headers=ALICE).json()
    assert quest["completed"] is True
    assert quest["completed_at"] == first["completed_at"]
    assert client.get("/me", headers=ALICE).json()["total_points"] == QUEST_POINTS[2]


def test_client_cannot_choose_points_or_player(client):
    bob_id = client.get("/me", headers=BOB).json()["id"]
    response = client.post(
        "/quests/1/complete?points=9999&player_id=%d" % bob_id,
        headers=ALICE,
        json={"points": 9999, "player_id": bob_id},
    )
    assert response.json()["points_awarded"] == QUEST_POINTS[1]
    assert client.get("/me", headers=BOB).json()["total_points"] == 0


def test_players_have_separate_progress(client):
    client.post("/quests/1/complete", headers=ALICE)
    bob_quests = client.get("/quests", headers=BOB).json()
    assert not any(quest["completed"] for quest in bob_quests)
    assert client.get("/me", headers=BOB).json()["total_points"] == 0


def test_completing_all_solo_quests_sums_points(client):
    for quest_id in SOLO_IDS:
        client.post(f"/quests/{quest_id}/complete", headers=ALICE)
    expected = sum(QUEST_POINTS[quest_id] for quest_id in SOLO_IDS)
    assert client.get("/me", headers=ALICE).json()["total_points"] == expected


def test_simultaneous_completions_reward_once(client):
    client.get("/me", headers=ALICE)  # create the player up front

    def complete(_):
        return client.post("/quests/3/complete", headers=ALICE).json()

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(complete, range(16)))

    assert sum(result["points_awarded"] for result in results) == QUEST_POINTS[3]
    assert sum(not result["already_completed"] for result in results) == 1
    with SessionLocal() as db:
        assert db.query(Completion).count() == 1


def test_simultaneous_first_requests_create_one_player(client):
    with ThreadPoolExecutor(max_workers=8) as pool:
        ids = set(pool.map(lambda _: client.get("/me", headers=ALICE).json()["id"], range(16)))
    assert len(ids) == 1


def test_leaderboard_ranks_ties_and_current_player(client):
    client.post("/quests/2/complete", headers=ALICE)      # 20
    client.post("/quests/2/complete", headers=BOB)        # 20
    carol = identity("carol-id", "Carol")
    client.post("/quests/1/complete", headers=carol)      # 10
    dave = identity("dave-id", "Dave")
    client.get("/me", headers=dave)                       # 0

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
    client.post("/quests/1/complete", headers=ALICE)
    body = client.get("/leaderboard", headers=ALICE).text
    assert "alice-id" not in body


def test_seeding_is_repeatable_and_keeps_progress(client):
    client.post("/quests/1/complete", headers=ALICE)
    with SessionLocal() as db:
        seed_quests(db)
        seed_quests(db)
        assert db.query(Quest).count() == len(QUESTS)
        assert db.query(Completion).count() == 1
    assert client.get("/me", headers=ALICE).json()["total_points"] == QUEST_POINTS[1]


def test_point_changes_do_not_rewrite_history(client):
    client.post("/quests/1/complete", headers=ALICE)
    with SessionLocal() as db:
        db.get(Quest, 1).points = 500
        db.commit()
    assert client.get("/me", headers=ALICE).json()["total_points"] == QUEST_POINTS[1]


def test_legacy_users_table_is_upgraded(tmp_path, monkeypatch):
    legacy_engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with legacy_engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(255) NOT NULL)"))
        connection.execute(text("INSERT INTO users (name) VALUES ('old prototype user')"))

    monkeypatch.setattr(database, "engine", legacy_engine)
    database.upgrade_legacy_schema()
    database.upgrade_legacy_schema()  # second run is a no-op

    columns = {c["name"] for c in inspect(legacy_engine).get_columns("users")}
    assert "viscon_user_id" in columns
    with legacy_engine.connect() as connection:
        assert connection.execute(text("SELECT name FROM users")).scalar() == "old prototype user"
