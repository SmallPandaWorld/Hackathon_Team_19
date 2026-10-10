from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models import User
from schemas.user import UserRead


router = APIRouter(tags=["users"])
CurrentUser = Annotated[User, Depends(get_current_user)]
Database = Annotated[Session, Depends(get_db)]


@router.get("/me", response_model=UserRead)
def get_me(user: CurrentUser) -> User:
    """Return the logged-in user's profile and score."""
    return user


@router.get("/leaderboard", response_model=list[UserRead])
def get_leaderboard(db: Database) -> list[User]:
    """List all users ordered by score, with username as a stable tiebreaker."""
    return list(
        db.scalars(select(User).order_by(User.score.desc(), User.username.asc())).all()
    )
