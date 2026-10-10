"""Friends: send, accept, decline or cancel requests, remove friends, and
list them. Every endpoint returns the caller's updated friends view."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from auth import get_current_player
from database import get_db
from friendships import accept_request, friends_out, remove, send_request
from game import error_responses
from models import User
from schemas import Friends

router = APIRouter(prefix="/friends", tags=["friends"], responses=error_responses(401))


@router.get("", response_model=Friends)
def list_friends(player: User = Depends(get_current_player), db: Session = Depends(get_db)):
    """My friends plus open incoming and outgoing requests."""
    return friends_out(db, player)


@router.post(
    "/{username}",
    response_model=Friends,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400, 404, 409),
)
def send_friend_request(
    username: str,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Ask a discoverable player to be friends. They see it under incoming
    requests and can accept or decline."""
    send_request(db, player, username)
    return friends_out(db, player)


@router.post(
    "/{username}/accept",
    response_model=Friends,
    responses=error_responses(404),
)
def accept_friend_request(
    username: str,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Accept a request this player sent me; we become friends."""
    accept_request(db, player, username)
    return friends_out(db, player)


@router.delete(
    "/{username}",
    response_model=Friends,
    responses=error_responses(404),
)
def remove_friend(
    username: str,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Decline their request, cancel mine, or remove a friend: whichever
    relation exists with this player is removed for both of us."""
    remove(db, player, username)
    return friends_out(db, player)
