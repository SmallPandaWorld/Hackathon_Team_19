"""Achievement badges.

Quest badges are computed from saved approved completions: nothing is
stored, so they can never be issued twice and always match the player's
progress. `earned_at` is the completion that unlocked them.

The friend badge must survive the friendship being removed, so it is stored
in `earned_badges` when a request is accepted (see `award_badge`).
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
)
from schemas import Badge

FIRST_FRIEND = "first_friend"

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
]


def award_badge(db: Session, player_id: str, key: str, earned_at: datetime) -> None:
    """Store a badge unless the player already has it. Does not commit."""
    db.execute(
        insert(EarnedBadge)
        .values(player_id=player_id, badge_key=key, earned_at=earned_at)
        .on_conflict_do_nothing(index_elements=["player_id", "badge_key"])
    )


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

    badges = []
    for key, title, description, (rule, value) in BADGES:
        earned_at: Optional[datetime] = None
        if rule == "count":
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
