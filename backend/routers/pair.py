"""Joining a partner's pair quest by code. Starting and cancelling a code
are quest actions (`pair_start` / `pair_cancel`)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_player
from database import get_db
from game import error_responses, find_by_code, join_pair, session_out
from models import User
from schemas import PairJoinResult, PairSessionOut

router = APIRouter(prefix="/pair", tags=["pair"], responses=error_responses(401))


@router.get("/{code}", response_model=PairSessionOut, responses=error_responses(404))
def get_pair_code(
    code: str,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Look up a code before joining (shows quest and host)."""
    return session_out(db, find_by_code(db, code), player)


@router.post(
    "/{code}",
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
    session, completion = join_pair(db, player, code)
    return PairJoinResult(session=session_out(db, session, player), completion=completion)
