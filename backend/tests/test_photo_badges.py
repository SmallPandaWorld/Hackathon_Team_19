"""Badges for profile pictures and quest photos. They are stored when the
picture is uploaded, so deleting pictures later keeps them."""

import pytest

from conftest import identity
from routers import photos, players
from sample_quests import QUESTS

ALICE = identity("alice-id", "Alice")
BOB = identity("bob-id", "Bob")
PAIR_ID = str(QUESTS[3]["id"])
STEPS_ID = str(QUESTS[5]["id"])
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16  # enough for the signature check
PNG_HEADERS = {"Content-Type": "image/png"}


@pytest.fixture(autouse=True)
def picture_dirs(tmp_path, monkeypatch):
    monkeypatch.setattr(players, "AVATAR_STORAGE_DIR", tmp_path / "avatars")
    monkeypatch.setattr(photos, "QUEST_PHOTO_STORAGE_DIR", tmp_path / "quest_photos")


def badges(client, headers):
    return {b["key"]: b for b in client.get("/me", headers=headers).json()["badges"]}


def upload_photo(client, headers, quest_id=PAIR_ID):
    response = client.post(f"/quests/{quest_id}/player-photos", headers={**headers, **PNG_HEADERS},
                           content=PNG)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_first_profile_picture_badge_is_kept_after_removal(client):
    assert badges(client, ALICE)["first_avatar"]["earned"] is False

    assert client.put("/me/avatar", headers={**ALICE, **PNG_HEADERS}, content=PNG).status_code == 204
    earned = badges(client, ALICE)["first_avatar"]
    assert earned["earned"] is True and earned["earned_at"]
    assert (earned["progress"], earned["target"]) == (1, 1)
    # Only the uploader gets it.
    assert badges(client, BOB)["first_avatar"]["earned"] is False

    # Replacing or removing the picture keeps the badge and its date.
    assert client.put("/me/avatar", headers={**ALICE, **PNG_HEADERS}, content=PNG).status_code == 204
    assert client.delete("/me/avatar", headers=ALICE).status_code == 204
    assert badges(client, ALICE)["first_avatar"]["earned_at"] == earned["earned_at"]


def test_quest_photo_badges_follow_the_photo_count(client):
    before = badges(client, ALICE)
    assert before["first_quest_photo"]["earned"] is False
    assert (before["quest_photo_master"]["progress"], before["quest_photo_master"]["target"]) == (0, 20)

    first_id = upload_photo(client, ALICE)
    after_one = badges(client, ALICE)
    assert after_one["first_quest_photo"]["earned"] is True
    assert after_one["quest_photo_master"]["earned"] is False
    assert after_one["quest_photo_master"]["progress"] == 1

    for _ in range(18):
        upload_photo(client, ALICE, STEPS_ID)
    assert badges(client, ALICE)["quest_photo_master"]["progress"] == 19
    assert badges(client, ALICE)["quest_photo_master"]["earned"] is False

    upload_photo(client, ALICE)
    master = badges(client, ALICE)["quest_photo_master"]
    assert master["earned"] is True and master["earned_at"]
    assert master["progress"] == 20

    # Deleting photos never takes the badges away.
    assert client.delete(f"/quests/{PAIR_ID}/player-photos/{first_id}", headers=ALICE).status_code in (200, 204)
    kept = badges(client, ALICE)
    assert kept["first_quest_photo"]["earned"] is True
    assert kept["quest_photo_master"]["earned"] is True
    assert kept["quest_photo_master"]["progress"] == 20

    # Bob's photos are his own.
    assert badges(client, BOB)["first_quest_photo"]["earned"] is False
