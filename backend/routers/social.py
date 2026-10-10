"""Connection suggestions from shared hobbies.

Consent rules: only players who opted in (`discoverable`) appear in
suggestions, and only they receive suggestions. A suggestion shows the
display name and shared hobbies, nothing else. Dismissed players are
never suggested again.
"""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import get_current_player
from database import get_db
from game import bad_request, error_responses, not_found
from hobbies import HOBBIES, parse_hobbies
from models import DismissedSuggestion, User
from schemas import Suggestion, Suggestions

router = APIRouter(tags=["connections"], responses=error_responses(401))

MAX_SUGGESTIONS = 20


@router.get("/suggestions", response_model=Suggestions)
def list_suggestions(player: User = Depends(get_current_player), db: Session = Depends(get_db)):
    """Discoverable players sharing at least one hobby, most shared first."""
    if not player.discoverable:
        return Suggestions(enabled=False, suggestions=[])
    mine = set(parse_hobbies(player.hobbies))
    dismissed = set(db.scalars(select(DismissedSuggestion.dismissed_player_id).where(
        DismissedSuggestion.player_id == player.id)))
    candidates = db.scalars(select(User).where(
        User.discoverable.is_(True),
        User.viscon_user_id.is_not(None),
        User.id != player.id,
    ))

    suggestions = []
    for other in candidates:
        if other.id in dismissed:
            continue
        shared = [key for key in parse_hobbies(other.hobbies) if key in mine]
        if shared:
            suggestions.append(Suggestion(
                player_id=other.id,
                display_name=other.name,
                shared_hobbies=[HOBBIES[key] for key in shared],
            ))
    suggestions.sort(key=lambda s: (-len(s.shared_hobbies), s.display_name.lower()))
    return Suggestions(enabled=True, suggestions=suggestions[:MAX_SUGGESTIONS])


@router.post(
    "/suggestions/{player_id}/dismiss",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=error_responses(400, 404),
)
def dismiss_suggestion(
    player_id: int,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Stop suggesting this player."""
    if player_id == player.id:
        raise bad_request("You can't dismiss yourself.")
    if db.get(User, player_id) is None:
        raise not_found("Player")
    db.add(DismissedSuggestion(player_id=player.id, dismissed_player_id=player_id))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # already dismissed
