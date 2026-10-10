from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from auth import get_current_player
from database import get_db
from game import error_responses
from models import APPROVED, Completion, User
from schemas import Leaderboard, LeaderboardEntry

router = APIRouter(tags=["leaderboard"], responses=error_responses(401))

LEADERBOARD_SIZE = 50


@router.get("/leaderboard", response_model=Leaderboard)
def get_leaderboard(player: User = Depends(get_current_player), db: Session = Depends(get_db)):
    """Players ranked by approved points. Equal points share a rank (1, 1, 3, ...)."""
    points = func.coalesce(func.sum(Completion.points_awarded), 0)
    rows = db.execute(
        select(User.id, User.name, points)
        .outerjoin(Completion, and_(
            Completion.player_id == User.id, Completion.status == APPROVED))
        .where(User.viscon_user_id.is_not(None))
        .group_by(User.id)
        .order_by(points.desc(), User.name, User.id)
    ).all()

    entries = []
    for index, (player_id, name, player_points) in enumerate(rows):
        # Rows are sorted, so a new rank starts wherever the points drop.
        if index == 0 or player_points != rows[index - 1][2]:
            rank = index + 1
        entries.append(LeaderboardEntry(
            rank=rank,
            player_id=player_id,
            display_name=name,
            points=player_points,
            is_current_player=player_id == player.id,
        ))

    current = next(entry for entry in entries if entry.is_current_player)
    top = [entry for entry in entries if entry.points > 0][:LEADERBOARD_SIZE]
    return Leaderboard(entries=top, current_player=current)
