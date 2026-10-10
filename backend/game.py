"""Game rules shared by the routers: scoring, visibility, meetups, validation."""

import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, literal_column, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from hobbies import HOBBIES, parse_hobbies
from models import (
    APPROVED,
    COMPLETION_REJECTED,
    MEETUP,
    MULTI_STEP,
    PAIR,
    PENDING,
    PUBLISHED,
    QUIZ,
    SOLO,
    Completion,
    DismissedSuggestion,
    Friendship,
    MeetupRsvp,
    PairSession,
    Quest,
    QuestReport,
    QuestStep,
    QuizQuestion,
    StepProgress,
    User,
)
from schemas import (
    CompletionResult,
    CreatedQuestOut,
    ErrorResponse,
    PairSessionOut,
    QuestOut,
    QuizQuestionOut,
    QuizResult,
    StepOut,
    Suggestion,
    Suggestions,
)

# Quests have UUID keys, so creation order comes from SQLite's rowid.
QUEST_CREATION_ORDER = literal_column("quests.rowid")

# Meetup check-in opens this long before the start time.
CHECK_IN_EARLY = timedelta(minutes=15)


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def as_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc)


def to_naive_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Store aware datetimes as naive UTC; naive input is assumed to be UTC."""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


ERROR_DESCRIPTIONS = {
    400: "Not allowed for this quest",
    401: "Missing VISCON identity",
    403: "Maintainers only",
    404: "Not found",
    409: "Conflicts with the current state",
    410: "Code expired or cancelled",
    413: "Payload too large",
    415: "Unsupported media type",
}


def error_responses(*codes: int) -> dict:
    """OpenAPI docs for `{"detail": "..."}` errors, so Orval types them."""
    return {
        code: {"model": ErrorResponse, "description": ERROR_DESCRIPTIONS[code]}
        for code in codes
    }


def not_found(what: str = "Quest") -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail=f"{what} not found.")


def conflict(message: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, detail=message)


def bad_request(message: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail=message)


# --- Scoring ------------------------------------------------------------------

def total_points(db: Session, player_id: str) -> int:
    query = select(func.coalesce(func.sum(Completion.points_awarded), 0)).where(
        Completion.player_id == player_id, Completion.status == APPROVED)
    return db.scalar(query)


def find_completion(db: Session, player_id: str, quest_id: UUID) -> Optional[Completion]:
    return db.scalars(select(Completion).where(
        Completion.player_id == player_id,
        Completion.quest_id == quest_id,
    )).first()


def record_completion(
    db: Session,
    player_id: str,
    quest: Quest,
    completion_status: str = APPROVED,
    note: Optional[str] = None,
) -> Tuple[Completion, bool]:
    """Save a completion once per player and quest; return (completion, created).

    Safe against double taps and parallel requests: the unique constraint
    decides which request wins, the others get the existing row.
    """
    completion = find_completion(db, player_id, quest.id)
    if completion is not None:
        return completion, False
    completion = Completion(
        player_id=player_id,
        quest_id=quest.id,
        completed_at=utcnow(),
        points_awarded=quest.points if completion_status == APPROVED else 0,
        status=completion_status,
        note=note,
    )
    db.add(completion)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return find_completion(db, player_id, quest.id), False
    return completion, True


def completion_result(
    db: Session, player_id: str, completion: Completion, created: bool
) -> CompletionResult:
    return CompletionResult(
        quest_id=completion.quest_id,
        completed=completion.status == APPROVED,
        status=completion.status,
        already_completed=not created,
        points_awarded=completion.points_awarded if created else 0,
        total_points=total_points(db, player_id),
        completed_at=as_utc(completion.completed_at),
    )


# --- Visibility and quest views -----------------------------------------------

def get_playable_quest(db: Session, quest_id: UUID, kind: Optional[str] = None) -> Quest:
    """A published quest the player can act on, optionally of a given kind."""
    quest = db.get(Quest, quest_id)
    if quest is None or quest.status != PUBLISHED:
        raise not_found()
    if kind is not None and quest.kind != kind:
        raise bad_request(f"This is not a {kind.replace('_', '-')} quest.")
    return quest


def can_view(db: Session, player: User, quest: Quest) -> bool:
    return (
        quest.status == PUBLISHED
        or quest.author_id == player.username
        or find_completion(db, player.username, quest.id) is not None
    )


def meetup_state(quest: Quest, now: Optional[datetime] = None) -> Optional[str]:
    if quest.kind != MEETUP:
        return None
    if quest.cancelled:
        return "cancelled"
    if quest.starts_at is None or quest.ends_at is None:
        return "upcoming"
    now = now or utcnow()
    if now < quest.starts_at - CHECK_IN_EARLY:
        return "upcoming"
    if now <= quest.ends_at:
        return "live"
    return "past"


def ordered_steps(db: Session, quest_id: UUID) -> List[QuestStep]:
    return list(db.scalars(
        select(QuestStep).where(QuestStep.quest_id == quest_id).order_by(QuestStep.position)))


def ordered_questions(db: Session, quest_id: UUID) -> List[QuizQuestion]:
    return list(db.scalars(
        select(QuizQuestion).where(QuizQuestion.quest_id == quest_id)
        .order_by(QuizQuestion.position)))


def done_step_ids(db: Session, player_id: str, steps: List[QuestStep]) -> set:
    if not steps:
        return set()
    return set(db.scalars(select(StepProgress.step_id).where(
        StepProgress.player_id == player_id,
        StepProgress.step_id.in_([step.id for step in steps]),
    )))


def quest_views(db: Session, player: User, quests: List[Quest]) -> List[QuestOut]:
    """Player-facing quest data, loaded with a fixed number of queries."""
    if not quests:
        return []
    ids = [quest.id for quest in quests]
    completions: Dict[UUID, Completion] = {
        c.quest_id: c for c in db.scalars(select(Completion).where(
            Completion.player_id == player.username, Completion.quest_id.in_(ids)))
    }
    steps_by_quest: Dict[UUID, List[QuestStep]] = {}
    for step in db.scalars(select(QuestStep).where(QuestStep.quest_id.in_(ids))
                           .order_by(QuestStep.position)):
        steps_by_quest.setdefault(step.quest_id, []).append(step)
    questions_by_quest: Dict[UUID, List[QuizQuestion]] = {}
    for question in db.scalars(select(QuizQuestion).where(QuizQuestion.quest_id.in_(ids))
                               .order_by(QuizQuestion.position)):
        questions_by_quest.setdefault(question.quest_id, []).append(question)
    done = set(db.scalars(select(StepProgress.step_id).where(
        StepProgress.player_id == player.username)))
    rsvp_counts = dict(db.execute(
        select(MeetupRsvp.quest_id, func.count()).where(MeetupRsvp.quest_id.in_(ids))
        .group_by(MeetupRsvp.quest_id)).all())
    my_rsvps = set(db.scalars(select(MeetupRsvp.quest_id).where(
        MeetupRsvp.player_id == player.username, MeetupRsvp.quest_id.in_(ids))))
    my_reports = set(db.scalars(select(QuestReport.quest_id).where(
        QuestReport.player_id == player.username, QuestReport.quest_id.in_(ids))))
    pair_sessions: Dict[UUID, PairSession] = {}
    pair_ids = [quest.id for quest in quests if quest.kind == PAIR]
    if pair_ids:
        for session in db.scalars(
            select(PairSession)
            .where(
                PairSession.quest_id.in_(pair_ids),
                or_(PairSession.host_id == player.username,
                    PairSession.partner_id == player.username),
            )
            .order_by(PairSession.created_at.desc())
        ):
            pair_sessions.setdefault(session.quest_id, session)
    author_ids = {quest.author_id for quest in quests if quest.author_id}
    authors = dict(db.execute(
        select(User.username, User.name).where(User.username.in_(author_ids))).all()) if author_ids else {}

    now = utcnow()
    views = []
    for quest in quests:
        completion = completions.get(quest.id)
        approved = completion is not None and completion.status == APPROVED
        views.append(QuestOut(
            id=quest.id,
            title=quest.title,
            description=quest.description,
            location=quest.location,
            points=quest.points,
            kind=quest.kind,
            status=quest.status,
            requires_approval=quest.requires_approval,
            requires_code=quest.requires_code,
            requires_password=quest.requires_password,
            verification_starts_at=as_utc(quest.verification_starts_at),
            verification_ends_at=as_utc(quest.verification_ends_at),
            latitude=quest.latitude,
            longitude=quest.longitude,
            starts_at=as_utc(quest.starts_at),
            ends_at=as_utc(quest.ends_at),
            meetup_state=meetup_state(quest, now),
            author_name=authors.get(quest.author_id),
            completed=approved,
            completed_at=as_utc(completion.completed_at) if approved else None,
            completion_status=completion.status if completion else None,
            review_note=completion.review_note if completion else None,
            steps=[
                StepOut(id=s.id, position=s.position, title=s.title,
                        description=s.description, done=s.id in done)
                for s in steps_by_quest.get(quest.id, [])
            ],
            questions=[
                QuizQuestionOut(id=q.id, position=q.position, prompt=q.prompt,
                                choices=json.loads(q.choices))
                for q in questions_by_quest.get(quest.id, [])
            ],
            rsvp=quest.id in my_rsvps,
            rsvp_count=rsvp_counts.get(quest.id, 0),
            reported=quest.id in my_reports,
            pair_session=(session_out(db, pair_sessions[quest.id], player)
                          if quest.id in pair_sessions else None),
        ))
    return views


# --- Publishing rules ---------------------------------------------------------

def publish_problems(db: Session, quest: Quest) -> List[str]:
    """Everything that stops a quest from being published."""
    problems = []
    if len(quest.title.strip()) < 2:
        problems.append("Title needs at least 2 characters.")
    if quest.points < 1:
        problems.append("Points must be at least 1.")
    if quest.requires_password and not quest.password_hash:
        problems.append("Set a password before publishing this quest.")
    if (quest.latitude is None) != (quest.longitude is None):
        problems.append("Map pin needs both coordinates (or neither).")
    if quest.kind == QUIZ:
        questions = ordered_questions(db, quest.id)
        if not questions:
            problems.append("A quiz needs at least one question.")
        for index, question in enumerate(questions, start=1):
            choices = json.loads(question.choices)
            if not question.prompt.strip():
                problems.append(f"Question {index} needs a prompt.")
            if len([c for c in choices if c.strip()]) != len(choices) or len(choices) < 2:
                problems.append(f"Question {index} needs at least 2 non-empty choices.")
            if not 0 <= question.correct_index < len(choices):
                problems.append(f"Question {index} has no valid correct answer.")
    if quest.kind == MULTI_STEP:
        steps = ordered_steps(db, quest.id)
        if len(steps) < 2:
            problems.append("A multi-step quest needs at least 2 steps.")
        for index, step in enumerate(steps, start=1):
            if not step.title.strip():
                problems.append(f"Step {index} needs a title.")
    if quest.kind == MEETUP:
        if quest.starts_at is None or quest.ends_at is None:
            problems.append("A meetup needs a start and end time.")
        elif quest.starts_at >= quest.ends_at:
            problems.append("A meetup must end after it starts.")
    return problems


# --- Creating quests ----------------------------------------------------------

def created_quest_out(quest: Quest) -> CreatedQuestOut:
    return CreatedQuestOut(
        id=quest.id, title=quest.title, kind=quest.kind, status=quest.status)


# --- Quest actions --------------------------------------------------------------

WRONG_ACTION = {
    PAIR: "This quest needs a partner: start it and let another player enter your code.",
    QUIZ: "Answer the quiz questions to complete this quest.",
    MULTI_STEP: "Complete the steps of this quest one by one.",
}

MEETUP_CLOSED = {
    "upcoming": "Check-in opens 15 minutes before the meetup starts.",
    "past": "This meetup is over.",
    "cancelled": "This meetup was cancelled.",
}


def complete_quest(db: Session, player: User, quest: Quest,
                   note: Optional[str]) -> CompletionResult:
    """Complete a solo quest, or check in at a live meetup.

    Idempotent: completing again returns the existing completion with
    `already_completed: true` and `points_awarded: 0`. Quests with
    `requires_approval` create a pending completion that awards points only
    once a maintainer approves it; a rejected one can be resubmitted.
    """
    if quest.kind in WRONG_ACTION:
        raise bad_request(WRONG_ACTION[quest.kind])
    if quest.requires_code:
        raise bad_request(
            "Scan the QR code shown at the meetup to check in."
            if quest.kind == MEETUP else
            "Enter the printed code to complete this quest.")
    if quest.requires_password:
        raise bad_request("Enter the password to complete this quest.")

    existing = find_completion(db, player.username, quest.id)
    if quest.kind == MEETUP and existing is None:
        state = meetup_state(quest)
        if state != "live":
            raise conflict(MEETUP_CLOSED[state])

    note = (note or "").strip() or None
    if quest.kind == SOLO and quest.requires_approval:
        if existing is not None and existing.status == COMPLETION_REJECTED:
            existing.status = PENDING
            existing.note = note
            existing.completed_at = utcnow()
            existing.review_note = None
            existing.reviewer_id = None
            existing.reviewed_at = None
            db.commit()
            return completion_result(db, player.username, existing, created=True)
        completion, created = record_completion(db, player.username, quest, PENDING, note)
    else:
        completion, created = record_completion(db, player.username, quest, APPROVED)
    return completion_result(db, player.username, completion, created)


def redeem_quest_code(db: Session, player: User, quest: Quest,
                      code: str) -> CompletionResult:
    """Check a solo quest's printed code or password, or a live meetup's QR code."""
    if quest.kind not in (SOLO, MEETUP):
        raise bad_request(WRONG_ACTION.get(quest.kind, "This quest does not use a code."))
    if quest.requires_password:
        if quest.kind != SOLO:
            raise bad_request("Only solo quests use passwords.")
        if not verify_quest_password(code.strip(), quest.password_hash):
            raise bad_request("That password is not valid for this quest.")
    elif quest.requires_code:
        normalized = code.strip().upper()
        if not normalized.isascii() or not hmac.compare_digest(
            normalized, quest.verification_code or ""
        ):
            raise bad_request("That code is not valid for this quest.")
        now = utcnow()
        if quest.verification_starts_at is not None and now < quest.verification_starts_at:
            raise conflict("This code is not valid yet. Check the start time shown on the quest.")
        if quest.verification_ends_at is not None and now >= quest.verification_ends_at:
            raise conflict("This code's validity period has ended. No points can be awarded.")
    else:
        raise bad_request("This quest does not use a code or password.")
    if quest.kind == MEETUP and find_completion(db, player.username, quest.id) is None:
        state = meetup_state(quest)
        if state != "live":
            raise conflict(MEETUP_CLOSED[state])
    completion, created = record_completion(db, player.username, quest, APPROVED)
    return completion_result(db, player.username, completion, created)


def hash_quest_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return f"sha256$200000${salt.hex()}${digest.hex()}"


def verify_quest_password(password: str, saved: Optional[str]) -> bool:
    if not saved:
        return False
    try:
        algorithm, rounds, salt, expected = saved.split("$")
        if algorithm != "sha256" or int(rounds) != 200_000:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(digest, bytes.fromhex(expected))
    except (ValueError, TypeError):
        return False


def submit_quiz(db: Session, player: User, quest: Quest,
                answers: List[int]) -> Tuple[QuizResult, Optional[CompletionResult]]:
    """Check quiz answers. All must be right to pass; retries are unlimited
    and the reward is granted only once."""
    questions = ordered_questions(db, quest.id)
    if len(answers) != len(questions):
        raise bad_request("Answer every question.")
    correct = [answer == question.correct_index
               for answer, question in zip(answers, questions)]
    passed = all(correct)
    completion = None
    if passed:
        saved, created = record_completion(db, player.username, quest, APPROVED)
        completion = completion_result(db, player.username, saved, created)
    result = QuizResult(passed=passed, correct_count=sum(correct),
                        total=len(questions), correct=correct)
    return result, completion


def complete_step(db: Session, player: User, quest: Quest,
                  step_id: UUID) -> Optional[CompletionResult]:
    """Mark the next step as done; the last step completes the quest.

    Steps must be done in order. Points come only with the whole quest.
    """
    steps = ordered_steps(db, quest.id)
    step = next((s for s in steps if s.id == step_id), None)
    if step is None:
        raise not_found("Step")

    done = done_step_ids(db, player.username, steps)
    if step.id not in done:
        next_step = next(s for s in steps if s.id not in done)
        if next_step.id != step.id:
            raise conflict(f"Do step {next_step.position} first.")
        db.add(StepProgress(player_id=player.username, step_id=step.id, completed_at=utcnow()))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()  # double tap: already saved
        done = done_step_ids(db, player.username, steps)

    if len(done) == len(steps):
        saved, created = record_completion(db, player.username, quest, APPROVED)
        return completion_result(db, player.username, saved, created)
    return None


def set_rsvp(db: Session, player: User, quest: Quest, attending: bool) -> None:
    """Say you're coming to a meetup, or withdraw (check-in works without it)."""
    if attending:
        state = meetup_state(quest)
        if state in ("past", "cancelled"):
            raise conflict(MEETUP_CLOSED[state])
        db.add(MeetupRsvp(player_id=player.username, quest_id=quest.id, created_at=utcnow()))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()  # already joined
        return
    rsvp = db.scalars(select(MeetupRsvp).where(
        MeetupRsvp.quest_id == quest.id, MeetupRsvp.player_id == player.username)).first()
    if rsvp is not None:
        db.delete(rsvp)
        db.commit()


def report_quest(db: Session, player: User, quest: Quest, reason: str) -> None:
    """Report inappropriate quest content to the maintainers (once per player)."""
    db.add(QuestReport(player_id=player.username, quest_id=quest.id,
                       reason=reason.strip(), created_at=utcnow()))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise conflict("You already reported this quest.")


# --- Pair sessions ----------------------------------------------------------------
# The host starts a session and shows a code (or the /join/CODE link); a
# different player enters it. Both get the reward once.

CODE_LENGTH = 6
# No 0/O, 1/I/L, so codes are easy to read aloud and type.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LIFETIME = timedelta(minutes=10)


def session_state(session: PairSession) -> str:
    if session.completed_at is not None:
        return "completed"
    if session.cancelled:
        return "cancelled"
    if utcnow() > session.expires_at:
        return "expired"
    return "waiting"


def session_out(db: Session, session: PairSession, player: User) -> PairSessionOut:
    quest = db.get(Quest, session.quest_id)
    host = db.get(User, session.host_id)
    partner = db.get(User, session.partner_id) if session.partner_id else None
    invited = db.get(User, session.invited_player_id) if session.invited_player_id else None
    return PairSessionOut(
        code=session.code,
        quest_id=quest.id,
        quest_title=quest.title,
        host_name=host.name,
        partner_name=partner.name if partner else None,
        is_host=session.host_id == player.username,
        state=session_state(session),
        expires_at=as_utc(session.expires_at),
        invited_name=invited.name if invited else None,
    )


def new_code(db: Session) -> str:
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        in_use = db.scalars(select(PairSession.id).where(
            PairSession.code == code,
            PairSession.expires_at >= utcnow(),
        )).first()
        if in_use is None:
            return code


def find_by_code(db: Session, code: str) -> PairSession:
    session = db.scalars(
        select(PairSession)
        .where(PairSession.code == code.strip().upper())
        .order_by(PairSession.created_at.desc())
    ).first()
    if session is None:
        raise not_found("Code")
    return session


def cancel_pair(db: Session, player: User, quest: Quest) -> None:
    """Cancel the player's open code for this quest (idempotent)."""
    db.execute(
        update(PairSession)
        .where(
            PairSession.quest_id == quest.id,
            PairSession.host_id == player.username,
            PairSession.completed_at.is_(None),
        )
        .values(cancelled=True))
    db.commit()


def start_pair(db: Session, player: User, quest: Quest,
               invite_username: Optional[str]) -> PairSession:
    """Start a two-player quest and create a code for the partner.

    Replaces the player's earlier open code for this quest. Hosts who already
    completed the quest may host again to help others; only the partner
    earns points then. With `invite_username` the code also appears on that
    player's home screen; both players must have opted in to suggestions.
    """
    if invite_username is not None:
        if invite_username == player.username:
            raise bad_request("You can't invite yourself.")
        invitee = db.get(User, invite_username)
        if invitee is None or not invitee.discoverable or not player.discoverable:
            # Same rule as suggestions: only between players who opted in.
            raise bad_request("You can only invite players from your suggestions.")
    db.execute(
        update(PairSession)
        .where(
            PairSession.quest_id == quest.id,
            PairSession.host_id == player.username,
            PairSession.completed_at.is_(None),
        )
        .values(cancelled=True))
    now = utcnow()
    session = PairSession(
        quest_id=quest.id,
        host_id=player.username,
        code=new_code(db),
        created_at=now,
        expires_at=now + CODE_LIFETIME,
        invited_player_id=invite_username,
    )
    db.add(session)
    db.commit()
    return session


def join_pair(db: Session, player: User, code: str) -> Tuple[PairSession, CompletionResult]:
    """Join a partner's session. Completes the quest for both players; each
    gets the reward once (none if already completed). Retrying your own
    successful join is harmless."""
    session = find_by_code(db, code)
    if session.host_id == player.username:
        raise bad_request("You can't join your own code. Show it to another player.")

    if session.partner_id != player.username:  # not a retry of our own join
        state = session_state(session)
        if state == "cancelled":
            raise HTTPException(status.HTTP_410_GONE, detail="This code was cancelled.")
        if state == "expired":
            raise HTTPException(
                status.HTTP_410_GONE,
                detail="This code has expired. Ask your partner to start the quest again.")
        if state == "completed":
            raise conflict("This code was already used by another player.")
        quest = db.get(Quest, session.quest_id)
        if quest.status != PUBLISHED:
            raise conflict("This quest is no longer available.")

        # Claim the session atomically: only one partner can win.
        now = utcnow()
        claimed = db.execute(
            update(PairSession)
            .where(
                PairSession.id == session.id,
                PairSession.partner_id.is_(None),
                PairSession.cancelled.is_(False),
                PairSession.expires_at >= now,
            )
            .values(partner_id=player.username, completed_at=now)
        ).rowcount
        db.commit()
        db.refresh(session)
        if not claimed and session.partner_id != player.username:
            raise conflict("This code was already used by another player.")

    quest = db.get(Quest, session.quest_id)
    record_completion(db, session.host_id, quest, APPROVED)
    completion, created = record_completion(db, player.username, quest, APPROVED)
    return session, completion_result(db, player.username, completion, created)


def open_invitations(db: Session, player: User) -> List[PairSessionOut]:
    """Open pair invitations addressed to the player, newest first."""
    sessions = db.scalars(
        select(PairSession)
        .where(
            PairSession.invited_player_id == player.username,
            PairSession.completed_at.is_(None),
            PairSession.cancelled.is_(False),
            PairSession.expires_at >= utcnow(),
        )
        .order_by(PairSession.created_at.desc())
    )
    return [session_out(db, session, player) for session in sessions]


# --- Connection suggestions ---------------------------------------------------------
# Consent rules: only players who opted in (`discoverable`) appear in
# suggestions, and only they receive suggestions. A suggestion shows the
# display name and shared hobbies, nothing else. Dismissed players are never
# suggested again; friends and players with an open friend request (either
# way) aren't suggested while that relation exists.

MAX_SUGGESTIONS = 20


def suggestions_for(db: Session, player: User) -> Suggestions:
    """Discoverable players sharing at least one hobby, most shared first."""
    if not player.discoverable:
        return Suggestions(enabled=False, suggestions=[])
    mine = set(parse_hobbies(player.hobbies))
    dismissed = set(db.scalars(select(DismissedSuggestion.dismissed_player_id).where(
        DismissedSuggestion.player_id == player.username)))
    connected = set()
    for requester_id, addressee_id in db.execute(
        select(Friendship.requester_id, Friendship.addressee_id).where(or_(
            Friendship.requester_id == player.username,
            Friendship.addressee_id == player.username,
        ))
    ):
        connected.add(addressee_id if requester_id == player.username else requester_id)
    candidates = db.scalars(select(User).where(
        User.discoverable.is_(True), User.username != player.username))

    suggestions = []
    for other in candidates:
        if other.username in dismissed or other.username in connected:
            continue
        shared = [key for key in parse_hobbies(other.hobbies) if key in mine]
        if shared:
            suggestions.append(Suggestion(
                username=other.username,
                display_name=other.name,
                shared_hobbies=[HOBBIES[key] for key in shared],
            ))
    suggestions.sort(key=lambda s: (-len(s.shared_hobbies), s.display_name.lower()))
    return Suggestions(enabled=True, suggestions=suggestions[:MAX_SUGGESTIONS])
