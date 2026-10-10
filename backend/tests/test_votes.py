"""Up/down votes on player-created quests."""

from conftest import act, identity
from sample_quests import QUESTS

ALICE = identity("alice-id", "Alice")
BOB = identity("bob-id", "Bob")
CAROL = identity("carol-id", "Carol")
ADMIN_QUEST_ID = str(QUESTS[0]["id"])


def create_player_quest(client, headers):
    response = client.post("/quests", headers=headers, json={
        "title": "Rock-paper-scissors rematch",
        "description": "Find a partner and play best of three in the main hall.",
        "kind": "pair",
    })
    assert response.status_code == 201, response.text
    return response.json()["id"]


def votes(client, headers, quest_id):
    return client.get(f"/quests/{quest_id}", headers=headers).json()["votes"]


def vote(client, headers, quest_id, value):
    return act(client, headers, quest_id, "vote", value=value)


def test_votes_count_and_can_change(client):
    quest_id = create_player_quest(client, ALICE)
    assert votes(client, BOB, quest_id) == {
        "up": 0, "down": 0, "score": 0, "mine": 0, "can_vote": True}

    result = vote(client, BOB, quest_id, 1)
    assert result.status_code == 200
    assert result.json()["quest"]["votes"] == {
        "up": 1, "down": 0, "score": 1, "mine": 1, "can_vote": True}
    vote(client, CAROL, quest_id, -1)
    assert votes(client, BOB, quest_id) == {
        "up": 1, "down": 1, "score": 0, "mine": 1, "can_vote": True}
    assert votes(client, CAROL, quest_id)["mine"] == -1

    # One vote per player: voting again changes it instead of adding one.
    vote(client, BOB, quest_id, -1)
    assert votes(client, BOB, quest_id) == {
        "up": 0, "down": 2, "score": -2, "mine": -1, "can_vote": True}
    vote(client, BOB, quest_id, -1)
    assert votes(client, BOB, quest_id)["down"] == 2

    # 0 removes the vote (also when there is none).
    assert vote(client, BOB, quest_id, 0).status_code == 200
    assert votes(client, BOB, quest_id) == {
        "up": 0, "down": 1, "score": -1, "mine": 0, "can_vote": True}
    assert vote(client, BOB, quest_id, 0).status_code == 200


def test_author_cannot_vote_but_sees_the_votes(client):
    quest_id = create_player_quest(client, ALICE)
    vote(client, BOB, quest_id, 1)
    assert votes(client, ALICE, quest_id) == {
        "up": 1, "down": 0, "score": 1, "mine": 0, "can_vote": False}
    denied = vote(client, ALICE, quest_id, 1)
    assert denied.status_code == 400
    assert "own quest" in denied.json()["detail"]


def test_maintainer_quests_have_no_votes(client):
    assert votes(client, ALICE, ADMIN_QUEST_ID) is None
    denied = vote(client, ALICE, ADMIN_QUEST_ID, 1)
    assert denied.status_code == 400
    assert "player-created" in denied.json()["detail"]
    # Votes never appear in the list for built-in quests either.
    listed = {q["id"]: q for q in client.get("/quests", headers=ALICE).json()}
    assert listed[ADMIN_QUEST_ID]["votes"] is None


def test_vote_value_is_validated(client):
    quest_id = create_player_quest(client, ALICE)
    assert vote(client, BOB, quest_id, 2).status_code == 422
    assert vote(client, BOB, quest_id, "up").status_code == 422
