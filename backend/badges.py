"""Achievement badges, computed from saved approved completions.

Nothing is stored, so a badge can never be issued twice and always matches
the player's progress. `earned_at` is the completion that unlocked it.
"""

from datetime import datetime
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from game import as_utc
from models import APPROVED, MEETUP, MULTI_STEP, PAIR, QUIZ, Completion, Quest
from schemas import Badge

# key, title, description, rule
BADGES = [
    ("first_quest", "First steps", "Complete your first quest.", ("count", 1)),
    ("explorer", "Explorer", "Complete 5 quests.", ("count", 5)),
    ("social", "Social butterfly", "Complete a quest together with another player.", ("kind", PAIR)),
    ("quiz", "Quiz whiz", "Pass a quiz.", ("kind", QUIZ)),
    ("tour", "Pathfinder", "Finish a multi-step quest.", ("kind", MULTI_STEP)),
    ("meetup", "Showed up", "Check in at a group meetup.", ("kind", MEETUP)),
    ("century", "Century", "Collect 100 points.", ("points", 100)),
]


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
