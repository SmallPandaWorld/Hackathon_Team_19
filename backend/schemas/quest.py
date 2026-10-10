from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class QuestCreate(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(min_length=1, max_length=2000)
    points: int = Field(gt=0)


class QuestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    question: str
    points: int


class QuestInspection(BaseModel):
    id: UUID
    question: str
    answer: str
    points: int
    participants: list[str]
    solvers: list[str]


class QuestAnswerSubmit(BaseModel):
    answer: str = Field(min_length=1, max_length=2000)


class QuestAnswerResult(BaseModel):
    quest_id: UUID
    submitted_answer: str
    correct_answer: str | None
    correct: bool
    points_awarded: int
    total_score: int
