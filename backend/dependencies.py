import os
from typing import Annotated
from urllib.parse import unquote

from fastapi import Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models import User


APP_ENV = os.getenv("APP_ENV", "production").strip().lower()


class UserHeaders(BaseModel):
    username: str
    name: str


def get_user_headers(request: Request) -> UserHeaders:
    """Read the logged-in user's identity from the existing proxy headers."""
    x_user_id = request.headers.get("x-user-id")
    x_user_name = request.headers.get("x-user-name")

    if x_user_id is None and x_user_name is None and APP_ENV in {"local", "development"}:
        return UserHeaders(username="local-user", name="Local Tester")

    if not x_user_id or not x_user_name:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Both X-User-Id and X-User-Name headers are required.",
        )

    username = unquote(x_user_id).strip()
    name = unquote(x_user_name).strip()
    if not username or not name:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Both X-User-Id and X-User-Name headers must be non-empty.",
        )

    return UserHeaders(username=username, name=name)


def get_current_user(
    user_headers: Annotated[UserHeaders, Depends(get_user_headers)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """Load or create the profile for the identity supplied by the website."""
    user = db.get(User, user_headers.username)
    if user is None:
        user = User(username=user_headers.username, name=user_headers.name, score=0)
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            # Another request may have created the same profile concurrently.
            db.rollback()
            user = db.get(User, user_headers.username)
            if user is None:
                raise

    if user.name != user_headers.name:
        user.name = user_headers.name
        db.commit()

    db.refresh(user)
    return user
