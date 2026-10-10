"""Meetup albums, player quest photos, and opt-in profile galleries."""

import os
from pathlib import Path
from typing import List
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from auth import get_current_player, is_maintainer, require_maintainer
from database import get_db
from friendships import friendship_between
from game import can_view, not_found, utcnow
from models import (
    APPROVED,
    MEETUP,
    MULTI_STEP,
    PAIR,
    Completion,
    MeetupPhoto,
    Quest,
    QuestPhoto,
    User,
)
from schemas import MeetupPhotoOut, QuestPhotoOut

router = APIRouter(tags=["meetup photos"])

MAX_MEETUP_PHOTO_BYTES = 8 * 1024 * 1024
MAX_QUEST_PHOTO_BYTES = 8 * 1024 * 1024
MAX_PROFILE_MEETUP_PHOTOS = 50
MAX_PROFILE_QUEST_PHOTOS = 50
PHOTO_QUEST_KINDS = {MEETUP, PAIR, MULTI_STEP}
MEETUP_PHOTO_STORAGE_DIR = Path(os.getenv(
    "MEETUP_PHOTO_STORAGE_DIR",
    Path(__file__).resolve().parents[1] / "meetup_photos",
))
QUEST_PHOTO_STORAGE_DIR = Path(os.getenv(
    "QUEST_PHOTO_STORAGE_DIR",
    Path(__file__).resolve().parents[1] / "quest_photos",
))


def _photo_path(photo_id: UUID) -> Path:
    # The random UUID is the only filesystem key.
    return MEETUP_PHOTO_STORAGE_DIR / f"{photo_id.hex}.image"


def _quest_photo_path(photo_id: UUID) -> Path:
    return QUEST_PHOTO_STORAGE_DIR / f"{photo_id.hex}.image"


def _media_type(content: bytes | bytearray) -> str | None:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


def _photo_out(photo: MeetupPhoto, quest: Quest) -> MeetupPhotoOut:
    return MeetupPhotoOut(
        id=photo.id,
        quest_id=quest.id,
        quest_title=quest.title,
        uploaded_at=photo.uploaded_at,
    )


def _quest_photo_out(
    photo: QuestPhoto, quest: Quest, *, is_mine: bool = False
) -> QuestPhotoOut:
    return QuestPhotoOut(
        id=photo.id,
        quest_id=quest.id,
        quest_title=quest.title,
        uploaded_at=photo.uploaded_at,
        is_mine=is_mine,
    )


def _photos_for_quest(db: Session, quest: Quest) -> List[MeetupPhotoOut]:
    photos = db.scalars(
        select(MeetupPhoto)
        .where(MeetupPhoto.quest_id == quest.id)
        .order_by(MeetupPhoto.uploaded_at.desc(), MeetupPhoto.id)
    ).all()
    return [_photo_out(photo, quest) for photo in photos]


def _profile_is_viewable(db: Session, viewer: User, profile: User) -> bool:
    return (
        profile.discoverable
        or profile.username == viewer.username
        or friendship_between(db, viewer.username, profile.username) is not None
    )


def _missing_photo() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Photo not found.",
        headers={"Cache-Control": "private, no-store"},
    )


def _serve_photo(photo: MeetupPhoto) -> Response:
    path = _photo_path(photo.id)
    if not path.is_file():
        raise _missing_photo()
    content = path.read_bytes()
    if _media_type(content) != photo.media_type:
        raise _missing_photo()
    return Response(
        content=content,
        media_type=photo.media_type,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


def _serve_quest_photo(photo: QuestPhoto) -> Response:
    path = _quest_photo_path(photo.id)
    if not path.is_file():
        raise _missing_photo()
    content = path.read_bytes()
    if _media_type(content) != photo.media_type:
        raise _missing_photo()
    return Response(
        content=content,
        media_type=photo.media_type,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


def _get_meetup_photo(db: Session, photo_id: UUID) -> tuple[MeetupPhoto, Quest]:
    photo = db.get(MeetupPhoto, photo_id)
    quest = db.get(Quest, photo.quest_id) if photo else None
    if photo is None or quest is None or quest.kind != MEETUP:
        raise _missing_photo()
    return photo, quest


@router.get(
    "/quests/{quest_id}/photos",
    response_model=List[MeetupPhotoOut],
    responses={404: {"description": "Meetup not found"}},
)
def list_meetup_photos(
    quest_id: UUID,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """List photos attached to a meetup the player can view."""
    quest = db.get(Quest, quest_id)
    if (
        quest is None
        or quest.kind != MEETUP
        or (not can_view(db, player, quest) and not is_maintainer(player))
    ):
        raise not_found("Meetup")
    return _photos_for_quest(db, quest)


@router.get(
    "/quests/{quest_id}/player-photos",
    response_model=List[QuestPhotoOut],
    responses={404: {"description": "Quest not found"}},
)
def list_quest_photos(
    quest_id: UUID,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """List player-uploaded photos for a meetup, pair, or multi-step quest."""
    quest = db.get(Quest, quest_id)
    if (
        quest is None
        or quest.kind not in PHOTO_QUEST_KINDS
        or (not can_view(db, player, quest) and not is_maintainer(player))
    ):
        raise not_found("Quest")
    photos = db.scalars(
        select(QuestPhoto)
        .where(QuestPhoto.quest_id == quest.id)
        .order_by(QuestPhoto.uploaded_at.desc(), QuestPhoto.id)
    ).all()
    return [
        _quest_photo_out(photo, quest, is_mine=photo.uploader_id == player.username)
        for photo in photos
    ]


@router.post(
    "/quests/{quest_id}/player-photos",
    status_code=status.HTTP_201_CREATED,
    response_model=QuestPhotoOut,
    responses={
        400: {"description": "Invalid image or quest not completed"},
        404: {"description": "Quest not found"},
        413: {"description": "Image too large"},
        415: {"description": "Unsupported image type"},
    },
)
async def upload_quest_photo(
    quest_id: UUID,
    request: Request,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Let a player add a photo after completing a supported quest."""
    quest = db.get(Quest, quest_id)
    if quest is None or quest.kind not in PHOTO_QUEST_KINDS:
        raise not_found("Quest")
    completion = db.scalar(select(Completion).where(
        Completion.player_id == player.username,
        Completion.quest_id == quest.id,
        Completion.status == APPROVED,
    ))
    if completion is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete this quest before adding a photo.",
        )

    declared_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if declared_type == "image/jpg":
        declared_type = "image/jpeg"
    if declared_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Use a PNG, JPEG, or WebP image.",
        )

    image = bytearray()
    async for chunk in request.stream():
        if len(image) + len(chunk) > MAX_QUEST_PHOTO_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Photos must be 8 MiB or smaller.",
            )
        image.extend(chunk)
    if not image:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose a photo to upload.",
        )

    actual_type = _media_type(image)
    if actual_type != declared_type:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="The uploaded file must be a PNG, JPEG, or WebP image.",
        )

    photo = QuestPhoto(
        id=uuid4(),
        quest_id=quest.id,
        uploader_id=player.username,
        media_type=actual_type,
        uploaded_at=utcnow(),
    )
    QUEST_PHOTO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    destination = _quest_photo_path(photo.id)
    temporary = destination.with_name(f".{uuid4().hex}.tmp")
    try:
        temporary.write_bytes(image)
        temporary.replace(destination)
        db.add(photo)
        db.commit()
    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise
    finally:
        temporary.unlink(missing_ok=True)

    return _quest_photo_out(photo, quest, is_mine=True)


@router.get("/quest-photos/{photo_id}", response_class=Response)
def get_quest_photo(
    photo_id: UUID,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    photo = db.get(QuestPhoto, photo_id)
    quest = db.get(Quest, photo.quest_id) if photo else None
    if (
        photo is None
        or quest is None
        or quest.kind not in PHOTO_QUEST_KINDS
        or (not can_view(db, player, quest) and not is_maintainer(player))
    ):
        raise _missing_photo()
    return _serve_quest_photo(photo)


@router.delete(
    "/quests/{quest_id}/player-photos/{photo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses={404: {"description": "Photo not found"}},
)
def delete_quest_photo(
    quest_id: UUID,
    photo_id: UUID,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Delete a player's own photo from a quest."""
    photo = db.get(QuestPhoto, photo_id)
    if (
        photo is None
        or photo.quest_id != quest_id
        or photo.uploader_id != player.username
    ):
        raise _missing_photo()
    db.delete(photo)
    db.commit()
    _quest_photo_path(photo_id).unlink(missing_ok=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/players/{username}/quest-photos",
    response_model=List[QuestPhotoOut],
    responses={404: {"description": "Player not found"}},
)
def list_profile_quest_photos(
    username: str,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """List a discoverable player's own photos from completed quests."""
    profile = db.get(User, username)
    if profile is None or not _profile_is_viewable(db, player, profile):
        raise not_found("Player")
    if not profile.discoverable:
        return []

    rows = db.execute(
        select(QuestPhoto, Quest)
        .join(Quest, QuestPhoto.quest_id == Quest.id)
        .join(Completion, and_(
            Completion.quest_id == Quest.id,
            Completion.player_id == profile.username,
            Completion.status == APPROVED,
        ))
        .where(
            QuestPhoto.uploader_id == profile.username,
            Quest.kind.in_(PHOTO_QUEST_KINDS),
        )
        .order_by(QuestPhoto.uploaded_at.desc(), QuestPhoto.id)
        .limit(MAX_PROFILE_QUEST_PHOTOS)
    ).all()
    return [
        _quest_photo_out(
            photo, quest, is_mine=photo.uploader_id == player.username
        )
        for photo, quest in rows
    ]


@router.get(
    "/players/{username}/quest-photos/{photo_id}/image",
    response_class=Response,
)
def get_profile_quest_photo(
    username: str,
    photo_id: UUID,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    profile = db.get(User, username)
    photo = db.get(QuestPhoto, photo_id)
    quest = db.get(Quest, photo.quest_id) if photo else None
    completed = None
    if quest is not None:
        completed = db.scalar(select(Completion.id).where(
            Completion.player_id == username,
            Completion.quest_id == quest.id,
            Completion.status == APPROVED,
        ))
    if (
        profile is None
        or not profile.discoverable
        or not _profile_is_viewable(db, player, profile)
        or photo is None
        or photo.uploader_id != username
        or quest is None
        or quest.kind not in PHOTO_QUEST_KINDS
        or completed is None
    ):
        raise _missing_photo()
    return _serve_quest_photo(photo)


@router.get("/meetup-photos/{photo_id}", response_class=Response)
def get_meetup_photo(
    photo_id: UUID,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Serve a meetup photo when its meetup or attendance is visible."""
    photo, quest = _get_meetup_photo(db, photo_id)
    if not can_view(db, player, quest) and not is_maintainer(player):
        raise _missing_photo()
    return _serve_photo(photo)


@router.get(
    "/players/{username}/meetup-photos",
    response_model=List[MeetupPhotoOut],
    responses={404: {"description": "Player not found"}},
)
def list_profile_meetup_photos(
    username: str,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """List attended meetup photos only for profiles opted into discovery."""
    profile = db.get(User, username)
    if profile is None or not _profile_is_viewable(db, player, profile):
        raise not_found("Player")
    if not profile.discoverable:
        return []

    rows = db.execute(
        select(MeetupPhoto, Quest)
        .join(Quest, MeetupPhoto.quest_id == Quest.id)
        .join(Completion, and_(
            Completion.quest_id == Quest.id,
            Completion.player_id == profile.username,
            Completion.status == APPROVED,
        ))
        .where(Quest.kind == MEETUP)
        .order_by(MeetupPhoto.uploaded_at.desc(), MeetupPhoto.id)
        .limit(MAX_PROFILE_MEETUP_PHOTOS)
    ).all()
    return [_photo_out(photo, quest) for photo, quest in rows]


@router.get(
    "/players/{username}/meetup-photos/{photo_id}/image",
    response_class=Response,
)
def get_profile_meetup_photo(
    username: str,
    photo_id: UUID,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    """Serve a meetup photo through an opted-in attendee's profile."""
    profile = db.get(User, username)
    if (
        profile is None
        or not profile.discoverable
        or not _profile_is_viewable(db, player, profile)
    ):
        raise _missing_photo()

    photo, quest = _get_meetup_photo(db, photo_id)
    attended = db.scalar(select(Completion.id).where(
        Completion.player_id == profile.username,
        Completion.quest_id == quest.id,
        Completion.status == APPROVED,
    ))
    if attended is None:
        raise _missing_photo()
    return _serve_photo(photo)


@router.get(
    "/admin/quests/{quest_id}/photos",
    response_model=List[MeetupPhotoOut],
    dependencies=[Depends(require_maintainer)],
    responses={404: {"description": "Meetup not found"}},
)
def admin_list_meetup_photos(quest_id: UUID, db: Session = Depends(get_db)):
    quest = db.get(Quest, quest_id)
    if quest is None or quest.kind != MEETUP:
        raise not_found("Meetup")
    return _photos_for_quest(db, quest)


@router.post(
    "/admin/quests/{quest_id}/photos",
    status_code=status.HTTP_201_CREATED,
    response_model=MeetupPhotoOut,
    dependencies=[Depends(require_maintainer)],
    responses={
        400: {"description": "Invalid image"},
        404: {"description": "Meetup not found"},
        413: {"description": "Image too large"},
        415: {"description": "Unsupported image type"},
    },
)
async def upload_meetup_photo(
    quest_id: UUID,
    request: Request,
    player: User = Depends(get_current_player),
    db: Session = Depends(get_db),
):
    quest = db.get(Quest, quest_id)
    if quest is None or quest.kind != MEETUP:
        raise not_found("Meetup")

    declared_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if declared_type == "image/jpg":
        declared_type = "image/jpeg"
    if declared_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Use a PNG, JPEG, or WebP image.",
        )

    image = bytearray()
    async for chunk in request.stream():
        if len(image) + len(chunk) > MAX_MEETUP_PHOTO_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Meetup photos must be 8 MiB or smaller.",
            )
        image.extend(chunk)
    if not image:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose a photo to upload.",
        )

    actual_type = _media_type(image)
    if actual_type != declared_type:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="The uploaded file must be a PNG, JPEG, or WebP image.",
        )

    photo = MeetupPhoto(
        id=uuid4(),
        quest_id=quest.id,
        uploader_id=player.username,
        media_type=actual_type,
        uploaded_at=utcnow(),
    )
    MEETUP_PHOTO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    destination = _photo_path(photo.id)
    temporary = destination.with_name(f".{uuid4().hex}.tmp")
    try:
        temporary.write_bytes(image)
        temporary.replace(destination)
        db.add(photo)
        db.commit()
    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise
    finally:
        temporary.unlink(missing_ok=True)

    return _photo_out(photo, quest)


@router.delete(
    "/admin/quests/{quest_id}/photos/{photo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_maintainer)],
    responses={404: {"description": "Photo not found"}},
)
def delete_meetup_photo(
    quest_id: UUID,
    photo_id: UUID,
    db: Session = Depends(get_db),
):
    photo = db.get(MeetupPhoto, photo_id)
    if photo is None or photo.quest_id != quest_id:
        raise _missing_photo()
    db.delete(photo)
    db.commit()
    _photo_path(photo_id).unlink(missing_ok=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
