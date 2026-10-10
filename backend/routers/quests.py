"""Player-facing quests: browse, propose, and act on a quest."""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth import get_current_player
from database import get_db
from game import (
    QUEST_CREATION_ORDER,
    add_quest,
    can_view,
    cancel_pair,
    complete_quest,
    complete_step,
    conflict,
    error_responses,
    get_playable_quest,
    not_found,
    quest_views,
    report_quest,
    set_rsvp,
    start_pair,
    submission_out,
    submit_quiz,
)
from models import MEETUP, MULTI_STEP, PAIR, PENDING_REVIEW, PUBLISHED, QUIZ, SOLO, Quest, User
from schemas import (
    CompleteAction,
    PairCancelAction,
    PairStartAction,
    QuestAction,
    QuestActionResult,
    QuestOut,
    QuestSubmission,
    QuizAction,
    ReportAction,
    RsvpAction,
    StepAction,
    SubmissionOut,
)

router = APIRouter(tags=["quests"], responses=error_responses(401))

# Player submissions: default reward (maintainers can change it before
# publishing) and how many may wait for review at once.
SUBMISSION_POINTS = 10
MAX_PENDING_SUBMISSIONS = 5


def get_viewable_quest(db: Session, player: User, quest_id: UUID) -> Quest:
    quest = db.get(Quest, quest_id)
    if quest is None or not can_view(db, player, quest):
        raise not_found()
    return quest


@router.get("/quests", response_model=List[QuestOut])
def list_quests(player: User = Depends(get_current_player), db: Session = Depends(get_db)):
    """All published quests with the current player's progress."""
    quests = db.scalars(
        select(Quest).where(Quest.status == PUBLISHED).order_by(QUEST_CREATION_ORDER)).all()
    return quest_views(db, player, list(quests))


@router.get("/quests/{quest_id}", response_model=QuestOut, responses=error_responses(404))
def get_quest(
    quest_id: UUID,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """One quest with full instructions and the current player's progress
    (including their latest pair session).

    Also returns retired quests the player completed and their own submissions.
    """
    return quest_views(db, player, [get_viewable_quest(db, player, quest_id)])[0]


@router.post(
    "/quests",
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
        Quest.author_id == player.username, Quest.status == PENDING_REVIEW))
    if pending >= MAX_PENDING_SUBMISSIONS:
        raise conflict(
            f"You already have {MAX_PENDING_SUBMISSIONS} quests waiting for review.")
    quest = add_quest(
        db,
        title=submission.title.strip(),
        description=submission.description.strip(),
        location=(submission.location or "").strip() or None,
        points=SUBMISSION_POINTS,
        kind=SOLO,
        status=PENDING_REVIEW,
        author_id=player.username,
    )
    return submission_out(quest)


@router.post(
    "/quests/{quest_id}/actions",
    response_model=QuestActionResult,
    responses=error_responses(400, 404, 409),
)
def act_on_quest(
    quest_id: UUID,
    action: QuestAction,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Do something with a quest; `type` picks the action:

    - `complete`: complete a solo quest or check in at a live meetup
      (idempotent; approval quests create a pending completion).
    - `quiz`: check answers; all must be right, retries are unlimited.
    - `step`: mark the next step of a multi-step quest done (in order).
    - `rsvp`: say you're coming to a meetup (`attending: false` withdraws).
    - `report`: report inappropriate content to the maintainers.
    - `pair_start`: get a code for your partner (optionally invite a
      suggested player); replaces your earlier open code.
    - `pair_cancel`: cancel your open code (idempotent).

    Returns the quest as it is afterwards, plus the completion (and quiz
    result) when the action completed or submitted the quest.
    """
    completion = None
    quiz = None
    match action:
        case CompleteAction(note=note):
            quest = get_playable_quest(db, quest_id)
            completion = complete_quest(db, player, quest, note)
        case QuizAction(answers=answers):
            quest = get_playable_quest(db, quest_id, QUIZ)
            quiz, completion = submit_quiz(db, player, quest, answers)
        case StepAction(step_id=step_id):
            quest = get_playable_quest(db, quest_id, MULTI_STEP)
            completion = complete_step(db, player, quest, step_id)
        case RsvpAction(attending=attending):
            quest = get_playable_quest(db, quest_id, MEETUP)
            set_rsvp(db, player, quest, attending)
        case ReportAction(reason=reason):
            quest = get_playable_quest(db, quest_id)
            report_quest(db, player, quest, reason)
        case PairStartAction(invite_username=invite_username):
            quest = get_playable_quest(db, quest_id, PAIR)
            start_pair(db, player, quest, invite_username)
        case PairCancelAction():
            quest = get_viewable_quest(db, player, quest_id)
            cancel_pair(db, player, quest)
    return QuestActionResult(
        quest=quest_views(db, player, [quest])[0], completion=completion, quiz=quiz)
