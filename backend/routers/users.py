from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from dependencies import UserHeaders, get_user_headers
from models import User
from schemas.user import UserRead


router = APIRouter(tags=["users"])
Database = Annotated[Session, Depends(get_db)]
LoggedInUser = Annotated[UserHeaders, Depends(get_user_headers)]


@router.get("/me", response_model=UserRead)
def get_me(user_headers: LoggedInUser, db: Database) -> User:
    """Return the logged-in user, creating their profile on first access."""
    user = db.get(User, user_headers.username)
    if user is None:
        user = User(
            username=user_headers.username,
            name=user_headers.name,
            score=0,
        )
        db.add(user)
    else:
        # The identity provider's name is authoritative; the score stays local.
        user.name = user_headers.name

    db.commit()
    db.refresh(user)
    return user
