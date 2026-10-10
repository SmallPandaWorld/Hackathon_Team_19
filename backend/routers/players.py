from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth import get_current_player, is_maintainer
from badges import player_badges
from database import get_db
from game import bad_request, error_responses, not_found, total_points
from hobbies import HOBBIES, parse_hobbies, serialize_hobbies
from models import User
from schemas import Badge, HobbyOption, Player, PlayerSearchResult, ProfileUpdate

router = APIRouter(tags=["players"], responses=error_responses(401))

MAX_SEARCH_RESULTS = 20


def player_out(db: Session, player: User) -> Player:
    return Player(
        id=player.id,
        display_name=player.name,
        total_points=total_points(db, player.id),
        is_maintainer=is_maintainer(player),
        hobbies=parse_hobbies(player.hobbies),
        discoverable=player.discoverable,
    )


@router.get("/players/search", response_model=List[PlayerSearchResult])
def search_players(
    q: str = Query(min_length=2, max_length=100, description="Part of a display name"),
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Discoverable players whose name contains the query, A to Z.

    Same consent rule as profile pages: players who did not opt in to
    suggestions cannot be found.
    """
    term = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    if len(term) < 2:
        return []
    matches = db.scalars(
        select(User)
        .where(
            User.discoverable.is_(True),
            User.viscon_user_id.is_not(None),
            User.id != player.id,
            User.name.ilike(f"%{term}%", escape="\\"),
        )
        .order_by(User.name, User.id)
        .limit(MAX_SEARCH_RESULTS)
    )
    return [PlayerSearchResult(player_id=m.id, display_name=m.name) for m in matches]


@router.get("/players/{player_id}", response_model=Player, responses=error_responses(404))
def get_player(
    player_id: int,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """A player's public profile.

    Only players who opted in to suggestions are visible to others; a player
    can always view themselves.
    """
    other = db.get(User, player_id)
    if other is None or not (other.discoverable or other.id == player.id):
        raise not_found("Player")
    out = player_out(db, other)
    if other.id != player.id:
        out.is_maintainer = False
    return out


@router.get("/me", response_model=Player)
def get_me(player: User = Depends(get_current_player), db: Session = Depends(get_db)):
    """The current player with their total points."""
    return player_out(db, player)


@router.put("/me/profile", response_model=Player, responses=error_responses(400))
def update_profile(
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
    return player_out(db, player)


@router.get("/me/badges", response_model=List[Badge])
def list_badges(player: User = Depends(get_current_player), db: Session = Depends(get_db)):
    """All badges, with whether and when the current player earned them."""
    return player_badges(db, player.id)


@router.get("/hobbies", response_model=List[HobbyOption])
def list_hobbies():
    """The hobbies a player can choose from."""
    return [HobbyOption(key=key, label=label) for key, label in HOBBIES.items()]
