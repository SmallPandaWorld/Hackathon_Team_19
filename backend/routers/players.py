"""The current player (profile, badges, suggestions, invites, submissions)
and the leaderboard."""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import and_, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import get_current_player, is_maintainer
from badges import player_badges
from database import get_db
from game import (
    QUEST_CREATION_ORDER,
    bad_request,
    error_responses,
    not_found,
    open_invitations,
    submission_out,
    suggestions_for,
    total_points,
)
from hobbies import HOBBIES, parse_hobbies, serialize_hobbies
from models import APPROVED, Completion, DismissedSuggestion, Quest, User
from schemas import (
    HobbyOption,
    Leaderboard,
    LeaderboardEntry,
    Me,
    ProfileUpdate,
)

router = APIRouter(tags=["players"], responses=error_responses(401))

LEADERBOARD_SIZE = 50


def me_out(db: Session, player: User) -> Me:
    submissions = db.scalars(
        select(Quest).where(Quest.author_id == player.username)
        .order_by(QUEST_CREATION_ORDER.desc())).all()
    return Me(
        username=player.username,
        display_name=player.name,
        total_points=total_points(db, player.username),
        is_maintainer=is_maintainer(player),
        hobbies=parse_hobbies(player.hobbies),
        discoverable=player.discoverable,
        badges=player_badges(db, player.username),
        hobby_options=[HobbyOption(key=key, label=label) for key, label in HOBBIES.items()],
        suggestions=suggestions_for(db, player),
        invitations=open_invitations(db, player),
        submissions=[submission_out(quest) for quest in submissions],
    )


@router.get("/me", response_model=Me)
def get_me(player: User = Depends(get_current_player), db: Session = Depends(get_db)):
    """Everything about the current player: points, badges, hobbies,
    connection suggestions, open pair invitations and submitted quests."""
    return me_out(db, player)


@router.put("/me", response_model=Me, responses=error_responses(400))
def update_me(
    profile: ProfileUpdate,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Set hobbies and whether the player appears in connection suggestions.

    Send an empty list to remove all hobbies.
    """
    unknown = [key for key in profile.hobbies if key not in HOBBIES]
    if unknown:
        raise bad_request(f"Unknown hobbies: {', '.join(unknown)}")
    player.hobbies = serialize_hobbies(profile.hobbies)
    player.discoverable = profile.discoverable
    db.commit()
    return me_out(db, player)


@router.delete(
    "/me/suggestions/{username}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=error_responses(400, 404),
)
def dismiss_suggestion(
    username: str,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Stop suggesting this player (idempotent)."""
    if username == player.username:
        raise bad_request("You can't dismiss yourself.")
    if db.get(User, username) is None:
        raise not_found("Player")
    db.add(DismissedSuggestion(player_id=player.username, dismissed_player_id=username))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # already dismissed


@router.get("/leaderboard", response_model=Leaderboard)
def get_leaderboard(player: User = Depends(get_current_player), db: Session = Depends(get_db)):
    """Players ranked by approved points. Equal points share a rank (1, 1, 3, ...)."""
    points = func.coalesce(func.sum(Completion.points_awarded), 0)
    rows = db.execute(
        select(User.username, User.name, points)
        .outerjoin(Completion, and_(
            Completion.player_id == User.username, Completion.status == APPROVED))
        .group_by(User.username)
        .order_by(points.desc(), User.name, User.username)
    ).all()

    entries = []
    for index, (username, name, player_points) in enumerate(rows):
        # Rows are sorted, so a new rank starts wherever the points drop.
        if index == 0 or player_points != rows[index - 1][2]:
            rank = index + 1
        entries.append(LeaderboardEntry(
            rank=rank,
            display_name=name,
            points=player_points,
            is_current_player=username == player.username,
        ))

    current = next(entry for entry in entries if entry.is_current_player)
    top = [entry for entry in entries if entry.points > 0][:LEADERBOARD_SIZE]
    return Leaderboard(entries=top, current_player=current)
