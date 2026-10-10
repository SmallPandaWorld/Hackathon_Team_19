"""Two-player quests: the host starts a session and shows a code (or the
/join/CODE link); a different player enters it. Both get the reward once."""

import secrets
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from auth import get_current_player
from database import get_db
from game import (
    as_utc,
    bad_request,
    completion_result,
    conflict,
    error_responses,
    find_completion,
    get_playable_quest,
    not_found,
    record_completion,
    utcnow,
)
from models import APPROVED, PAIR, PUBLISHED, PairSession, Quest, User
from schemas import PairJoinResult, PairSessionOut

router = APIRouter(tags=["pair"], responses=error_responses(401))

CODE_LENGTH = 6
# No 0/O, 1/I/L, so codes are easy to read aloud and type.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LIFETIME = timedelta(minutes=10)


def session_state(session: PairSession) -> str:
    if session.completed_at is not None:
        return "completed"
    if session.cancelled:
        return "cancelled"
    if utcnow() > session.expires_at:
        return "expired"
    return "waiting"


def session_out(db: Session, session: PairSession, player: User) -> PairSessionOut:
    quest = db.get(Quest, session.quest_id)
    host = db.get(User, session.host_id)
    partner = db.get(User, session.partner_id) if session.partner_id else None
    return PairSessionOut(
        code=session.code,
        quest_id=quest.id,
        quest_title=quest.title,
        host_name=host.name,
        partner_name=partner.name if partner else None,
        is_host=session.host_id == player.id,
        state=session_state(session),
        expires_at=as_utc(session.expires_at),
    )


def new_code(db: Session) -> str:
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        in_use = db.scalars(select(PairSession.id).where(
            PairSession.code == code,
            PairSession.expires_at >= utcnow(),
        )).first()
        if in_use is None:
            return code


def find_by_code(db: Session, code: str) -> PairSession:
    session = db.scalars(
        select(PairSession)
        .where(PairSession.code == code.strip().upper())
        .order_by(PairSession.created_at.desc())
    ).first()
    if session is None:
        raise not_found("Code")
    return session


@router.post(
    "/quests/{quest_id}/pair",
    response_model=PairSessionOut,
    responses=error_responses(400, 404, 409),
)
def start_pair_session(
    quest_id: int,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Start a two-player quest and get a code for your partner.

    Replaces any code you started earlier for this quest. Codes expire
    after 10 minutes.
    """
    quest = get_playable_quest(db, quest_id, PAIR)
    completion = find_completion(db, player.id, quest.id)
    if completion is not None and completion.status == APPROVED:
        raise conflict("You already completed this quest.")
    db.execute(
        update(PairSession)
        .where(
            PairSession.quest_id == quest.id,
            PairSession.host_id == player.id,
            PairSession.completed_at.is_(None),
        )
        .values(cancelled=True))
    now = utcnow()
    session = PairSession(
        quest_id=quest.id,
        host_id=player.id,
        code=new_code(db),
        created_at=now,
        expires_at=now + CODE_LIFETIME,
    )
    db.add(session)
    db.commit()
    return session_out(db, session, player)


@router.get(
    "/quests/{quest_id}/pair",
    response_model=Optional[PairSessionOut],
    responses=error_responses(404),
)
def get_pair_session(
    quest_id: int,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Your latest session for this quest (as host or partner), or null.

    The host polls this to see when the partner has joined.
    """
    if db.get(Quest, quest_id) is None:
        raise not_found()
    session = db.scalars(
        select(PairSession)
        .where(
            PairSession.quest_id == quest_id,
            or_(PairSession.host_id == player.id, PairSession.partner_id == player.id),
        )
        .order_by(PairSession.created_at.desc())
    ).first()
    return session_out(db, session, player) if session else None


@router.delete(
    "/quests/{quest_id}/pair",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def cancel_pair_session(
    quest_id: int,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Cancel your open code for this quest."""
    db.execute(
        update(PairSession)
        .where(
            PairSession.quest_id == quest_id,
            PairSession.host_id == player.id,
            PairSession.completed_at.is_(None),
        )
        .values(cancelled=True))
    db.commit()


@router.get("/pair/{code}", response_model=PairSessionOut, responses=error_responses(404))
def get_pair_code(
    code: str,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Look up a code before joining (shows quest and host)."""
    return session_out(db, find_by_code(db, code), player)


@router.post(
    "/pair/{code}/join",
    response_model=PairJoinResult,
    responses=error_responses(400, 404, 409, 410),
)
def join_pair_session(
    code: str,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Join a partner's session with their code. Completes the quest for
    both players; each gets the reward once (none if already completed)."""
    session = find_by_code(db, code)
    if session.host_id == player.id:
        raise bad_request("You can't join your own code. Show it to another player.")

    if session.partner_id != player.id:  # not a retry of our own join
        state = session_state(session)
        if state == "cancelled":
            raise HTTPException(status.HTTP_410_GONE, detail="This code was cancelled.")
        if state == "expired":
            raise HTTPException(
                status.HTTP_410_GONE,
                detail="This code has expired. Ask your partner to start the quest again.")
        if state == "completed":
            raise conflict("This code was already used by another player.")
        quest = db.get(Quest, session.quest_id)
        if quest.status != PUBLISHED:
            raise conflict("This quest is no longer available.")

        # Claim the session atomically: only one partner can win.
        now = utcnow()
        claimed = db.execute(
            update(PairSession)
            .where(
                PairSession.id == session.id,
                PairSession.partner_id.is_(None),
                PairSession.cancelled.is_(False),
                PairSession.expires_at >= now,
            )
            .values(partner_id=player.id, completed_at=now)
        ).rowcount
        db.commit()
        db.refresh(session)
        if not claimed and session.partner_id != player.id:
            raise conflict("This code was already used by another player.")

    quest = db.get(Quest, session.quest_id)
    record_completion(db, session.host_id, quest, APPROVED)
    completion, created = record_completion(db, player.id, quest, APPROVED)
    return PairJoinResult(
        session=session_out(db, session, player),
        completion=completion_result(db, player.id, completion, created),
    )
