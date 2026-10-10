"""API request/response models. Orval generates the frontend types from these."""

from datetime import datetime
from typing import Annotated, List, Literal, Optional, Union
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class ErrorResponse(BaseModel):
    detail: str = Field(examples=["Quest not found."])


# --- Players, profile, badges -------------------------------------------------

class Badge(BaseModel):
    key: str
    title: str
    description: str
    earned: bool
    earned_at: Optional[datetime] = None
    progress: int = Field(description="Progress towards the badge, capped at target")
    target: int = Field(description="Progress needed, e.g. 5 quests or 100 points")


class ProfileUpdate(BaseModel):
    hobbies: List[str] = Field(max_length=20)
    discoverable: bool


class HobbyOption(BaseModel):
    key: str
    label: str


# --- Quests (player view) -----------------------------------------------------

QuestKind = Literal["solo", "pair", "quiz", "multi_step", "meetup"]
QuestStatus = Literal["draft", "pending_review", "published", "rejected", "retired"]
CompletionStatus = Literal["approved", "pending", "rejected"]
MeetupState = Literal["upcoming", "live", "past", "cancelled"]


PairState = Literal["waiting", "completed", "expired", "cancelled"]


class PairSessionOut(BaseModel):
    code: str
    quest_id: UUID
    quest_title: str
    host_name: str
    partner_name: Optional[str] = None
    is_host: bool
    state: PairState
    expires_at: datetime
    invited_name: Optional[str] = Field(
        default=None, description="Player the host invited, if any")


class StepOut(BaseModel):
    id: UUID
    position: int
    title: str
    description: str
    done: bool


class QuizQuestionOut(BaseModel):
    id: UUID
    position: int
    prompt: str
    choices: List[str]


class QuestOut(BaseModel):
    id: UUID
    title: str
    description: str = Field(description="Instructions for the activity")
    location: Optional[str] = None
    points: int = Field(description="Reward for completing the quest")
    kind: QuestKind
    status: QuestStatus
    requires_approval: bool
    requires_code: bool = Field(
        description="Enter the printed code or scan its QR to complete (meetups: to check in)")
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
    pair_session: Optional[PairSessionOut] = Field(
        default=None, description="My latest pair session for this quest (host or partner)")


class CodeRedemption(BaseModel):
    code: str = Field(min_length=1, max_length=40)


class CompletionResult(BaseModel):
    quest_id: UUID
    completed: bool = Field(description="True once the completion is approved")
    status: CompletionStatus
    already_completed: bool = Field(
        description="True if the quest was completed/submitted before this request")
    points_awarded: int = Field(
        description="Points granted by this request (0 if already completed or pending)")
    total_points: int = Field(description="Player's updated total")
    completed_at: datetime


class QuizResult(BaseModel):
    passed: bool
    correct_count: int
    total: int
    correct: List[bool] = Field(description="Per question, whether the answer was right")


# --- Quest actions (POST /quests/{quest_id}/actions) ---------------------------

class CompleteAction(BaseModel):
    """Complete a solo quest or check in at a live meetup."""
    type: Literal["complete"]
    note: Optional[str] = Field(
        default=None, max_length=500,
        description="What the player did (shown to reviewers on approval quests)")


class RedeemAction(BaseModel):
    """Redeem a printed code: completes a solo quest, or checks in at a live
    meetup whose organiser shows the QR code."""
    type: Literal["redeem"]
    code: str = Field(min_length=1, max_length=40)


class QuizAction(BaseModel):
    type: Literal["quiz"]
    answers: List[int] = Field(description="Chosen choice index per question, in order")


class StepAction(BaseModel):
    """Mark the next step of a multi-step quest as done."""
    type: Literal["step"]
    step_id: UUID


class RsvpAction(BaseModel):
    type: Literal["rsvp"]
    attending: bool


class ReportAction(BaseModel):
    type: Literal["report"]
    reason: str = Field(min_length=5, max_length=500)


class PairStartAction(BaseModel):
    """Start a pair quest and get a code (replaces your earlier open code)."""
    type: Literal["pair_start"]
    invite_username: Optional[str] = Field(
        default=None,
        description="Invite a suggested username: the code appears on their home screen")


class PairCancelAction(BaseModel):
    type: Literal["pair_cancel"]


QuestAction = Annotated[
    Union[CompleteAction, RedeemAction, QuizAction, StepAction, RsvpAction, ReportAction,
          PairStartAction, PairCancelAction],
    Field(discriminator="type"),
]


class QuestActionResult(BaseModel):
    quest: QuestOut = Field(description="The quest as it is after the action")
    completion: Optional[CompletionResult] = Field(
        default=None, description="Set when the action completed or submitted the quest")
    quiz: Optional[QuizResult] = Field(default=None, description="Set for type=quiz")


class PairJoinResult(BaseModel):
    session: PairSessionOut
    completion: CompletionResult


# --- Player-submitted quests --------------------------------------------------

class QuestSubmission(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=2000)
    location: Optional[str] = Field(default=None, max_length=255)


class SubmissionOut(BaseModel):
    id: UUID
    title: str
    description: str
    location: Optional[str] = None
    status: QuestStatus
    review_note: Optional[str] = None


# --- Connections --------------------------------------------------------------

class Suggestion(BaseModel):
    username: str
    display_name: str
    shared_hobbies: List[str] = Field(description="Labels of hobbies you share")


class PlayerSearchResult(BaseModel):
    username: str
    display_name: str


FriendStatus = Literal["none", "outgoing", "incoming", "friends"]


class PublicPlayer(BaseModel):
    """What other players may see of a discoverable player."""

    username: str
    display_name: str
    total_points: int
    hobbies: List[str] = Field(description="Hobby keys, see Me.hobby_options")
    badges: List[Badge]
    friend_status: FriendStatus = Field(
        description="My relation to this player: none, outgoing/incoming request, or friends")


# --- Friends ------------------------------------------------------------------

class FriendOut(BaseModel):
    username: str
    display_name: str
    total_points: int
    since: datetime = Field(description="When the request was accepted")


class FriendRequestOut(BaseModel):
    username: str
    display_name: str
    created_at: datetime


class Friends(BaseModel):
    friends: List[FriendOut] = Field(description="Accepted friends, most points first")
    incoming: List[FriendRequestOut] = Field(
        description="Requests waiting for my answer, newest first")
    outgoing: List[FriendRequestOut] = Field(
        description="Requests I sent that are still open, newest first")


class Suggestions(BaseModel):
    enabled: bool = Field(description="False until the player opts in")
    suggestions: List[Suggestion]


# --- Current player -----------------------------------------------------------

class Me(BaseModel):
    username: str
    display_name: str
    total_points: int
    is_maintainer: bool
    hobbies: List[str] = Field(description="Chosen hobby keys, see hobby_options")
    discoverable: bool = Field(description="Opted in to connection suggestions")
    badges: List[Badge]
    hobby_options: List[HobbyOption] = Field(description="All selectable hobbies")
    suggestions: Suggestions
    invitations: List[PairSessionOut] = Field(description="Open pair invites addressed to me")
    submissions: List[SubmissionOut] = Field(description="Quests I proposed, newest first")


# --- Leaderboard --------------------------------------------------------------

class LeaderboardEntry(BaseModel):
    rank: int = Field(description="Players with equal points share a rank")
    username: Optional[str] = Field(
        default=None, description="Username when the viewer may view this profile")
    display_name: str
    points: int
    is_current_player: bool


class Leaderboard(BaseModel):
    entries: List[LeaderboardEntry] = Field(
        description="Players with at least one point, best first")
    current_player: LeaderboardEntry


class MeetupPhotoOut(BaseModel):
    id: UUID
    quest_id: UUID
    quest_title: str
    uploaded_at: datetime


class QuestPhotoOut(BaseModel):
    id: UUID
    quest_id: UUID
    quest_title: str
    uploaded_at: datetime
    is_mine: bool


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
    status: Literal["draft", "published"] = "draft"

    @model_validator(mode="after")
    def valid_verification(self):
        if self.requires_code and self.kind not in ("solo", "meetup"):
            raise ValueError("Code verification is available for solo and meetup quests only")
        if self.requires_code and self.requires_approval:
            raise ValueError("Choose code verification or maintainer approval")
        return self


# Fields of AdminQuestPatch that may not be sent as null.
NOT_NULL_PATCH_FIELDS = (
    "title", "description", "points", "kind", "requires_approval", "requires_code", "cancelled",
    "steps", "questions", "status",
)


class AdminQuestPatch(BaseModel):
    """Change only the fields you send (status changes publish, retire or reject)."""
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    location: Optional[str] = Field(default=None, max_length=255)
    points: Optional[int] = Field(default=None, ge=0, le=1000)
    kind: Optional[QuestKind] = None
    requires_approval: Optional[bool] = None
    requires_code: Optional[bool] = None
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    cancelled: Optional[bool] = None
    steps: Optional[List[StepIn]] = Field(default=None, max_length=20)
    questions: Optional[List[QuizQuestionIn]] = Field(default=None, max_length=20)
    status: Optional[Literal["draft", "published", "rejected", "retired"]] = None
    review_note: Optional[str] = Field(
        default=None, max_length=1000, description="Shown to the author on rejection")

    @model_validator(mode="after")
    def required_fields_not_null(self):
        nulls = [name for name in NOT_NULL_PATCH_FIELDS
                 if name in self.model_fields_set and getattr(self, name) is None]
        if nulls:
            raise ValueError(f"These fields can't be null: {', '.join(nulls)}")
        return self

class AdminQuizQuestionOut(QuizQuestionIn):
    id: UUID


class AdminQuestOut(BaseModel):
    id: UUID
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


class AdminCompletionOut(BaseModel):
    id: UUID
    quest_id: UUID
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
    id: UUID
    quest_id: UUID
    quest_title: str
    quest_status: QuestStatus
    reporter_name: str
    reason: str
    created_at: datetime


class ReportResolution(BaseModel):
    retire_quest: bool = Field(description="Also retire the reported quest")
