from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Table,
    Uuid,
    Column,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


quest_solvers = Table(
    "quest_solvers",
    Base.metadata,
    Column(
        "quest_id",
        Uuid(as_uuid=True),
        ForeignKey("quests.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("username", ForeignKey("users.username", ondelete="CASCADE"), primary_key=True),
    Column("solved_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)


class User(Base):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    score: Mapped[int] = mapped_column(default=0, nullable=False)

    solved_quests: Mapped[list["Quest"]] = relationship(
        secondary=quest_solvers,
        back_populates="solvers",
    )
    quest_assignments: Mapped[list["QuestAssignment"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Quest(Base):
    __tablename__ = "quests"
    __table_args__ = (CheckConstraint("points > 0", name="ck_quests_points_positive"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    question: Mapped[str] = mapped_column(String(2000), nullable=False)
    answer: Mapped[str] = mapped_column(String(2000), nullable=False)
    points: Mapped[int] = mapped_column(nullable=False)

    solvers: Mapped[list[User]] = relationship(
        secondary=quest_solvers,
        back_populates="solved_quests",
    )
    assignments: Mapped[list["QuestAssignment"]] = relationship(
        back_populates="quest",
        cascade="all, delete-orphan",
    )


class QuestAssignment(Base):
    """Records that a user has seen a quest and their single answer attempt."""

    __tablename__ = "quest_assignments"

    username: Mapped[str] = mapped_column(
        ForeignKey("users.username", ondelete="CASCADE"), primary_key=True
    )
    quest_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("quests.id", ondelete="CASCADE"),
        primary_key=True,
    )
    seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    submitted_answer: Mapped[str | None] = mapped_column(String(2000))
    is_correct: Mapped[bool | None] = mapped_column(Boolean)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="quest_assignments")
    quest: Mapped[Quest] = relationship(back_populates="assignments")



