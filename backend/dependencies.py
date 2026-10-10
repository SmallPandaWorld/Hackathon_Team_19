from urllib.parse import unquote

from fastapi import HTTPException, Request, status
from pydantic import BaseModel


class UserHeaders(BaseModel):
    username: str
    name: str


def get_user_headers(request: Request) -> UserHeaders:
    """Read the logged-in user's identity from the existing proxy headers."""
    x_user_id = request.headers.get("x-user-id")
    x_user_name = request.headers.get("x-user-name")
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
