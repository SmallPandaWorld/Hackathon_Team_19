"""API request/response models. Orval generates the frontend types from these."""

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator


class ErrorResponse(BaseModel):
    detail: str = Field(examples=["Quest not found."])


# --- Players, profile, badges -------------------------------------------------

class Player(BaseModel):
    id: int = Field(description="Internal player ID")
    display_name: str
    total_points: int
    is_maintainer: bool
    hobbies: List[str] = Field(description="Hobby keys, see GET /hobbies")
    discoverable: bool = Field(description="Opted in to connection suggestions")


class ProfileUpdate(BaseModel):
    hobbies: List[str] = Field(max_length=20)
    discoverable: bool


class HobbyOption(BaseModel):
    key: str
    label: str


class Badge(BaseModel):
    key: str
    title: str
    description: str
    earned: bool
    earned_at: Optional[datetime] = None
    progress: int = Field(description="Progress towards the badge, capped at target")
    target: int = Field(description="Progress needed, e.g. 5 quests or 100 points")


# --- Quests (player view) -----------------------------------------------------

QuestKind = Literal["solo", "pair", "quiz", "multi_step", "meetup"]
QuestStatus = Literal["draft", "pending_review", "published", "rejected", "retired"]
CompletionStatus = Literal["approved", "pending", "rejected"]
MeetupState = Literal["upcoming", "live", "past", "cancelled"]


class StepOut(BaseModel):
    id: int
    position: int
    title: str
    description: str
    done: bool


class QuizQuestionOut(BaseModel):
    id: int
    position: int
    prompt: str
    choices: List[str]


class QuestOut(BaseModel):
    id: int
    title: str
    description: str = Field(description="Instructions for the activity")
    location: Optional[str] = None
    points: int = Field(description="Reward for completing the quest")
    kind: QuestKind
    status: QuestStatus
    requires_approval: bool
    requires_code: bool = Field(description="Enter the printed code or scan its QR to complete")
    latitude: Optional[float] = Field(default=None, description="Map pin (WGS84)")
    longitude: Optional[float] = Field(default=None, description="Map pin (WGS84)")
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    meetup_state: Optional[MeetupState] = None
    author_name: Optional[str] = Field(default=None, description="Set for player-submitted quests")
    completed: bool = Field(description="Current player has an approved completion")
    completed_at: Optional[datetime] = Field(
        default=None, description="UTC time of the current player's completion")
    completion_status: Optional[CompletionStatus] = None
    review_note: Optional[str] = Field(
        default=None, description="Maintainer's note on a rejected completion")
    steps: List[StepOut] = []
    questions: List[QuizQuestionOut] = []
    rsvp: bool = False
    rsvp_count: int = 0
    reported: bool = False


class CompleteRequest(BaseModel):
    note: Optional[str] = Field(
        default=None, max_length=500,
        description="What the player did (shown to reviewers on approval quests)")


class CodeRedemption(BaseModel):
    code: str = Field(min_length=1, max_length=40)


class CompletionResult(BaseModel):
    quest_id: int
    completed: bool = Field(description="True once the completion is approved")
    status: CompletionStatus
    already_completed: bool = Field(
        description="True if the quest was completed/submitted before this request")
    points_awarded: int = Field(
        description="Points granted by this request (0 if already completed or pending)")
    total_points: int = Field(description="Player's updated total")
    completed_at: datetime


class QuizSubmission(BaseModel):
    answers: List[int] = Field(description="Chosen choice index per question, in order")


class QuizResult(BaseModel):
    passed: bool
    correct_count: int
    total: int
    correct: List[bool] = Field(description="Per question, whether the answer was right")
    completion: Optional[CompletionResult] = None


class StepResult(BaseModel):
    step_id: int
    steps_done: int
    steps_total: int
    completion: Optional[CompletionResult] = Field(
        default=None, description="Set when this step finished the quest")


class RsvpResult(BaseModel):
    rsvp: bool
    rsvp_count: int


class ReportRequest(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


# --- Pair quests --------------------------------------------------------------

PairState = Literal["waiting", "completed", "expired", "cancelled"]


class PairSessionOut(BaseModel):
    code: str
    quest_id: int
    quest_title: str
    host_name: str
    partner_name: Optional[str] = None
    is_host: bool
    state: PairState
    expires_at: datetime
    invited_name: Optional[str] = Field(
        default=None, description="Player the host invited, if any")


class PairStartRequest(BaseModel):
    invite_player_id: Optional[int] = Field(
        default=None,
        description="Invite a suggested player: the code appears on their home screen")


class PairJoinResult(BaseModel):
    session: PairSessionOut
    completion: CompletionResult


# --- Player-submitted quests --------------------------------------------------

class QuestSubmission(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=2000)
    location: Optional[str] = Field(default=None, max_length=255)


class SubmissionOut(BaseModel):
    id: int
    title: str
    description: str
    location: Optional[str] = None
    status: QuestStatus
    review_note: Optional[str] = None


# --- Connections --------------------------------------------------------------

class Suggestion(BaseModel):
    player_id: int
    display_name: str
    shared_hobbies: List[str] = Field(description="Labels of hobbies you share")


class Suggestions(BaseModel):
    enabled: bool = Field(description="False until the player opts in")
    suggestions: List[Suggestion]


# --- Leaderboard --------------------------------------------------------------

class LeaderboardEntry(BaseModel):
    rank: int = Field(description="Players with equal points share a rank")
    player_id: int
    display_name: str
    points: int
    is_current_player: bool


class Leaderboard(BaseModel):
    entries: List[LeaderboardEntry] = Field(
        description="Players with at least one point, best first")
    current_player: LeaderboardEntry


# --- Maintainers --------------------------------------------------------------

class StepIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=2000)


class QuizQuestionIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=1000)
    choices: List[str] = Field(min_length=2, max_length=8)
    correct_index: int = Field(ge=0)

    @model_validator(mode="after")
    def correct_answer_exists(self):
        if self.correct_index >= len(self.choices):
            raise ValueError("correct_index must point to one of the choices")
        return self


class AdminQuestIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=2000)
    location: Optional[str] = Field(default=None, max_length=255)
    points: int = Field(ge=0, le=1000)
    kind: QuestKind = "solo"
    requires_approval: bool = False
    requires_code: bool = False
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    cancelled: bool = False
    steps: List[StepIn] = Field(default=[], max_length=20)
    questions: List[QuizQuestionIn] = Field(default=[], max_length=20)

    @model_validator(mode="after")
    def valid_verification(self):
        if self.requires_code and self.kind != "solo":
            raise ValueError("Code verification is available for solo quests only")
        if self.requires_code and self.requires_approval:
            raise ValueError("Choose code verification or maintainer approval")
        return self


class AdminQuizQuestionOut(QuizQuestionIn):
    id: int


class AdminQuestOut(BaseModel):
    id: int
    title: str
    description: str
    location: Optional[str] = None
    points: int
    kind: QuestKind
    status: QuestStatus
    requires_approval: bool
    requires_code: bool
    verification_code: str = Field(description="Stable code for the printable QR; maintainers only")
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    cancelled: bool
    author_name: Optional[str] = None
    review_note: Optional[str] = None
    steps: List[StepIn]
    questions: List[AdminQuizQuestionOut]
    completion_count: int
    open_reports: int
    publish_problems: List[str] = Field(
        description="Why the quest can't be published yet (empty if it can)")


class StatusChange(BaseModel):
    status: Literal["draft", "published", "rejected", "retired"]
    note: Optional[str] = Field(
        default=None, max_length=1000, description="Shown to the author on rejection")


class AdminCompletionOut(BaseModel):
    id: int
    quest_id: int
    quest_title: str
    player_name: str
    note: Optional[str] = None
    status: CompletionStatus
    completed_at: datetime
    review_note: Optional[str] = None


class CompletionReview(BaseModel):
    approve: bool
    note: Optional[str] = Field(default=None, max_length=1000)


class AdminReportOut(BaseModel):
    id: int
    quest_id: int
    quest_title: str
    quest_status: QuestStatus
    reporter_name: str
    reason: str
    created_at: datetime


class ReportResolution(BaseModel):
    retire_quest: bool = Field(description="Also retire the reported quest")
