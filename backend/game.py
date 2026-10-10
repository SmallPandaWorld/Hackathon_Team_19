"""Game rules shared by the routers: scoring, visibility, meetups, validation."""

import json
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import (
    APPROVED,
    MEETUP,
    MULTI_STEP,
    PUBLISHED,
    QUIZ,
    Completion,
    MeetupRsvp,
    Quest,
    QuestReport,
    QuestStep,
    QuizQuestion,
    StepProgress,
    User,
)
from schemas import CompletionResult, ErrorResponse, QuestOut, QuizQuestionOut, StepOut

# Meetup check-in opens this long before the start time.
CHECK_IN_EARLY = timedelta(minutes=15)


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def as_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc)


def to_naive_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Store aware datetimes as naive UTC; naive input is assumed to be UTC."""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


ERROR_DESCRIPTIONS = {
    400: "Not allowed for this quest",
    401: "Missing VISCON identity",
    403: "Maintainers only",
    404: "Not found",
    409: "Conflicts with the current state",
    410: "Code expired or cancelled",
}


def error_responses(*codes: int) -> dict:
    """OpenAPI docs for `{"detail": "..."}` errors, so Orval types them."""
    return {
        code: {"model": ErrorResponse, "description": ERROR_DESCRIPTIONS[code]}
        for code in codes
    }


def not_found(what: str = "Quest") -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail=f"{what} not found.")


def conflict(message: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, detail=message)


def bad_request(message: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail=message)


# --- Scoring ------------------------------------------------------------------

def total_points(db: Session, player_id: int) -> int:
    query = select(func.coalesce(func.sum(Completion.points_awarded), 0)).where(
        Completion.player_id == player_id, Completion.status == APPROVED)
    return db.scalar(query)


def find_completion(db: Session, player_id: int, quest_id: int) -> Optional[Completion]:
    return db.scalars(select(Completion).where(
        Completion.player_id == player_id,
        Completion.quest_id == quest_id,
    )).first()


def record_completion(
    db: Session,
    player_id: int,
    quest: Quest,
    completion_status: str = APPROVED,
    note: Optional[str] = None,
) -> Tuple[Completion, bool]:
    """Save a completion once per player and quest; return (completion, created).

    Safe against double taps and parallel requests: the unique constraint
    decides which request wins, the others get the existing row.
    """
    completion = find_completion(db, player_id, quest.id)
    if completion is not None:
        return completion, False
    completion = Completion(
        player_id=player_id,
        quest_id=quest.id,
        completed_at=utcnow(),
        points_awarded=quest.points if completion_status == APPROVED else 0,
        status=completion_status,
        note=note,
    )
    db.add(completion)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return find_completion(db, player_id, quest.id), False
    return completion, True


def completion_result(
    db: Session, player_id: int, completion: Completion, created: bool
) -> CompletionResult:
    return CompletionResult(
        quest_id=completion.quest_id,
        completed=completion.status == APPROVED,
        status=completion.status,
        already_completed=not created,
        points_awarded=completion.points_awarded if created else 0,
        total_points=total_points(db, player_id),
        completed_at=as_utc(completion.completed_at),
    )


# --- Visibility and quest views -----------------------------------------------

def get_playable_quest(db: Session, quest_id: int, kind: Optional[str] = None) -> Quest:
    """A published quest the player can act on, optionally of a given kind."""
    quest = db.get(Quest, quest_id)
    if quest is None or quest.status != PUBLISHED:
        raise not_found()
    if kind is not None and quest.kind != kind:
        raise bad_request(f"This is not a {kind.replace('_', '-')} quest.")
    return quest


def can_view(db: Session, player: User, quest: Quest) -> bool:
    return (
        quest.status == PUBLISHED
        or quest.author_id == player.id
        or find_completion(db, player.id, quest.id) is not None
    )


def meetup_state(quest: Quest, now: Optional[datetime] = None) -> Optional[str]:
    if quest.kind != MEETUP:
        return None
    if quest.cancelled:
        return "cancelled"
    if quest.starts_at is None or quest.ends_at is None:
        return "upcoming"
    now = now or utcnow()
    if now < quest.starts_at - CHECK_IN_EARLY:
        return "upcoming"
    if now <= quest.ends_at:
        return "live"
    return "past"


def ordered_steps(db: Session, quest_id: int) -> List[QuestStep]:
    return list(db.scalars(
        select(QuestStep).where(QuestStep.quest_id == quest_id).order_by(QuestStep.position)))


def ordered_questions(db: Session, quest_id: int) -> List[QuizQuestion]:
    return list(db.scalars(
        select(QuizQuestion).where(QuizQuestion.quest_id == quest_id)
        .order_by(QuizQuestion.position)))


def done_step_ids(db: Session, player_id: int, steps: List[QuestStep]) -> set:
    if not steps:
        return set()
    return set(db.scalars(select(StepProgress.step_id).where(
        StepProgress.player_id == player_id,
        StepProgress.step_id.in_([step.id for step in steps]),
    )))


def quest_views(db: Session, player: User, quests: List[Quest]) -> List[QuestOut]:
    """Player-facing quest data, loaded with a fixed number of queries."""
    if not quests:
        return []
    ids = [quest.id for quest in quests]
    completions: Dict[int, Completion] = {
        c.quest_id: c for c in db.scalars(select(Completion).where(
            Completion.player_id == player.id, Completion.quest_id.in_(ids)))
    }
    steps_by_quest: Dict[int, List[QuestStep]] = {}
    for step in db.scalars(select(QuestStep).where(QuestStep.quest_id.in_(ids))
                           .order_by(QuestStep.position)):
        steps_by_quest.setdefault(step.quest_id, []).append(step)
    questions_by_quest: Dict[int, List[QuizQuestion]] = {}
    for question in db.scalars(select(QuizQuestion).where(QuizQuestion.quest_id.in_(ids))
                               .order_by(QuizQuestion.position)):
        questions_by_quest.setdefault(question.quest_id, []).append(question)
    done = set(db.scalars(select(StepProgress.step_id).where(
        StepProgress.player_id == player.id)))
    rsvp_counts = dict(db.execute(
        select(MeetupRsvp.quest_id, func.count()).where(MeetupRsvp.quest_id.in_(ids))
        .group_by(MeetupRsvp.quest_id)).all())
    my_rsvps = set(db.scalars(select(MeetupRsvp.quest_id).where(
        MeetupRsvp.player_id == player.id, MeetupRsvp.quest_id.in_(ids))))
    my_reports = set(db.scalars(select(QuestReport.quest_id).where(
        QuestReport.player_id == player.id, QuestReport.quest_id.in_(ids))))
    author_ids = {quest.author_id for quest in quests if quest.author_id}
    authors = dict(db.execute(
        select(User.id, User.name).where(User.id.in_(author_ids))).all()) if author_ids else {}

    now = utcnow()
    views = []
    for quest in quests:
        completion = completions.get(quest.id)
        approved = completion is not None and completion.status == APPROVED
        views.append(QuestOut(
            id=quest.id,
            title=quest.title,
            description=quest.description,
            location=quest.location,
            points=quest.points,
            kind=quest.kind,
            status=quest.status,
            requires_approval=quest.requires_approval,
            latitude=quest.latitude,
            longitude=quest.longitude,
            starts_at=as_utc(quest.starts_at),
            ends_at=as_utc(quest.ends_at),
            meetup_state=meetup_state(quest, now),
            author_name=authors.get(quest.author_id),
            completed=approved,
            completed_at=as_utc(completion.completed_at) if approved else None,
            completion_status=completion.status if completion else None,
            review_note=completion.review_note if completion else None,
            steps=[
                StepOut(id=s.id, position=s.position, title=s.title,
                        description=s.description, done=s.id in done)
                for s in steps_by_quest.get(quest.id, [])
            ],
            questions=[
                QuizQuestionOut(id=q.id, position=q.position, prompt=q.prompt,
                                choices=json.loads(q.choices))
                for q in questions_by_quest.get(quest.id, [])
            ],
            rsvp=quest.id in my_rsvps,
            rsvp_count=rsvp_counts.get(quest.id, 0),
            reported=quest.id in my_reports,
        ))
    return views


# --- Publishing rules ---------------------------------------------------------

def publish_problems(db: Session, quest: Quest) -> List[str]:
    """Everything that stops a quest from being published."""
    problems = []
    if len(quest.title.strip()) < 3:
        problems.append("Title needs at least 3 characters.")
    if len(quest.description.strip()) < 10:
        problems.append("Instructions need at least 10 characters.")
    if quest.points < 1:
        problems.append("Points must be at least 1.")
    if (quest.latitude is None) != (quest.longitude is None):
        problems.append("Map pin needs both coordinates (or neither).")
    if quest.kind == QUIZ:
        questions = ordered_questions(db, quest.id)
        if not questions:
            problems.append("A quiz needs at least one question.")
        for index, question in enumerate(questions, start=1):
            choices = json.loads(question.choices)
            if len([c for c in choices if c.strip()]) != len(choices) or len(choices) < 2:
                problems.append(f"Question {index} needs at least 2 non-empty choices.")
            if not 0 <= question.correct_index < len(choices):
                problems.append(f"Question {index} has no valid correct answer.")
    if quest.kind == MULTI_STEP and len(ordered_steps(db, quest.id)) < 2:
        problems.append("A multi-step quest needs at least 2 steps.")
    if quest.kind == MEETUP:
        if quest.starts_at is None or quest.ends_at is None:
            problems.append("A meetup needs a start and end time.")
        elif quest.starts_at >= quest.ends_at:
            problems.append("A meetup must end after it starts.")
    return problems


# --- Creating quests ----------------------------------------------------------

FIRST_APP_QUEST_ID = 1000


def add_quest(db: Session, **fields) -> Quest:
    """Insert a quest with the next free ID (>= 1000) and commit it.

    IDs are assigned here because built-in quests own the IDs below 1000.
    """
    for _ in range(5):
        highest = db.scalar(select(func.max(Quest.id))) or 0
        quest = Quest(id=max(highest + 1, FIRST_APP_QUEST_ID), **fields)
        db.add(quest)
        try:
            db.commit()
            return quest
        except IntegrityError:
            # Another request took this ID at the same moment; try the next.
            db.rollback()
    raise conflict("Could not create the quest, please try again.")
