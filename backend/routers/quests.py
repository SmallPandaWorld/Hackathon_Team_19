from typing import List, Optional
import hmac

from fastapi import APIRouter, Body, Depends, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import get_current_player
from database import get_db
from game import (
    add_quest,
    bad_request,
    can_view,
    completion_result,
    conflict,
    done_step_ids,
    error_responses,
    find_completion,
    get_playable_quest,
    meetup_state,
    not_found,
    ordered_questions,
    ordered_steps,
    quest_views,
    record_completion,
    utcnow,
)
from models import (
    APPROVED,
    COMPLETION_REJECTED,
    MEETUP,
    MULTI_STEP,
    PAIR,
    PENDING,
    PENDING_REVIEW,
    PUBLISHED,
    QUIZ,
    SOLO,
    MeetupRsvp,
    Quest,
    QuestReport,
    StepProgress,
    User,
)
from schemas import (
    CompleteRequest,
    CodeRedemption,
    CompletionResult,
    QuestOut,
    QuestSubmission,
    QuizResult,
    QuizSubmission,
    ReportRequest,
    RsvpResult,
    StepResult,
    SubmissionOut,
)

router = APIRouter(tags=["quests"], responses=error_responses(401))

# Player submissions: default reward (maintainers can change it before
# publishing) and how many may wait for review at once.
SUBMISSION_POINTS = 10
MAX_PENDING_SUBMISSIONS = 5

WRONG_ENDPOINT = {
    PAIR: "This quest needs a partner: start it and let another player enter your code.",
    QUIZ: "Answer the quiz questions to complete this quest.",
    MULTI_STEP: "Complete the steps of this quest one by one.",
}

MEETUP_CLOSED = {
    "upcoming": "Check-in opens 15 minutes before the meetup starts.",
    "past": "This meetup is over.",
    "cancelled": "This meetup was cancelled.",
}


@router.get("/quests", response_model=List[QuestOut])
def list_quests(player: User = Depends(get_current_player), db: Session = Depends(get_db)):
    """All published quests with the current player's progress."""
    quests = db.scalars(
        select(Quest).where(Quest.status == PUBLISHED).order_by(Quest.id)).all()
    return quest_views(db, player, list(quests))


@router.get("/quests/{quest_id}", response_model=QuestOut, responses=error_responses(404))
def get_quest(
    quest_id: int,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """One quest with full instructions and the current player's progress.

    Also returns retired quests the player completed and their own submissions.
    """
    quest = db.get(Quest, quest_id)
    if quest is None or not can_view(db, player, quest):
        raise not_found()
    return quest_views(db, player, [quest])[0]


@router.post(
    "/quests/{quest_id}/complete",
    response_model=CompletionResult,
    responses=error_responses(400, 404, 409),
)
def complete_quest(
    quest_id: int,
    request: Optional[CompleteRequest] = Body(default=None),
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Complete a solo quest, or check in at a live meetup.

    Idempotent: completing again returns the existing completion with
    `already_completed: true` and `points_awarded: 0`. Quests with
    `requires_approval` create a pending completion that awards points
    only once a maintainer approves it.
    """
    quest = get_playable_quest(db, quest_id)
    if quest.kind in WRONG_ENDPOINT:
        raise bad_request(WRONG_ENDPOINT[quest.kind])
    if quest.requires_code:
        raise bad_request("Enter this quest's printed code or scan its QR code to complete it.")

    existing = find_completion(db, player.id, quest.id)
    if quest.kind == MEETUP and existing is None:
        state = meetup_state(quest)
        if state != "live":
            raise conflict(MEETUP_CLOSED[state])

    note = None
    if request is not None and request.note:
        note = request.note.strip() or None
    if quest.kind == SOLO and quest.requires_approval:
        if existing is not None and existing.status == COMPLETION_REJECTED:
            # Resubmission after a rejection.
            existing.status = PENDING
            existing.note = note
            existing.completed_at = utcnow()
            existing.review_note = None
            existing.reviewer_id = None
            existing.reviewed_at = None
            db.commit()
            return completion_result(db, player.id, existing, created=True)
        completion, created = record_completion(db, player.id, quest, PENDING, note)
    else:
        completion, created = record_completion(db, player.id, quest, APPROVED)
    return completion_result(db, player.id, completion, created)


@router.post(
    "/quests/{quest_id}/redeem",
    response_model=CompletionResult,
    responses=error_responses(400, 404),
)
def redeem_quest_code(
    quest_id: int,
    request: CodeRedemption,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Redeem a printed code, once per player, for a code-verified solo quest."""
    quest = get_playable_quest(db, quest_id, SOLO)
    if not quest.requires_code:
        raise bad_request("This quest does not use code verification.")
    code = request.code.strip().upper()
    if not code.isascii() or not quest.verification_code or not hmac.compare_digest(code, quest.verification_code):
        raise bad_request("That code is not valid for this quest. Check the printed code and try again.")
    completion, created = record_completion(db, player.id, quest, APPROVED)
    return completion_result(db, player.id, completion, created)


@router.post(
    "/quests/{quest_id}/quiz",
    response_model=QuizResult,
    responses=error_responses(400, 404),
)
def submit_quiz(
    quest_id: int,
    submission: QuizSubmission,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Check quiz answers. All must be right to pass; retries are unlimited
    and the reward is granted only once."""
    quest = get_playable_quest(db, quest_id, QUIZ)
    questions = ordered_questions(db, quest.id)
    if len(submission.answers) != len(questions):
        raise bad_request("Answer every question.")

    correct = [
        answer == question.correct_index
        for answer, question in zip(submission.answers, questions)
    ]
    passed = all(correct)
    completion = None
    if passed:
        saved, created = record_completion(db, player.id, quest, APPROVED)
        completion = completion_result(db, player.id, saved, created)
    return QuizResult(
        passed=passed,
        correct_count=sum(correct),
        total=len(questions),
        correct=correct,
        completion=completion,
    )


@router.post(
    "/quests/{quest_id}/steps/{step_id}/complete",
    response_model=StepResult,
    responses=error_responses(400, 404, 409),
)
def complete_step(
    quest_id: int,
    step_id: int,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Mark the next step of a multi-step quest as done.

    Steps must be done in order. Finishing the last step completes the quest;
    points are only awarded for the whole quest, not per step.
    """
    quest = get_playable_quest(db, quest_id, MULTI_STEP)
    steps = ordered_steps(db, quest.id)
    step = next((s for s in steps if s.id == step_id), None)
    if step is None:
        raise not_found("Step")

    done = done_step_ids(db, player.id, steps)
    if step.id not in done:
        next_step = next(s for s in steps if s.id not in done)
        if next_step.id != step.id:
            raise conflict(f"Do step {next_step.position} first.")
        db.add(StepProgress(player_id=player.id, step_id=step.id, completed_at=utcnow()))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()  # double tap: already saved
        done = done_step_ids(db, player.id, steps)

    completion = None
    if len(done) == len(steps):
        saved, created = record_completion(db, player.id, quest, APPROVED)
        completion = completion_result(db, player.id, saved, created)
    return StepResult(
        step_id=step.id,
        steps_done=len(done),
        steps_total=len(steps),
        completion=completion,
    )


def rsvp_count(db: Session, quest_id: int) -> int:
    return db.scalar(select(func.count()).where(MeetupRsvp.quest_id == quest_id))


@router.post(
    "/quests/{quest_id}/rsvp",
    response_model=RsvpResult,
    responses=error_responses(400, 404, 409),
)
def join_meetup(
    quest_id: int,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Say you're coming to a meetup (optional; check-in works without it)."""
    quest = get_playable_quest(db, quest_id, MEETUP)
    if meetup_state(quest) in ("past", "cancelled"):
        raise conflict(MEETUP_CLOSED[meetup_state(quest)])
    db.add(MeetupRsvp(player_id=player.id, quest_id=quest.id, created_at=utcnow()))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # already joined
    return RsvpResult(rsvp=True, rsvp_count=rsvp_count(db, quest.id))


@router.delete(
    "/quests/{quest_id}/rsvp",
    response_model=RsvpResult,
    responses=error_responses(400, 404),
)
def leave_meetup(
    quest_id: int,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Withdraw a meetup RSVP."""
    quest = get_playable_quest(db, quest_id, MEETUP)
    rsvp = db.scalars(select(MeetupRsvp).where(
        MeetupRsvp.quest_id == quest.id, MeetupRsvp.player_id == player.id)).first()
    if rsvp is not None:
        db.delete(rsvp)
        db.commit()
    return RsvpResult(rsvp=False, rsvp_count=rsvp_count(db, quest.id))


@router.post(
    "/quests/{quest_id}/report",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=error_responses(404, 409),
)
def report_quest(
    quest_id: int,
    report: ReportRequest,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Report inappropriate quest content to the maintainers."""
    quest = get_playable_quest(db, quest_id)
    db.add(QuestReport(
        player_id=player.id,
        quest_id=quest.id,
        reason=report.reason.strip(),
        created_at=utcnow(),
    ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise conflict("You already reported this quest.")


def submission_out(quest: Quest) -> SubmissionOut:
    return SubmissionOut(
        id=quest.id,
        title=quest.title,
        description=quest.description,
        location=quest.location,
        status=quest.status,
        review_note=quest.review_note,
    )


@router.post(
    "/submissions",
    tags=["submissions"],
    status_code=status.HTTP_201_CREATED,
    response_model=SubmissionOut,
    responses=error_responses(409),
)
def submit_quest(
    submission: QuestSubmission,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Propose a new solo quest. A maintainer reviews it before it is published."""
    pending = db.scalar(select(func.count()).where(
        Quest.author_id == player.id, Quest.status == PENDING_REVIEW))
    if pending >= MAX_PENDING_SUBMISSIONS:
        raise conflict(
            f"You already have {MAX_PENDING_SUBMISSIONS} quests waiting for review.")
    location = (submission.location or "").strip() or None
    quest = add_quest(
        db,
        title=submission.title.strip(),
        description=submission.description.strip(),
        location=location,
        points=SUBMISSION_POINTS,
        kind=SOLO,
        status=PENDING_REVIEW,
        author_id=player.id,
    )
    return submission_out(quest)


@router.get("/submissions/mine", tags=["submissions"], response_model=List[SubmissionOut])
def list_my_submissions(
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """The current player's submitted quests and their review status."""
    quests = db.scalars(
        select(Quest).where(Quest.author_id == player.id).order_by(Quest.id.desc())).all()
    return [submission_out(quest) for quest in quests]
