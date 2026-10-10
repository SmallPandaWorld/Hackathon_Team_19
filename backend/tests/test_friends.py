"""Friend requests, acceptance, removal and visibility rules."""

from sqlalchemy import delete, select

from conftest import act, identity
from database import SessionLocal
from models import EarnedBadge

ALICE = identity("alice-id", "Alice")
BOB = identity("bob-id", "Bob")
CAROL = identity("carol-id", "Carol")


def opt_in(client, headers, discoverable=True):
    assert client.put("/me", headers=headers,
                      json={"hobbies": [], "discoverable": discoverable}).status_code == 200


def friends(client, headers):
    response = client.get("/friends", headers=headers)
    assert response.status_code == 200
    return response.json()


def names(entries):
    return [entry["username"] for entry in entries]


def status_of(client, headers, username):
    return client.get(f"/players/{username}", headers=headers).json()["friend_status"]


def test_request_accept_and_list(client):
    opt_in(client, ALICE)
    opt_in(client, BOB)

    response = client.post("/friends/bob-id", headers=ALICE)
    assert response.status_code == 201
    assert names(response.json()["outgoing"]) == ["bob-id"]
    assert response.json()["friends"] == []

    # Pending on both sides, from each one's point of view.
    assert names(friends(client, BOB)["incoming"]) == ["alice-id"]
    assert friends(client, BOB)["outgoing"] == []
    assert status_of(client, ALICE, "bob-id") == "outgoing"
    assert status_of(client, BOB, "alice-id") == "incoming"

    accepted = client.post("/friends/alice-id/accept", headers=BOB)
    assert accepted.status_code == 200
    assert names(accepted.json()["friends"]) == ["alice-id"]
    assert accepted.json()["incoming"] == []

    mine = friends(client, ALICE)
    assert names(mine["friends"]) == ["bob-id"]
    assert mine["friends"][0]["display_name"] == "Bob"
    assert mine["friends"][0]["total_points"] == 0
    assert mine["friends"][0]["since"]
    assert mine["outgoing"] == []
    assert status_of(client, ALICE, "bob-id") == "friends"
    assert status_of(client, BOB, "alice-id") == "friends"


def test_only_addressee_can_accept(client):
    opt_in(client, ALICE)
    opt_in(client, BOB)
    opt_in(client, CAROL)
    client.post("/friends/bob-id", headers=ALICE)

    # The sender can't accept their own request, a third player can't either.
    assert client.post("/friends/bob-id/accept", headers=ALICE).status_code == 404
    assert client.post("/friends/alice-id/accept", headers=CAROL).status_code == 404
    assert client.post("/friends/bob-id/accept", headers=CAROL).status_code == 404
    assert friends(client, ALICE)["friends"] == []
    # Nothing to accept from someone who never asked.
    assert client.post("/friends/carol-id/accept", headers=BOB).status_code == 404


def test_no_self_duplicates_or_reverse_requests(client):
    opt_in(client, ALICE)
    opt_in(client, BOB)
    assert client.post("/friends/alice-id", headers=ALICE).status_code == 400

    assert client.post("/friends/bob-id", headers=ALICE).status_code == 201
    assert client.post("/friends/bob-id", headers=ALICE).status_code == 409
    # Bob already has Alice's request: he must accept it, not send a new one.
    assert client.post("/friends/alice-id", headers=BOB).status_code == 409
    assert len(friends(client, BOB)["incoming"]) == 1

    client.post("/friends/alice-id/accept", headers=BOB)
    assert client.post("/friends/bob-id", headers=ALICE).status_code == 409
    assert client.post("/friends/alice-id", headers=BOB).status_code == 409
    assert len(friends(client, ALICE)["friends"]) == 1


def test_decline_and_cancel_leave_no_friendship(client):
    opt_in(client, ALICE)
    opt_in(client, BOB)

    client.post("/friends/bob-id", headers=ALICE)
    declined = client.delete("/friends/alice-id", headers=BOB)
    assert declined.status_code == 200
    assert declined.json() == {"friends": [], "incoming": [], "outgoing": []}
    assert friends(client, ALICE) == {"friends": [], "incoming": [], "outgoing": []}
    assert status_of(client, ALICE, "bob-id") == "none"

    # Declined is not final: a new request can be sent later.
    assert client.post("/friends/bob-id", headers=ALICE).status_code == 201
    cancelled = client.delete("/friends/bob-id", headers=ALICE)
    assert cancelled.status_code == 200
    assert friends(client, BOB)["incoming"] == []
    # Nothing left to remove.
    assert client.delete("/friends/bob-id", headers=ALICE).status_code == 404
    assert client.delete("/friends/alice-id", headers=BOB).status_code == 404


def test_removing_a_friend_updates_both_lists(client):
    opt_in(client, ALICE)
    opt_in(client, BOB)
    client.post("/friends/bob-id", headers=ALICE)
    client.post("/friends/alice-id/accept", headers=BOB)

    removed = client.delete("/friends/alice-id", headers=BOB)
    assert removed.status_code == 200
    assert removed.json()["friends"] == []
    assert friends(client, ALICE)["friends"] == []
    assert status_of(client, ALICE, "bob-id") == "none"
    # Either side could have removed it; Alice can ask again.
    assert client.post("/friends/bob-id", headers=ALICE).status_code == 201


def test_requests_need_a_visible_player(client):
    opt_in(client, ALICE)
    client.get("/me", headers=BOB)  # Bob exists but did not opt in.
    assert client.post("/friends/bob-id", headers=ALICE).status_code == 404
    assert client.post("/friends/nobody", headers=ALICE).status_code == 404

    # Once friends, opting out hides the profile but keeps the friendship
    # manageable by both sides.
    opt_in(client, BOB)
    client.post("/friends/bob-id", headers=ALICE)
    client.post("/friends/alice-id/accept", headers=BOB)
    opt_in(client, BOB, discoverable=False)
    assert names(friends(client, ALICE)["friends"]) == ["bob-id"]
    # Friends see each other's profile even without the opt-in...
    assert client.get("/players/bob-id", headers=ALICE).status_code == 200
    assert client.delete("/friends/bob-id", headers=ALICE).status_code == 200
    # ...but once the friendship is gone, Bob is private again.
    assert client.get("/players/bob-id", headers=ALICE).status_code == 404


def test_open_request_makes_profiles_visible_both_ways(client):
    opt_in(client, ALICE, discoverable=False)
    opt_in(client, BOB)
    client.post("/friends/bob-id", headers=ALICE)
    # Bob never opted in to see Alice, but he must be able to look at who
    # is asking before accepting.
    assert client.get("/players/alice-id", headers=BOB).status_code == 200
    assert client.get("/players/alice-id", headers=CAROL).status_code == 404


def test_players_only_see_their_own_connections(client):
    opt_in(client, ALICE)
    opt_in(client, BOB)
    opt_in(client, CAROL)
    client.post("/friends/bob-id", headers=ALICE)
    client.post("/friends/carol-id", headers=BOB)
    client.post("/friends/alice-id/accept", headers=BOB)

    assert friends(client, CAROL) == {
        "friends": [], "incoming": [{
            "username": "bob-id", "display_name": "Bob",
            "created_at": friends(client, CAROL)["incoming"][0]["created_at"],
        }], "outgoing": [],
    }
    # Carol can't touch the Alice–Bob friendship.
    assert client.delete("/friends/alice-id", headers=CAROL).status_code == 404
    assert names(friends(client, ALICE)["friends"]) == ["bob-id"]
    assert names(friends(client, BOB)["friends"]) == ["alice-id"]
    assert names(friends(client, BOB)["outgoing"]) == ["carol-id"]


def suggested(client, headers):
    return names(client.get("/me", headers=headers).json()["suggestions"]["suggestions"])


def test_friends_and_open_requests_are_not_suggested(client):
    for headers in (ALICE, BOB, CAROL):
        assert client.put("/me", headers=headers, json={
            "hobbies": ["chess"], "discoverable": True}).status_code == 200
    assert suggested(client, ALICE) == ["bob-id", "carol-id"]

    # An open request hides the player on both sides.
    client.post("/friends/bob-id", headers=ALICE)
    assert suggested(client, ALICE) == ["carol-id"]
    assert suggested(client, BOB) == ["carol-id"]

    client.post("/friends/alice-id/accept", headers=BOB)
    assert suggested(client, ALICE) == ["carol-id"]
    assert suggested(client, BOB) == ["carol-id"]

    # Once the friendship is gone, they can be suggested again...
    client.delete("/friends/bob-id", headers=ALICE)
    assert suggested(client, ALICE) == ["bob-id", "carol-id"]
    # ...unless the player hid them.
    assert client.delete("/me/suggestions/bob-id", headers=ALICE).status_code in (200, 204)
    assert suggested(client, ALICE) == ["carol-id"]


def test_friends_need_identity(client):
    assert client.get("/friends").status_code == 401
    assert client.post("/friends/bob-id").status_code == 401


# --- Friends leaderboard ------------------------------------------------------

def complete(client, headers, number):
    from sample_quests import QUESTS
    return act(client, headers, QUESTS[number - 1]["id"], "complete")


def board(client, headers, scope):
    response = client.get("/leaderboard", params={"scope": scope}, headers=headers)
    assert response.status_code == 200
    return response.json()


def ranking(payload):
    return [(e["rank"], e["display_name"], e["points"]) for e in payload["entries"]]


def befriend(client, requester, addressee, addressee_id, requester_id):
    assert client.post(f"/friends/{addressee_id}", headers=requester).status_code == 201
    assert client.post(f"/friends/{requester_id}/accept", headers=addressee).status_code == 200


def test_friends_leaderboard_ranks_only_accepted_friends(client):
    for headers in (ALICE, BOB, CAROL):
        opt_in(client, headers)
    dave = identity("dave-id", "Dave")
    opt_in(client, dave)
    complete(client, ALICE, 1)   # 10
    complete(client, BOB, 1)     # 10
    complete(client, CAROL, 2)   # 20
    complete(client, dave, 2)    # 20

    befriend(client, ALICE, BOB, "bob-id", "alice-id")
    befriend(client, ALICE, CAROL, "carol-id", "alice-id")
    client.post("/friends/dave-id", headers=ALICE)  # pending: not in the group

    mine = board(client, ALICE, "friends")
    assert mine["scope"] == "friends"
    assert mine["friend_count"] == 2
    # Ranked within the group only: Dave's 20 points don't count here.
    assert ranking(mine) == [(1, "Carol", 20), (2, "Alice", 10), (2, "Bob", 10)]
    assert [e["is_current_player"] for e in mine["entries"]] == [False, True, False]
    assert mine["current_player"]["rank"] == 2

    # Same points, different group: global rank differs.
    everyone = board(client, ALICE, "global")
    assert everyone["scope"] == "global"
    assert ranking(everyone) == [
        (1, "Carol", 20), (1, "Dave", 20), (3, "Alice", 10), (3, "Bob", 10)]
    assert everyone["current_player"]["rank"] == 3
    # The default stays global.
    assert client.get("/leaderboard", headers=ALICE).json()["scope"] == "global"


def test_friends_leaderboard_is_scoped_and_includes_zero_points(client):
    for headers in (ALICE, BOB, CAROL):
        opt_in(client, headers)
    complete(client, ALICE, 1)
    befriend(client, ALICE, BOB, "bob-id", "alice-id")
    befriend(client, BOB, CAROL, "carol-id", "bob-id")

    # Bob with no points is still listed among Alice's friends.
    assert ranking(board(client, ALICE, "friends")) == [(1, "Alice", 10), (2, "Bob", 0)]
    # Carol is Bob's friend, not Alice's: each player sees their own group.
    assert ranking(board(client, BOB, "friends")) == [
        (1, "Alice", 10), (2, "Bob", 0), (2, "Carol", 0)]
    assert ranking(board(client, CAROL, "friends")) == [(1, "Bob", 0), (1, "Carol", 0)]


def test_friends_leaderboard_empty_state_and_removal(client):
    opt_in(client, ALICE)
    opt_in(client, BOB)
    complete(client, BOB, 1)

    alone = board(client, ALICE, "friends")
    assert alone["friend_count"] == 0
    assert ranking(alone) == [(1, "Alice", 0)]
    assert alone["current_player"]["is_current_player"] is True

    befriend(client, ALICE, BOB, "bob-id", "alice-id")
    assert ranking(board(client, ALICE, "friends")) == [(1, "Bob", 10), (2, "Alice", 0)]

    # Removing the friend updates both boards at once.
    client.delete("/friends/alice-id", headers=BOB)
    assert ranking(board(client, ALICE, "friends")) == [(1, "Alice", 0)]
    assert ranking(board(client, BOB, "friends")) == [(1, "Bob", 10)]
    # Declined requests never counted.
    client.post("/friends/alice-id", headers=BOB)
    client.delete("/friends/bob-id", headers=ALICE)
    assert board(client, ALICE, "friends")["friend_count"] == 0


def test_leaderboard_rejects_unknown_scope(client):
    assert client.get("/leaderboard", params={"scope": "team"}, headers=ALICE).status_code == 422


# --- Friend badge -------------------------------------------------------------

def friend_badge(client, headers):
    badges = {b["key"]: b for b in client.get("/me", headers=headers).json()["badges"]}
    return badges["first_friend"]


def stored_friend_badges():
    with SessionLocal() as db:
        return sorted(db.scalars(select(EarnedBadge.player_id).where(
            EarnedBadge.badge_key == "first_friend")))


def test_friend_badge_is_listed_with_its_condition(client):
    badge = friend_badge(client, ALICE)
    assert badge["title"] == "New friend"
    assert badge["description"] == "Become friends with another player."
    assert (badge["earned"], badge["progress"], badge["target"]) == (False, 0, 1)


def test_accepted_friendship_unlocks_badge_for_both(client):
    opt_in(client, ALICE)
    opt_in(client, BOB)
    befriend(client, ALICE, BOB, "bob-id", "alice-id")

    for headers in (ALICE, BOB):
        badge = friend_badge(client, headers)
        assert badge["earned"] is True
        assert badge["earned_at"]
        assert badge["progress"] == 1
    assert stored_friend_badges() == ["alice-id", "bob-id"]
    # Also shown on each other's public profile.
    seen = client.get("/players/bob-id", headers=ALICE).json()
    assert {b["key"]: b for b in seen["badges"]}["first_friend"]["earned"] is True


def test_self_pending_and_declined_requests_do_not_unlock(client):
    opt_in(client, ALICE)
    opt_in(client, BOB)
    assert client.post("/friends/alice-id", headers=ALICE).status_code == 400

    client.post("/friends/bob-id", headers=ALICE)            # pending
    assert friend_badge(client, ALICE)["earned"] is False
    assert friend_badge(client, BOB)["earned"] is False

    client.delete("/friends/alice-id", headers=BOB)          # declined
    client.post("/friends/bob-id", headers=ALICE)
    client.delete("/friends/bob-id", headers=ALICE)          # cancelled
    assert friend_badge(client, ALICE)["earned"] is False
    assert friend_badge(client, BOB)["earned"] is False
    assert stored_friend_badges() == []


def test_badge_is_issued_once_and_kept_after_removal(client):
    opt_in(client, ALICE)
    opt_in(client, BOB)
    opt_in(client, CAROL)
    befriend(client, ALICE, BOB, "bob-id", "alice-id")
    first = friend_badge(client, ALICE)["earned_at"]

    # More friends, then removing and re-adding the same friend.
    befriend(client, CAROL, ALICE, "alice-id", "carol-id")
    client.delete("/friends/bob-id", headers=ALICE)
    assert friend_badge(client, ALICE)["earned"] is True
    assert friend_badge(client, BOB)["earned"] is True
    befriend(client, BOB, ALICE, "alice-id", "bob-id")

    assert friend_badge(client, ALICE)["earned_at"] == first
    assert stored_friend_badges() == ["alice-id", "bob-id", "carol-id"]

    # Removing every friend keeps the badge.
    client.delete("/friends/bob-id", headers=ALICE)
    client.delete("/friends/carol-id", headers=ALICE)
    assert friends(client, ALICE)["friends"] == []
    assert friend_badge(client, ALICE)["earned"] is True
    assert friend_badge(client, ALICE)["earned_at"] == first


def test_friendship_accepted_before_badges_were_stored_counts(client):
    opt_in(client, ALICE)
    opt_in(client, BOB)
    befriend(client, ALICE, BOB, "bob-id", "alice-id")
    with SessionLocal() as db:  # as on a database from before this badge
        db.execute(delete(EarnedBadge))
        db.commit()
    assert friend_badge(client, ALICE)["earned"] is True
    assert friend_badge(client, BOB)["earned"] is True
