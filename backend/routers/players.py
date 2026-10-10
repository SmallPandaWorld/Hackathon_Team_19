"""The current player (profile, badges, suggestions, invites, submissions)
and the leaderboard."""

import hashlib
import os
from pathlib import Path
from typing import List
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import get_current_player, is_maintainer
from badges import player_badges
from database import get_db
from friendships import accepted_friend_ids, friend_status, friendship_between
from game import (
    QUEST_CREATION_ORDER,
    bad_request,
    error_responses,
    not_found,
    open_invitations,
    submission_out,
    suggestions_for,
    total_points,
)
from hobbies import HOBBIES, parse_hobbies, serialize_hobbies
from models import APPROVED, Completion, DismissedSuggestion, Friendship, Quest, User
from schemas import (
    HobbyOption,
    Leaderboard,
    LeaderboardEntry,
    LeaderboardScope,
    Me,
    PlayerSearchResult,
    ProfileUpdate,
    PublicPlayer,
)

router = APIRouter(tags=["players"], responses=error_responses(401))

LEADERBOARD_SIZE = 50
MAX_SEARCH_RESULTS = 20
MAX_AVATAR_BYTES = 2 * 1024 * 1024
AVATAR_STORAGE_DIR = Path(os.getenv(
    "AVATAR_STORAGE_DIR", Path(__file__).resolve().parents[1] / "avatars"))


def _avatar_path(username: str) -> Path:
    # Never use an externally supplied username as a path component.
    filename = hashlib.sha256(username.encode("utf-8")).hexdigest()
    return AVATAR_STORAGE_DIR / f"{filename}.image"


def _avatar_media_type(content: bytes | bytearray) -> str | None:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


def _can_view_profile(db: Session, viewer: User, profile: User) -> bool:
    return (
        profile.discoverable
        or profile.username == viewer.username
        or friendship_between(db, viewer.username, profile.username) is not None
    )


def _avatar_not_found(what: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"{what} not found.",
        headers={"Cache-Control": "private, no-store"},
    )


def me_out(db: Session, player: User) -> Me:
    submissions = db.scalars(
        select(Quest).where(Quest.author_id == player.username)
        .order_by(QUEST_CREATION_ORDER.desc())).all()
    return Me(
        username=player.username,
        display_name=player.name,
        total_points=total_points(db, player.username),
        is_maintainer=is_maintainer(player),
        hobbies=parse_hobbies(player.hobbies),
        discoverable=player.discoverable,
        badges=player_badges(db, player.username),
        hobby_options=[HobbyOption(key=key, label=label) for key, label in HOBBIES.items()],
        suggestions=suggestions_for(db, player),
        invitations=open_invitations(db, player),
        submissions=[submission_out(quest) for quest in submissions],
    )


@router.get("/me", response_model=Me)
def get_me(player: User = Depends(get_current_player), db: Session = Depends(get_db)):
    """Everything about the current player: points, badges, hobbies,
    connection suggestions, open pair invitations and submitted quests."""
    return me_out(db, player)


@router.put("/me", response_model=Me, responses=error_responses(400))
def update_me(
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
    return me_out(db, player)


@router.put(
    "/me/avatar",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=error_responses(400, 413, 415),
)
async def upload_avatar(
    request: Request,
    player: User = Depends(get_current_player),
):
    """Set the current player's profile picture (PNG, JPEG, or WebP; 2 MiB max)."""
    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if media_type == "image/jpg":
        media_type = "image/jpeg"
    if media_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Use a PNG, JPEG, or WebP image.",
        )

    image = bytearray()
    async for chunk in request.stream():
        if len(image) + len(chunk) > MAX_AVATAR_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Profile pictures must be 2 MiB or smaller.",
            )
        image.extend(chunk)
    if not image:
        raise bad_request("Choose an image to upload.")

    actual_type = _avatar_media_type(image)
    if actual_type != media_type:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="The uploaded file must be a PNG, JPEG, or WebP image.",
        )

    AVATAR_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    destination = _avatar_path(player.username)
    temporary = destination.with_name(f".{uuid4().hex}.tmp")
    try:
        temporary.write_bytes(image)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/me/avatar",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_avatar(player: User = Depends(get_current_player)):
    """Remove the current player's profile picture."""
    _avatar_path(player.username).unlink(missing_ok=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/me/suggestions/{username}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=error_responses(400, 404),
)
def dismiss_suggestion(
    username: str,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Stop suggesting this player (idempotent)."""
    if username == player.username:
        raise bad_request("You can't dismiss yourself.")
    if db.get(User, username) is None:
        raise not_found("Player")
    db.add(DismissedSuggestion(player_id=player.username, dismissed_player_id=username))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # already dismissed


@router.get("/players", response_model=List[PlayerSearchResult])
def search_players(
    q: str = Query(min_length=2, max_length=100, description="Part of a display name"),
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Discoverable players whose name contains the query, A to Z.

    Same consent rule as profile pages: players who did not opt in to
    suggestions cannot be found. Never returns the searcher.
    """
    term = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    if len(term) < 2:
        return []
    matches = db.scalars(
        select(User)
        .where(
            User.discoverable.is_(True),
            User.username != player.username,
            User.name.ilike(f"%{term}%", escape="\\"),
        )
        .order_by(User.name, User.username)
        .limit(MAX_SEARCH_RESULTS)
    )
    return [PlayerSearchResult(username=m.username, display_name=m.name) for m in matches]


@router.get("/players/{username}", response_model=PublicPlayer, responses=error_responses(404))
def get_player(
    username: str,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """A player's public profile.

    Only players who opted in to suggestions are visible to others, except
    that friends and players with an open request between them can always
    see each other; a player can always view themselves.
    """
    other = db.get(User, username)
    if other is None:
        raise not_found("Player")
    if not _can_view_profile(db, player, other):
        raise not_found("Player")
    return PublicPlayer(
        username=other.username,
        display_name=other.name,
        total_points=total_points(db, other.username),
        hobbies=parse_hobbies(other.hobbies),
        badges=player_badges(db, other.username),
        friend_status=friend_status(db, player.username, other.username),
    )


@router.get(
    "/players/{username}/avatar",
    response_class=Response,
    responses=error_responses(404),
)
def get_player_avatar(
    username: str,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Return a picture only for discoverable players or the current player."""
    profile = db.get(User, username)
    if profile is None or (
        profile.username != player.username and not profile.discoverable
    ):
        raise _avatar_not_found("Player")

    path = _avatar_path(profile.username)
    if not path.is_file():
        raise _avatar_not_found("Profile picture")
    content = path.read_bytes()
    media_type = _avatar_media_type(content)
    if media_type is None:
        raise _avatar_not_found("Profile picture")
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/leaderboard", response_model=Leaderboard)
def get_leaderboard(
    scope: LeaderboardScope = Query(
        "global", description="`global`: all players; `friends`: you and your accepted friends"),
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Players ranked by approved points. Equal points share a rank (1, 1, 3, ...).

    The same scoring applies to both scopes. The global view lists players
    with at least one point; the friends view lists you and every accepted
    friend, points or not, so the group is always complete.
    """
    points = func.coalesce(func.sum(Completion.points_awarded), 0)
    friend_ids = accepted_friend_ids(db, player.username)
    # Profiles are linkable for discoverable players and anyone connected to
    # the viewer (friends and open requests), matching GET /players/{username}.
    visible_usernames = {player.username}
    relationships = db.execute(
        select(Friendship.requester_id, Friendship.addressee_id).where(
            or_(
                Friendship.requester_id == player.username,
                Friendship.addressee_id == player.username,
            )
        )
    ).all()
    for requester_id, addressee_id in relationships:
        visible_usernames.add(
            addressee_id if requester_id == player.username else requester_id
        )

    query = (
        select(User.username, User.name, User.discoverable, points)
        .outerjoin(Completion, and_(
            Completion.player_id == User.username, Completion.status == APPROVED))
        .group_by(User.username)
        .order_by(points.desc(), User.name, User.username)
    )
    if scope == "friends":
        query = query.where(User.username.in_(friend_ids | {player.username}))
    rows = db.execute(query).all()

    entries = []
    for index, (username, name, discoverable, player_points) in enumerate(rows):
        # Rows are sorted, so a new rank starts wherever the points drop.
        if index == 0 or player_points != rows[index - 1][3]:
            rank = index + 1
        entries.append(LeaderboardEntry(
            rank=rank,
            username=username if discoverable or username in visible_usernames else None,
            display_name=name,
            points=player_points,
            is_current_player=username == player.username,
        ))

    current = next(entry for entry in entries if entry.is_current_player)
    if scope == "friends":
        listed = entries
    else:
        listed = [entry for entry in entries if entry.points > 0][:LEADERBOARD_SIZE]
    return Leaderboard(
        scope=scope, entries=listed, current_player=current, friend_count=len(friend_ids))
