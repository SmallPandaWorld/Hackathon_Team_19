"""Friendships: requests, acceptance, removal and the friends list.

Consent rules match profiles: a request can only be sent to a player who
opted in to suggestions (`discoverable`), since that is the only way to find
them. Once a request or friendship exists, both players can always act on
it, and only on their own: every lookup is keyed on the current player.
"""

from typing import Dict, List, Optional

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from game import as_utc, bad_request, conflict, not_found, total_points, utcnow
from models import FRIEND_ACCEPTED, FRIEND_PENDING, Friendship, User
from schemas import FriendOut, FriendRequestOut, Friends, FriendStatus


def friendship_between(db: Session, a: str, b: str) -> Optional[Friendship]:
    """The single row linking two players, whichever of them sent it."""
    return db.scalars(
        select(Friendship).where(or_(
            (Friendship.requester_id == a) & (Friendship.addressee_id == b),
            (Friendship.requester_id == b) & (Friendship.addressee_id == a),
        ))
    ).first()


def friend_status(db: Session, me: str, other: str) -> FriendStatus:
    row = friendship_between(db, me, other)
    if row is None:
        return "none"
    if row.status == FRIEND_ACCEPTED:
        return "friends"
    return "outgoing" if row.requester_id == me else "incoming"


def send_request(db: Session, player: User, username: str) -> None:
    if username == player.username:
        raise bad_request("You can't add yourself as a friend.")
    other = db.get(User, username)
    if other is None or not other.discoverable:
        raise not_found("Player")
    existing = friendship_between(db, player.username, username)
    if existing is not None:
        if existing.status == FRIEND_ACCEPTED:
            raise conflict(f"You and {other.name} are already friends.")
        if existing.requester_id == player.username:
            raise conflict("You already sent this player a request.")
        raise conflict(f"{other.name} already sent you a request. Accept it instead.")
    db.add(Friendship(
        requester_id=player.username, addressee_id=username, created_at=utcnow()))
    try:
        db.commit()
    except IntegrityError:
        # The same request was sent twice at once.
        db.rollback()
        raise conflict("You already sent this player a request.")


def accept_request(db: Session, player: User, username: str) -> None:
    """Only the addressee of an open request can accept it."""
    row = friendship_between(db, player.username, username)
    if (row is None or row.status != FRIEND_PENDING
            or row.addressee_id != player.username):
        raise not_found("Friend request")
    row.status = FRIEND_ACCEPTED
    row.accepted_at = utcnow()
    db.commit()


def remove(db: Session, player: User, username: str) -> None:
    """Decline or cancel an open request, or end a friendship. Removing the
    row updates both players' lists at once."""
    row = friendship_between(db, player.username, username)
    if row is None:
        raise not_found("Friend request or friendship")
    db.delete(row)
    db.commit()


def friends_out(db: Session, player: User) -> Friends:
    me = player.username
    rows = db.scalars(
        select(Friendship).where(or_(
            Friendship.requester_id == me, Friendship.addressee_id == me))
    ).all()
    other_ids = [r.requester_id if r.addressee_id == me else r.addressee_id for r in rows]
    users: Dict[str, User] = {}
    if other_ids:
        users = {u.username: u for u in db.scalars(
            select(User).where(User.username.in_(other_ids)))}

    friends: List[FriendOut] = []
    incoming: List[FriendRequestOut] = []
    outgoing: List[FriendRequestOut] = []
    for row, other_id in zip(rows, other_ids):
        other = users[other_id]
        if row.status == FRIEND_ACCEPTED:
            friends.append(FriendOut(
                username=other.username,
                display_name=other.name,
                total_points=total_points(db, other.username),
                since=as_utc(row.accepted_at or row.created_at),
            ))
            continue
        request = FriendRequestOut(
            username=other.username,
            display_name=other.name,
            created_at=as_utc(row.created_at),
        )
        (incoming if row.addressee_id == me else outgoing).append(request)

    friends.sort(key=lambda f: (-f.total_points, f.display_name.lower(), f.username))
    incoming.sort(key=lambda r: r.created_at, reverse=True)
    outgoing.sort(key=lambda r: r.created_at, reverse=True)
    return Friends(friends=friends, incoming=incoming, outgoing=outgoing)
