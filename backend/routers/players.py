from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_player, is_maintainer
from badges import player_badges
from database import get_db
from game import bad_request, error_responses, total_points
from hobbies import HOBBIES, parse_hobbies, serialize_hobbies
from models import User
from schemas import Badge, HobbyOption, Player, ProfileUpdate

router = APIRouter(tags=["players"], responses=error_responses(401))


def player_out(db: Session, player: User) -> Player:
    return Player(
        id=player.id,
        display_name=player.name,
        total_points=total_points(db, player.id),
        is_maintainer=is_maintainer(player),
        hobbies=parse_hobbies(player.hobbies),
        discoverable=player.discoverable,
    )


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
