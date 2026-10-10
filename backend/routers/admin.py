"""Maintainer-only endpoints: quest editor, publishing, reviews and reports.

Editing rules that protect saved progress:
- Points changes only affect future completions (completions keep a snapshot).
- A quest's kind can't change once someone completed it.
- Steps can be reworded, but not added/removed once players have progress.
- Retiring hides a quest but keeps all completions and points.
- A published quest must stay publishable.
"""

import json
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, status
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from auth import require_maintainer
from database import get_db
from game import (
    QUEST_CREATION_ORDER,
    as_utc,
    conflict,
    error_responses,
    not_found,
    ordered_questions,
    ordered_steps,
    publish_problems,
    to_naive_utc,
    utcnow,
)
from models import (
    APPROVED,
    COMPLETION_REJECTED,
    DRAFT,
    MEETUP,
    MULTI_STEP,
    PENDING,
    PENDING_REVIEW,
    PUBLISHED,
    QUIZ,
    REJECTED,
    RETIRED,
    SOLO,
    Completion,
    Quest,
    QuestReport,
    QuestStep,
    QuizQuestion,
    StepProgress,
    User,
)
from schemas import (
    AdminCompletionOut,
    AdminQuestIn,
    AdminQuestOut,
    AdminQuestPatch,
    AdminQuizQuestionOut,
    AdminReportOut,
    CompletionReview,
    CompletionStatus,
    QuestStatus,
    ReportResolution,
    StepIn,
)

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_maintainer)],
    responses=error_responses(401, 403),
)


def cannot_publish(problems: List[str]):
    return conflict("Can't publish: " + " ".join(problems))


def get_quest_or_404(db: Session, quest_id: UUID) -> Quest:
    quest = db.get(Quest, quest_id)
    if quest is None:
        raise not_found()
    return quest


def admin_quest_out(db: Session, quest: Quest) -> AdminQuestOut:
    author = db.get(User, quest.author_id) if quest.author_id else None
    return AdminQuestOut(
        id=quest.id,
        title=quest.title,
        description=quest.description,
        location=quest.location,
        points=quest.points,
        kind=quest.kind,
        status=quest.status,
        requires_approval=quest.requires_approval,
        requires_code=quest.requires_code,
        verification_code=quest.verification_code,
        verification_starts_at=as_utc(quest.verification_starts_at),
        verification_ends_at=as_utc(quest.verification_ends_at),
        latitude=quest.latitude,
        longitude=quest.longitude,
        starts_at=as_utc(quest.starts_at),
        ends_at=as_utc(quest.ends_at),
        cancelled=quest.cancelled,
        author_name=author.name if author else None,
        review_note=quest.review_note,
        steps=[StepIn(title=s.title, description=s.description)
               for s in ordered_steps(db, quest.id)],
        questions=[
            AdminQuizQuestionOut(id=q.id, prompt=q.prompt, choices=json.loads(q.choices),
                                 correct_index=q.correct_index)
            for q in ordered_questions(db, quest.id)
        ],
        completion_count=db.scalar(select(func.count()).where(
            Completion.quest_id == quest.id, Completion.status == APPROVED)),
        open_reports=db.scalar(select(func.count()).where(
            QuestReport.quest_id == quest.id, QuestReport.resolved.is_(False))),
        publish_problems=publish_problems(db, quest),
    )


def apply_quest_input(db: Session, quest: Quest, data: AdminQuestIn) -> None:
    """Copy editor input onto a quest (not committed)."""
    has_completions = db.scalar(select(func.count()).where(Completion.quest_id == quest.id))
    if quest.kind != data.kind and has_completions:
        raise conflict("Players already completed this quest, so its type can't change.")

    quest.title = data.title.strip()
    quest.description = data.description.strip()
    quest.location = (data.location or "").strip() or None
    quest.points = data.points
    quest.kind = data.kind
    quest.requires_approval = data.requires_approval and data.kind == SOLO
    quest.requires_code = data.requires_code and data.kind == SOLO
    quest.verification_starts_at = (
        to_naive_utc(data.verification_starts_at) if quest.requires_code else None)
    quest.verification_ends_at = (
        to_naive_utc(data.verification_ends_at) if quest.requires_code else None)
    quest.latitude = data.latitude
    quest.longitude = data.longitude
    is_meetup = data.kind == MEETUP
    quest.starts_at = to_naive_utc(data.starts_at) if is_meetup else None
    quest.ends_at = to_naive_utc(data.ends_at) if is_meetup else None
    quest.cancelled = data.cancelled and is_meetup

    steps = ordered_steps(db, quest.id)
    new_steps = data.steps if data.kind == MULTI_STEP else []
    if len(steps) == len(new_steps):
        for step, new in zip(steps, new_steps):
            step.title = new.title.strip()
            step.description = new.description.strip()
    else:
        started = steps and db.scalar(select(func.count()).where(
            StepProgress.step_id.in_([s.id for s in steps])))
        if started:
            raise conflict(
                "Players already started these steps. You can reword steps, "
                "but not add or remove them.")
        db.execute(delete(QuestStep).where(QuestStep.quest_id == quest.id))
        db.flush()
        for position, new in enumerate(new_steps, start=1):
            db.add(QuestStep(quest_id=quest.id, position=position,
                             title=new.title.strip(), description=new.description.strip()))

    new_questions = [
        (q.prompt.strip(), json.dumps([c.strip() for c in q.choices]), q.correct_index)
        for q in (data.questions if data.kind == QUIZ else [])
    ]
    old_questions = [(q.prompt, q.choices, q.correct_index)
                     for q in ordered_questions(db, quest.id)]
    if new_questions != old_questions:  # unchanged questions keep their IDs
        db.execute(delete(QuizQuestion).where(QuizQuestion.quest_id == quest.id))
        db.flush()
        for position, (prompt, choices, correct_index) in enumerate(new_questions, start=1):
            db.add(QuizQuestion(quest_id=quest.id, position=position, prompt=prompt,
                                choices=choices, correct_index=correct_index))
    db.flush()


# --- Quests -------------------------------------------------------------------

def quest_input(db: Session, quest: Quest) -> dict:
    """The quest's current editor fields, as AdminQuestIn data."""
    return {
        "title": quest.title,
        "description": quest.description,
        "location": quest.location,
        "points": quest.points,
        "kind": quest.kind,
        "requires_approval": quest.requires_approval,
        "requires_code": quest.requires_code,
        "verification_starts_at": as_utc(quest.verification_starts_at),
        "verification_ends_at": as_utc(quest.verification_ends_at),
        "latitude": quest.latitude,
        "longitude": quest.longitude,
        "starts_at": as_utc(quest.starts_at),
        "ends_at": as_utc(quest.ends_at),
        "cancelled": quest.cancelled,
        "steps": [{"title": s.title, "description": s.description}
                  for s in ordered_steps(db, quest.id)],
        "questions": [{"prompt": q.prompt, "choices": json.loads(q.choices),
                       "correct_index": q.correct_index}
                      for q in ordered_questions(db, quest.id)],
    }


def ensure_publishable(db: Session, quest: Quest) -> None:
    """Undo the pending changes and fail if a published quest isn't publishable."""
    if quest.status != PUBLISHED:
        return
    problems = publish_problems(db, quest)
    if problems:
        db.rollback()
        raise cannot_publish(problems)


@router.get("/quests", response_model=List[AdminQuestOut])
def admin_list_quests(status: Optional[QuestStatus] = None, db: Session = Depends(get_db)):
    """All quests, newest first. Filter by `status`, e.g. pending_review."""
    query = select(Quest).order_by(QUEST_CREATION_ORDER.desc())
    if status is not None:
        query = query.where(Quest.status == status)
    return [admin_quest_out(db, quest) for quest in db.scalars(query)]


@router.get("/quests/{quest_id}", response_model=AdminQuestOut, responses=error_responses(404))
def admin_get_quest(quest_id: UUID, db: Session = Depends(get_db)):
    return admin_quest_out(db, get_quest_or_404(db, quest_id))


@router.post("/quests", status_code=status.HTTP_201_CREATED, response_model=AdminQuestOut,
             responses=error_responses(409))
def admin_create_quest(data: AdminQuestIn, db: Session = Depends(get_db)):
    """Create a quest, as a draft by default. Creating it as `published`
    fails with 409 if it isn't publishable yet."""
    quest = Quest(title=data.title, description=data.description,
                  points=data.points, kind=data.kind, status=DRAFT)
    db.add(quest)
    db.flush()
    apply_quest_input(db, quest, data)
    quest.status = data.status
    ensure_publishable(db, quest)
    db.commit()
    return admin_quest_out(db, quest)


@router.patch("/quests/{quest_id}", response_model=AdminQuestOut,
              responses=error_responses(404, 409))
def admin_update_quest(quest_id: UUID, patch: AdminQuestPatch, db: Session = Depends(get_db)):
    """Change only the fields you send.

    `status` publishes, unpublishes (draft), retires, or rejects a player
    submission (only from pending_review; `review_note` is shown to the
    author). A published quest must stay publishable.
    """
    quest = get_quest_or_404(db, quest_id)
    changes = patch.model_dump(exclude_unset=True)
    new_status = changes.pop("status", None)
    has_note = "review_note" in changes
    review_note = (changes.pop("review_note", None) or "").strip() or None

    if new_status == REJECTED and quest.status != PENDING_REVIEW:
        raise conflict("Only submitted quests waiting for review can be rejected.")

    if changes:
        try:
            data = AdminQuestIn.model_validate({**quest_input(db, quest), **changes})
        except ValidationError as error:
            raise RequestValidationError([
                {**e, "loc": ("body", *e["loc"])}
                for e in error.errors(include_url=False, include_context=False)
            ])
        apply_quest_input(db, quest, data)

    if new_status == REJECTED or has_note:
        quest.review_note = review_note
    if new_status is not None:
        quest.status = new_status
    ensure_publishable(db, quest)
    db.commit()
    return admin_quest_out(db, quest)


# --- Completion reviews -------------------------------------------------------

def admin_completion_out(db: Session, completion: Completion) -> AdminCompletionOut:
    return AdminCompletionOut(
        id=completion.id,
        quest_id=completion.quest_id,
        quest_title=db.get(Quest, completion.quest_id).title,
        player_name=db.get(User, completion.player_id).name,
        note=completion.note,
        status=completion.status,
        completed_at=as_utc(completion.completed_at),
        review_note=completion.review_note,
    )


@router.get("/completions", response_model=List[AdminCompletionOut])
def admin_list_completions(status: CompletionStatus = PENDING, db: Session = Depends(get_db)):
    """Completions waiting for review (or with another status), oldest first."""
    completions = db.scalars(
        select(Completion).where(Completion.status == status)
        .order_by(Completion.completed_at))
    return [admin_completion_out(db, c) for c in completions]


@router.post("/completions/{completion_id}/review", response_model=AdminCompletionOut,
             responses=error_responses(404, 409))
def admin_review_completion(
    completion_id: UUID,
    review: CompletionReview,
    maintainer: User = Depends(require_maintainer),
    db: Session = Depends(get_db),
):
    """Approve (awards the quest's points) or reject (with an explanation).

    Only pending completions can be reviewed, so repeated approvals can't
    award points twice.
    """
    completion = db.get(Completion, completion_id)
    if completion is None:
        raise not_found("Completion")
    if completion.status != PENDING:
        raise conflict(f"This completion was already {completion.status}.")
    quest = db.get(Quest, completion.quest_id)
    if review.approve:
        completion.status = APPROVED
        completion.points_awarded = quest.points
    else:
        completion.status = COMPLETION_REJECTED
        completion.points_awarded = 0
    completion.review_note = (review.note or "").strip() or None
    completion.reviewer_id = maintainer.username
    completion.reviewed_at = utcnow()
    db.commit()
    return admin_completion_out(db, completion)


# --- Reports ------------------------------------------------------------------

@router.get("/reports", response_model=List[AdminReportOut])
def admin_list_reports(db: Session = Depends(get_db)):
    """Open content reports, oldest first."""
    reports = db.scalars(
        select(QuestReport).where(QuestReport.resolved.is_(False))
        .order_by(QuestReport.created_at))
    result = []
    for report in reports:
        quest = db.get(Quest, report.quest_id)
        result.append(AdminReportOut(
            id=report.id,
            quest_id=quest.id,
            quest_title=quest.title,
            quest_status=quest.status,
            reporter_name=db.get(User, report.player_id).name,
            reason=report.reason,
            created_at=as_utc(report.created_at),
        ))
    return result


@router.post("/reports/{report_id}/resolve", response_model=AdminQuestOut,
             responses=error_responses(404))
def admin_resolve_report(
    report_id: UUID, resolution: ReportResolution, db: Session = Depends(get_db)
):
    """Close a report. Retiring the quest also closes all its other reports."""
    report = db.get(QuestReport, report_id)
    if report is None:
        raise not_found("Report")
    quest = db.get(Quest, report.quest_id)
    report.resolved = True
    if resolution.retire_quest:
        quest.status = RETIRED
        for other in db.scalars(select(QuestReport).where(QuestReport.quest_id == quest.id)):
            other.resolved = True
    db.commit()
    return admin_quest_out(db, quest)
