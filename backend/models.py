import uuid
from datetime import datetime
import secrets
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from database import Base

# All datetimes are stored as naive UTC (SQLite has no time zones).

# Quest kinds
SOLO = "solo"
PAIR = "pair"
QUIZ = "quiz"
MULTI_STEP = "multi_step"
MEETUP = "meetup"
QUEST_KINDS = (SOLO, PAIR, QUIZ, MULTI_STEP, MEETUP)

# Quest statuses. Only published quests are playable.
DRAFT = "draft"
PENDING_REVIEW = "pending_review"
PUBLISHED = "published"
REJECTED = "rejected"
RETIRED = "retired"
QUEST_STATUSES = (DRAFT, PENDING_REVIEW, PUBLISHED, REJECTED, RETIRED)

VERIFICATION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_verification_code() -> str:
    """A printable, hard-to-guess code; never derived from quest data."""
    return "".join(secrets.choice(VERIFICATION_ALPHABET) for _ in range(12))

# Completion statuses. Only approved completions count for points.
APPROVED = "approved"
PENDING = "pending"
COMPLETION_REJECTED = "rejected"


def uuid_pk():
    return mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)


class User(Base):
    """A player keyed by the unique, stable username supplied by VISCON."""

    __tablename__ = "users"

    # X-User-Id is the stable unique account name. Display names can change.
    username: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    hobbies: Mapped[str] = mapped_column(
        String(1000), nullable=False, default="", server_default="")
    discoverable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0"))


class Quest(Base):
    __tablename__ = "quests"

    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SOLO, server_default=SOLO)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=PUBLISHED, server_default=PUBLISHED)
    requires_approval: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0"))
    # Generated once per quest; only code-verified solo quests use it.
    requires_code: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0"))
    verification_code: Mapped[Optional[str]] = mapped_column(
        String(12), nullable=True, unique=True, index=True,
        default=new_verification_code)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    starts_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancelled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0"))
    author_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.username"), nullable=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class QuestStep(Base):
    __tablename__ = "quest_steps"
    __table_args__ = (UniqueConstraint("quest_id", "position"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    quest_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("quests.id"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")


class StepProgress(Base):
    __tablename__ = "step_progress"
    __table_args__ = (UniqueConstraint("player_id", "step_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    player_id: Mapped[str] = mapped_column(ForeignKey("users.username"), nullable=False)
    step_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("quest_steps.id"), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"
    __table_args__ = (UniqueConstraint("quest_id", "position"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    quest_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("quests.id"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    choices: Mapped[str] = mapped_column(Text, nullable=False)
    correct_index: Mapped[int] = mapped_column(Integer, nullable=False)


class Completion(Base):
    __tablename__ = "completions"
    __table_args__ = (UniqueConstraint("player_id", "quest_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    player_id: Mapped[str] = mapped_column(
        ForeignKey("users.username"), nullable=False, index=True)
    quest_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("quests.id"), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    points_awarded: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=APPROVED, server_default=APPROVED)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewer_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.username"), nullable=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class PairSession(Base):
    """A two-player quest attempt: the host shares `code`, a partner joins."""

    __tablename__ = "pair_sessions"

    id: Mapped[uuid.UUID] = uuid_pk()
    quest_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("quests.id"), nullable=False)
    host_id: Mapped[str] = mapped_column(
        ForeignKey("users.username"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    partner_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.username"), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancelled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    invited_player_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.username"), nullable=True, index=True)


class MeetupRsvp(Base):
    __tablename__ = "meetup_rsvps"
    __table_args__ = (UniqueConstraint("player_id", "quest_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    player_id: Mapped[str] = mapped_column(ForeignKey("users.username"), nullable=False)
    quest_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("quests.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class QuestReport(Base):
    __tablename__ = "quest_reports"
    __table_args__ = (UniqueConstraint("player_id", "quest_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    player_id: Mapped[str] = mapped_column(ForeignKey("users.username"), nullable=False)
    quest_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("quests.id"), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


# Friendship statuses. A row is a request until the addressee accepts it.
FRIEND_PENDING = "pending"
FRIEND_ACCEPTED = "accepted"


class Friendship(Base):
    """A friend request (`pending`) or an accepted friendship.

    One row per pair of players; the reverse direction is checked in code
    (see friendships.py), so two players never hold two rows.
    """

    __tablename__ = "friendships"
    __table_args__ = (UniqueConstraint("requester_id", "addressee_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    requester_id: Mapped[str] = mapped_column(
        ForeignKey("users.username"), nullable=False, index=True)
    addressee_id: Mapped[str] = mapped_column(
        ForeignKey("users.username"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=FRIEND_PENDING, server_default=FRIEND_PENDING)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class EarnedBadge(Base):
    """A badge that must outlive what unlocked it (e.g. a removed friend).

    Most badges are computed from completions (see badges.py); only these are
    stored. One row per player and badge, so it can never be issued twice.
    """

    __tablename__ = "earned_badges"
    __table_args__ = (UniqueConstraint("player_id", "badge_key"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    player_id: Mapped[str] = mapped_column(
        ForeignKey("users.username"), nullable=False, index=True)
    badge_key: Mapped[str] = mapped_column(String(50), nullable=False)
    earned_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class DismissedSuggestion(Base):
    __tablename__ = "dismissed_suggestions"
    __table_args__ = (UniqueConstraint("player_id", "dismissed_player_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    player_id: Mapped[str] = mapped_column(ForeignKey("users.username"), nullable=False)
    dismissed_player_id: Mapped[str] = mapped_column(
        ForeignKey("users.username"), nullable=False)
