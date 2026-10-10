"""Player-facing quests: browse, create, and act on a quest."""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth import get_current_player
from database import get_db
from game import (
    QUEST_CREATION_ORDER,
    can_view,
    cancel_pair,
    complete_quest,
    redeem_quest_code,
    complete_step,
    error_responses,
    get_playable_quest,
    not_found,
    quest_views,
    report_quest,
    set_joined,
    set_rsvp,
    start_pair,
    submit_quiz,
)
from models import DRAFT, MEETUP, MULTI_STEP, PAIR, PUBLISHED, QUIZ, SOLO, Quest, User
from routers.admin import apply_quest_input, ensure_publishable
from schemas import (
    AdminQuestIn,
    CompleteAction,
    JoinAction,
    LeaveAction,
    RedeemAction,
    PairCancelAction,
    PairStartAction,
    QuestAction,
    QuestActionResult,
    QuestOut,
    PlayerQuestIn,
    QuizAction,
    ReportAction,
    RsvpAction,
    StepAction,
)

router = APIRouter(tags=["quests"], responses=error_responses(401))

# User-created quests have a fixed reward.
PLAYER_QUEST_POINTS = 10


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

    Also returns retired quests the player completed or created.
    """
    return quest_views(db, player, [get_viewable_quest(db, player, quest_id)])[0]


@router.post(
    "/quests",
    status_code=status.HTTP_201_CREATED,
    response_model=QuestOut,
    responses=error_responses(409),
)
def create_quest(
    data: PlayerQuestIn,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Publish a quest immediately. Players cannot create meetups; solo quests
    require a creator-set password. The reward is fixed at 10 points."""
    editor_data = AdminQuestIn(
        title=data.title,
        description=data.description,
        location=data.location,
        points=PLAYER_QUEST_POINTS,
        kind=data.kind,
        requires_password=data.kind == SOLO,
        password=data.password,
        latitude=data.latitude,
        longitude=data.longitude,
        steps=data.steps,
        questions=data.questions,
        status=PUBLISHED,
    )
    quest = Quest(title=data.title, description=data.description,
                  points=PLAYER_QUEST_POINTS, kind=data.kind,
                  status=DRAFT, author_id=player.username)
    db.add(quest)
    db.flush()
    apply_quest_input(db, quest, editor_data)
    quest.status = PUBLISHED
    ensure_publishable(db, quest)
    db.commit()
    return quest_views(db, player, [quest])[0]


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

    - `join`: start working on a quest. A first `complete`, `redeem`,
      `quiz`, `step` or `pair_start` needs it (meetups use `rsvp`).
    - `leave`: stop working on it; progress is kept (idempotent).
    - `complete`: complete a solo quest or check in at a live meetup
      (idempotent; approval quests create a pending completion).
    - `redeem`: complete a solo quest with its printed code or password,
      or check in at a live meetup by scanning its QR code.
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
        case JoinAction() | LeaveAction():
            quest = get_playable_quest(db, quest_id)
            set_joined(db, player, quest, isinstance(action, JoinAction))
        case CompleteAction(note=note):
            quest = get_playable_quest(db, quest_id)
            completion = complete_quest(db, player, quest, note)
        case RedeemAction(code=code):
            quest = get_playable_quest(db, quest_id)
            completion = redeem_quest_code(db, player, quest, code)
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
