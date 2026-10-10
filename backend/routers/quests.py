from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, case, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from database import get_db
from dependencies import get_current_user
from models import Quest, QuestAssignment, User
from schemas.quest import (
    QuestAnswerResult,
    QuestAnswerSubmit,
    QuestCreate,
    QuestInspection,
    QuestRead,
)


router = APIRouter(prefix="/quests", tags=["quests"])
Database = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.post("", response_model=QuestRead, status_code=status.HTTP_201_CREATED)
def create_quest(quest: QuestCreate, db: Database) -> Quest:
    """Add a quest to the database without requiring user authorization."""
    db_quest = Quest(**quest.model_dump())
    db.add(db_quest)
    db.commit()
    db.refresh(db_quest)
    return db_quest


@router.get("", response_model=list[QuestInspection])
def get_all_quests(db: Database) -> list[QuestInspection]:
    """List quests with every assigned participant and successful solver."""
    quests = db.scalars(
        select(Quest)
        .options(selectinload(Quest.assignments), selectinload(Quest.solvers))
        .order_by(Quest.id)
    ).all()
    return [
        QuestInspection(
            id=quest.id,
            question=quest.question,
            answer=quest.answer,
            points=quest.points,
            participants=[assignment.username for assignment in quest.assignments],
            solvers=[user.username for user in quest.solvers],
        )
        for quest in quests
    ]


@router.delete("/{quest_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quest(quest_id: UUID, db: Database) -> None:
    """Delete a quest and its participant and solver records."""
    quest = db.get(Quest, quest_id)
    if quest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quest not found.",
        )

    db.delete(quest)
    db.commit()


@router.get("/next", response_model=QuestRead)
def get_next_quest(db: Database, user: CurrentUser) -> Quest:
    """Return an unsolved quest, cycling missed quests after other quests."""
    while True:
        quest = db.scalar(
            select(Quest)
            .outerjoin(
                QuestAssignment,
                and_(
                    QuestAssignment.quest_id == Quest.id,
                    QuestAssignment.username == user.username,
                ),
            )
            .where(QuestAssignment.is_correct.is_not(True))
            .order_by(
                case((QuestAssignment.quest_id.is_(None), 0), else_=1),
                QuestAssignment.seen_at,
                Quest.id,
            )
            .limit(1)
        )
        if quest is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No unsolved quests are available.",
            )

        assignment = db.get(QuestAssignment, (user.username, quest.id))
        if assignment is not None:
            assignment.seen_at = datetime.now(timezone.utc)
            db.commit()
            return quest

        db.add(
            QuestAssignment(
                username=user.username,
                quest_id=quest.id,
                seen_at=datetime.now(timezone.utc),
            )
        )
        try:
            db.commit()
            return quest
        except IntegrityError:
            # A concurrent request may have claimed this quest first.
            db.rollback()


@router.post(
    "/{quest_id}/answer",
    response_model=QuestAnswerResult,
    status_code=status.HTTP_200_OK,
)
def submit_quest_answer(
    quest_id: UUID,
    submission: QuestAnswerSubmit,
    db: Database,
    user: CurrentUser,
) -> QuestAnswerResult:
    """Check an answer submitted for a quest assigned to the user."""
    quest = db.get(Quest, quest_id)
    assignment = db.get(QuestAssignment, (user.username, quest_id))
    if quest is None or assignment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This quest has not been assigned to you.",
        )

    if assignment.is_correct is True:
        return QuestAnswerResult(
            quest_id=quest.id,
            submitted_answer=assignment.submitted_answer or "",
            correct_answer=quest.answer,
            correct=True,
            points_awarded=0,
            total_score=user.score,
        )

    submitted_answer = submission.answer.strip()
    if not submitted_answer:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Answer must not be empty.",
        )

    correct = submitted_answer.casefold() == quest.answer.strip().casefold()
    claim_attempt = db.execute(
        update(QuestAssignment)
        .where(
            QuestAssignment.username == user.username,
            QuestAssignment.quest_id == quest_id,
            QuestAssignment.is_correct.is_not(True),
        )
        .values(
            submitted_answer=submitted_answer,
            is_correct=correct,
            answered_at=datetime.now(timezone.utc),
        )
    )
    if claim_attempt.rowcount == 0:
        db.rollback()
        assignment = db.get(QuestAssignment, (user.username, quest_id))
        return QuestAnswerResult(
            quest_id=quest.id,
            submitted_answer=assignment.submitted_answer or "",
            correct_answer=quest.answer if assignment.is_correct else None,
            correct=bool(assignment.is_correct),
            points_awarded=0,
            total_score=user.score,
        )

    points_awarded = 0
    if correct:
        user.score += quest.points
        quest.solvers.append(user)
        points_awarded = quest.points

    db.commit()
    db.refresh(user)
    return QuestAnswerResult(
        quest_id=quest.id,
        submitted_answer=submitted_answer,
        correct_answer=quest.answer if correct else None,
        correct=correct,
        points_awarded=points_awarded,
        total_score=user.score,
    )
