from typing import Annotated

from fastapi import APIRouter, Depends

from dependencies import get_current_user
from models import User
from schemas.user import UserRead


router = APIRouter(tags=["users"])
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("/me", response_model=UserRead)
def get_me(user: CurrentUser) -> User:
    """Return the logged-in user's profile and score."""
    return user
