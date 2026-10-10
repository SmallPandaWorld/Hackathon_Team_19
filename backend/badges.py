"""Achievement badges.

Quest badges are computed from saved approved completions: nothing is
stored, so they can never be issued twice and always match the player's
progress. `earned_at` is the completion that unlocked them.

The friend badge must survive the friendship being removed, so it is stored
in `earned_badges` when a request is accepted (see `award_badge`). The photo
badges work the same way: they are stored when the picture is uploaded, so
deleting pictures later never takes a badge away.
"""

from datetime import datetime
from typing import List, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from game import as_utc
from models import (
    APPROVED,
    FRIEND_ACCEPTED,
    MEETUP,
    MULTI_STEP,
    PAIR,
    QUIZ,
    Completion,
    EarnedBadge,
    Friendship,
    Quest,
    QuestPhoto,
)
from schemas import Badge

FIRST_FRIEND = "first_friend"
FIRST_AVATAR = "first_avatar"
FIRST_QUEST_PHOTO = "first_quest_photo"
QUEST_PHOTO_MASTER = "quest_photo_master"
QUEST_PHOTO_MASTER_TARGET = 20

# key, title, description, rule
BADGES = [
    ("first_quest", "First steps", "Complete your first quest.", ("count", 1)),
    ("explorer", "Explorer", "Complete 5 quests.", ("count", 5)),
    ("social", "Social butterfly", "Complete a quest together with another player.", ("kind", PAIR)),
    ("quiz", "Quiz whiz", "Pass a quiz.", ("kind", QUIZ)),
    ("tour", "Pathfinder", "Finish a multi-step quest.", ("kind", MULTI_STEP)),
    ("meetup", "Showed up", "Check in at a group meetup.", ("kind", MEETUP)),
    ("century", "Century", "Collect 100 points.", ("points", 100)),
    (FIRST_FRIEND, "New friend", "Become friends with another player.", ("friend", None)),
    (FIRST_AVATAR, "First profile picture", "Add a profile picture.", ("stored", None)),
    (FIRST_QUEST_PHOTO, "First quest photo", "Share your first quest photo.", ("photos", 1)),
    (QUEST_PHOTO_MASTER, "Quest photo master",
     f"Share {QUEST_PHOTO_MASTER_TARGET} quest photos.", ("photos", QUEST_PHOTO_MASTER_TARGET)),
]


def award_badge(db: Session, player_id: str, key: str, earned_at: datetime) -> None:
    """Store a badge unless the player already has it. Does not commit."""
    db.execute(
        insert(EarnedBadge)
        .values(player_id=player_id, badge_key=key, earned_at=earned_at)
        .on_conflict_do_nothing(index_elements=["player_id", "badge_key"])
    )


def stored_badge_at(db: Session, player_id: str, key: str) -> Optional[datetime]:
    return db.scalar(select(EarnedBadge.earned_at).where(
        EarnedBadge.player_id == player_id, EarnedBadge.badge_key == key))


def award_photo_badges(db: Session, player_id: str, uploaded_at: datetime) -> None:
    """Call after a quest photo was saved: stores the photo badges the
    player's photo count has just reached. Does not commit."""
    count = db.scalar(select(func.count()).select_from(QuestPhoto).where(
        QuestPhoto.uploader_id == player_id))
    if count >= 1:
        award_badge(db, player_id, FIRST_QUEST_PHOTO, uploaded_at)
    if count >= QUEST_PHOTO_MASTER_TARGET:
        award_badge(db, player_id, QUEST_PHOTO_MASTER, uploaded_at)


def first_friend_at(db: Session, player_id: str) -> Optional[datetime]:
    """When the player first had a friend: the stored badge, or for
    friendships accepted before badges were stored, the oldest one."""
    stored = db.scalar(select(EarnedBadge.earned_at).where(
        EarnedBadge.player_id == player_id, EarnedBadge.badge_key == FIRST_FRIEND))
    current = db.scalar(select(func.min(Friendship.accepted_at)).where(
        Friendship.status == FRIEND_ACCEPTED,
        or_(Friendship.requester_id == player_id, Friendship.addressee_id == player_id),
    ))
    return min((t for t in (stored, current) if t is not None), default=None)


def player_badges(db: Session, player_id: str) -> List[Badge]:
    rows = db.execute(
        select(Completion.completed_at, Completion.points_awarded, Quest.kind)
        .join(Quest, Quest.id == Completion.quest_id)
        .where(Completion.player_id == player_id, Completion.status == APPROVED)
        .order_by(Completion.completed_at, Completion.id)
    ).all()

    photo_times = list(db.scalars(
        select(QuestPhoto.uploaded_at).where(QuestPhoto.uploader_id == player_id)
        .order_by(QuestPhoto.uploaded_at, QuestPhoto.id)))

    badges = []
    for key, title, description, (rule, value) in BADGES:
        earned_at: Optional[datetime] = None
        if rule == "stored":
            earned_at = stored_badge_at(db, player_id, key)
            progress, target = (1 if earned_at else 0), 1
        elif rule == "photos":
            # Current photos count as progress; a stored badge survives deletions.
            stored = stored_badge_at(db, player_id, key)
            if len(photo_times) >= value:
                earned_at = photo_times[value - 1]
            if stored is not None and (earned_at is None or stored < earned_at):
                earned_at = stored
            progress, target = (value if earned_at else len(photo_times)), value
        elif rule == "count":
            progress, target = len(rows), value
            if len(rows) >= value:
                earned_at = rows[value - 1].completed_at
        elif rule == "kind":
            earned_at = next((r.completed_at for r in rows if r.kind == value), None)
            progress, target = (1 if earned_at else 0), 1
        elif rule == "friend":
            earned_at = first_friend_at(db, player_id)
            progress, target = (1 if earned_at else 0), 1
        else:  # points
            running = 0
            for row in rows:
                running += row.points_awarded
                if running >= value and earned_at is None:
                    earned_at = row.completed_at
            progress, target = running, value
        badges.append(Badge(
            key=key,
            title=title,
            description=description,
            earned=earned_at is not None,
            earned_at=as_utc(earned_at),
            progress=min(progress, target),
            target=target,
        ))
    return badges
