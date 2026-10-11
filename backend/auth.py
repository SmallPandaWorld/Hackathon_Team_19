"""Player identity from the VISCON managed proxy.

The proxy authenticates users (Switch edu-ID) and forwards:
  X-User-Id    unique, stable username (the `users` primary key)
  X-User-Name  percent-encoded display name

These headers are only trustworthy when every request comes through the
managed proxy, so the backend port must not be publicly reachable
(see docker-compose.yml).

Local development without the proxy: set DEV_MODE=true. When no X-User-Id
header is present, a cookie selects one of three fixed test players. The
default, Test Admin, can use the admin tools. Never enable this in deployment.

In production, maintainers (quest editor, reviews, reports) are the
usernames listed in MAINTAINER_IDS (comma separated).
"""

import os
from typing import Optional
from urllib.parse import unquote

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models import User


DEV_MODE = os.getenv("DEV_MODE", "").strip().lower() in ("true", "1", "yes")
DEV_USERS = {
    "test-admin": {"name": "Test Admin", "is_maintainer": True},
    "test-user-1": {"name": "Test User 1", "is_maintainer": False},
    "test-user-2": {"name": "Test User 2", "is_maintainer": False},
}


def _read_identity(request: Request) -> "tuple[Optional[str], str]":
    username = (request.headers.get("x-user-id") or "").strip()
    name = unquote(request.headers.get("x-user-name") or "").strip()
    if not username and DEV_MODE:
        dev_user = request.cookies.get("dev_user", "test-admin")
        if dev_user not in DEV_USERS:
            dev_user = "test-admin"
        return dev_user, DEV_USERS[dev_user]["name"]
    return (username or None), name


def get_current_player(request: Request, db: Session = Depends(get_db)) -> User:
    """Find or create the player for the authenticated identity."""
    username, name = _read_identity(request)
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Open the app through the VISCON login.",
        )
    name = name[:255]

    query = select(User).where(User.username == username)
    player = db.scalars(query).first()
    if player is None:
        db.add(User(username=username, name=name or "Player"))
        try:
            db.commit()
        except IntegrityError:
            # A parallel first request created the same player.
            db.rollback()
        player = db.scalars(query).one()
    elif name and player.name != name:
        player.name = name
        db.commit()
    return player


# Comma-separated VISCON user IDs (the X-User-Id value) of quest maintainers.
MAINTAINER_IDS = {
    value.strip()
    for value in os.getenv("MAINTAINER_IDS", "").split(",")
    if value.strip()
}


def is_maintainer(player: User) -> bool:
    return player.username in MAINTAINER_IDS or (
        DEV_MODE and DEV_USERS.get(player.username, {}).get("is_maintainer", False))


def require_maintainer(player: User = Depends(get_current_player)) -> User:
    if not is_maintainer(player):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only quest maintainers can do this.",
        )
    return player
