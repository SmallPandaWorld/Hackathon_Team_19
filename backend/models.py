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
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from database import Base

# All datetimes are stored as naive UTC (SQLite has no time zones).

# Quest kinds
SOLO = "solo"              # self-reported (optionally maintainer-approved)
PAIR = "pair"              # needs a second player who enters a join code
QUIZ = "quiz"              # multiple-choice questions checked by the backend
MULTI_STEP = "multi_step"  # ordered steps, reward when the last one is done
MEETUP = "meetup"          # scheduled time window, check in while it is live
QUEST_KINDS = (SOLO, PAIR, QUIZ, MULTI_STEP, MEETUP)

# Quest statuses. Only published quests are playable.
DRAFT = "draft"
PENDING_REVIEW = "pending_review"  # player-submitted, waiting for a maintainer
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


class User(Base):
    """A player. `name` is the display name shown in the app."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Value of the VISCON `X-User-Id` header. Nullable only for rows left
    # over from the username prototype.
    viscon_user_id: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, index=True, nullable=True)
    # Comma-separated hobby keys from hobbies.py.
    hobbies: Mapped[str] = mapped_column(
        String(1000), nullable=False, default="", server_default="")
    # Opt-in: only discoverable players appear in (and receive) suggestions.
    discoverable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0"))


class Quest(Base):
    __tablename__ = "quests"

    # Built-in quests use stable IDs below 1000 (see quests.py); quests
    # created in the app get IDs from 1000 upwards.
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SOLO, server_default=SOLO)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=PUBLISHED, server_default=PUBLISHED)
    # Solo quests only: completions wait for a maintainer.
    requires_approval: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0"))
    # The code exists for every quest, but only code-verified solo quests use it.
    # Editing a quest never changes its printed code.
    requires_code: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0"))
    verification_code: Mapped[Optional[str]] = mapped_column(
        String(12), nullable=True, unique=True, index=True,
        default=new_verification_code)
    # Pin on the campus map (WGS84, as on OpenStreetMap).
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Meetups only.
    starts_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancelled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0"))
    # Player who submitted the quest (None for team-made quests).
    author_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True)
    # Maintainer's explanation when rejecting a submission.
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class QuestStep(Base):
    __tablename__ = "quest_steps"
    __table_args__ = (UniqueConstraint("quest_id", "position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    quest_id: Mapped[int] = mapped_column(
        ForeignKey("quests.id"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")


class StepProgress(Base):
    __tablename__ = "step_progress"
    __table_args__ = (UniqueConstraint("player_id", "step_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    step_id: Mapped[int] = mapped_column(ForeignKey("quest_steps.id"), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"
    __table_args__ = (UniqueConstraint("quest_id", "position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    quest_id: Mapped[int] = mapped_column(
        ForeignKey("quests.id"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    # JSON list of answer strings.
    choices: Mapped[str] = mapped_column(Text, nullable=False)
    correct_index: Mapped[int] = mapped_column(Integer, nullable=False)


class Completion(Base):
    __tablename__ = "completions"
    # One completion (and one reward) per player per quest.
    __table_args__ = (UniqueConstraint("player_id", "quest_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True)
    quest_id: Mapped[int] = mapped_column(ForeignKey("quests.id"), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    # Snapshot of the reward, so later point changes don't rewrite history.
    # Stays 0 until the completion is approved.
    points_awarded: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=APPROVED, server_default=APPROVED)
    # Player's description of what they did (approval quests).
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewer_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class PairSession(Base):
    """A two-player quest attempt: the host shares `code`, a partner joins."""

    __tablename__ = "pair_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    quest_id: Mapped[int] = mapped_column(ForeignKey("quests.id"), nullable=False)
    host_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    partner_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancelled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Set when the host invited a suggested player; the code then shows up
    # on that player's home screen (anyone with the code can still join).
    invited_player_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True)


class MeetupRsvp(Base):
    __tablename__ = "meetup_rsvps"
    __table_args__ = (UniqueConstraint("player_id", "quest_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    quest_id: Mapped[int] = mapped_column(
        ForeignKey("quests.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class QuestReport(Base):
    __tablename__ = "quest_reports"
    __table_args__ = (UniqueConstraint("player_id", "quest_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    quest_id: Mapped[int] = mapped_column(
        ForeignKey("quests.id"), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class DismissedSuggestion(Base):
    __tablename__ = "dismissed_suggestions"
    __table_args__ = (UniqueConstraint("player_id", "dismissed_player_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    dismissed_player_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False)
