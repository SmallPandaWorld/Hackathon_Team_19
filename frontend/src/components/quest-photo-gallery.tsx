"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Link from "next/link";
import { buttonStyles, Card } from "@/src/components/page";

type QuestPhoto = {
  id: string;
  quest_id: string;
  quest_title: string;
  uploaded_at: string;
  is_mine: boolean;
};

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function errorDetail(data: unknown): string | null {
  if (typeof data === "object" && data !== null && "detail" in data) {
    const detail = data.detail;
    if (typeof detail === "string") return detail;
  }
  return null;
}

export function QuestPhotoGallery({
  questId,
  completed,
}: {
  questId: string;
  completed: boolean;
}) {
  const collectionUrl = `/api/quests/${encodeURIComponent(questId)}/player-photos`;
  const [photoResult, setPhotoResult] = useState<{
    url: string;
    photos: QuestPhoto[];
  }>({ url: collectionUrl, photos: [] });
  const [refresh, setRefresh] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const photos =
    photoResult.url === collectionUrl ? photoResult.photos : [];

  useEffect(() => {
    let cancelled = false;
    void fetch(collectionUrl)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: QuestPhoto[]) => {
        if (!cancelled) {
          setPhotoResult({
            url: collectionUrl,
            photos: Array.isArray(data) ? data : [],
          });
        }
      })
      .catch(() => {
        if (!cancelled) setPhotoResult({ url: collectionUrl, photos: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [collectionUrl, refresh]);

  async function upload(file: File) {
    setError(null);
    setMessage(null);
    if (!completed) {
      setError("Complete this quest before adding a photo.");
      return;
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      setError("Choose a PNG, JPEG, or WebP photo.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Photos must be 8 MiB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const response = await fetch(collectionUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) {
        let data: unknown;
        try {
          data = await response.json();
        } catch {
          data = null;
        }
        throw new Error(errorDetail(data) ?? "Could not upload the photo.");
      }
      setMessage("Photo added to this quest.");
      setRefresh((value) => value + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not upload the photo. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function deletePhoto(photo: QuestPhoto) {
    if (!photo.is_mine) return;
    if (
      !window.confirm(
        "Delete this photo? It will be removed from the quest gallery and your profile.",
      )
    ) {
      return;
    }

    setError(null);
    setMessage(null);
    setDeletingId(photo.id);
    try {
      const response = await fetch(
        `${collectionUrl}/${encodeURIComponent(photo.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        let data: unknown;
        try {
          data = await response.json();
        } catch {
          data = null;
        }
        throw new Error(errorDetail(data) ?? "Could not delete the photo.");
      }
      setRefresh((value) => value + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not delete the photo. Please try again.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">Quest photos</h2>
        <p className="mt-1 text-sm text-muted">
          Share a photo with players viewing this activity. Your photo appears
          on your profile only while you have opted in under Privacy.
        </p>
      </div>

      <div className="flex flex-col items-start gap-3">
        <input
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={!completed || uploading || deletingId !== null}
          onChange={(event) => {
            const selected = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (selected) void upload(selected);
          }}
          ref={inputRef}
          type="file"
        />
        {!completed && (
          <p className="text-sm text-muted">
            Complete this quest to upload a photo.
          </p>
        )}
        <button
          className={`${buttonStyles.primary} self-start py-2`}
          disabled={!completed || uploading || deletingId !== null}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {uploading
            ? "Uploading…"
            : photos.length > 0
              ? "Upload more photos"
              : "Upload Photo"}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
        {message && <p className="text-sm text-muted">{message}</p>}
      </div>

      {photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <figure className="min-w-0" key={photo.id}>
              <div className="relative">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-container">
                  <Image
                    alt={`Photo from ${photo.quest_title}`}
                    className="object-cover"
                    fill
                    sizes="(max-width: 640px) 45vw, 220px"
                    src={`/api/quest-photos/${photo.id}`}
                    unoptimized
                  />
                </div>
                {photo.is_mine && (
                  <button
                    aria-label={`Delete your photo from ${photo.quest_title}`}
                    className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-danger shadow-card transition hover:bg-danger hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-wait disabled:opacity-60"
                    disabled={deletingId !== null || uploading}
                    onClick={() => void deletePhoto(photo)}
                    title="Delete photo"
                    type="button"
                  >
                    <X aria-hidden className="h-5 w-5" />
                  </button>
                )}
              </div>
              <figcaption className="mt-1 truncate text-xs text-muted">
                {photo.quest_title}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No photos have been added yet.</p>
      )}
    </Card>
  );
}

export function ProfileQuestPhotoGallery({
  username,
  visible = true,
  editable = false,
}: {
  username: string;
  visible?: boolean;
  editable?: boolean;
}) {
  const url = `/api/players/${encodeURIComponent(username)}/quest-photos`;
  const [photoResult, setPhotoResult] = useState<{
    url: string;
    photos: QuestPhoto[];
  }>({ url, photos: [] });
  const [refresh, setRefresh] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const photos = photoResult.url === url ? photoResult.photos : [];

  useEffect(() => {
    let cancelled = false;
    if (!visible) {
      setPhotoResult({ url, photos: [] });
      return () => {
        cancelled = true;
      };
    }
    void fetch(url)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: QuestPhoto[]) => {
        if (!cancelled) {
          setPhotoResult({ url, photos: Array.isArray(data) ? data : [] });
        }
      })
      .catch(() => {
        if (!cancelled) setPhotoResult({ url, photos: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [url, visible, refresh]);

  async function deletePhoto(photo: QuestPhoto) {
    if (!photo.is_mine) return;
    if (
      !window.confirm(
        "Delete this photo? It will be removed from the quest gallery and your profile.",
      )
    ) {
      return;
    }

    setDeleteError(null);
    setDeletingId(photo.id);
    try {
      const response = await fetch(
        `/api/quests/${encodeURIComponent(photo.quest_id)}/player-photos/${encodeURIComponent(photo.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        let data: unknown;
        try {
          data = await response.json();
        } catch {
          data = null;
        }
        throw new Error(errorDetail(data) ?? "Could not delete the photo.");
      }
      setRefresh((value) => value + 1);
    } catch (reason) {
      setDeleteError(
        reason instanceof Error
          ? reason.message
          : "Could not delete the photo. Please try again.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (!visible || (photos.length === 0 && !editable)) return null;
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Quest photos</h2>
        <p className="mt-1 text-sm text-muted">
          Photos this player shared from completed activities.
        </p>
      </div>
      {deleteError && (
        <p className="text-sm text-danger" role="alert">
          {deleteError}
        </p>
      )}
      {photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <figure className="min-w-0" key={photo.id}>
              <div className="relative">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-container">
                  <Image
                    alt={`Photo from ${photo.quest_title}`}
                    className="object-cover"
                    fill
                    sizes="(max-width: 640px) 45vw, 220px"
                    src={`${url}/${photo.id}/image`}
                    unoptimized
                  />
                </div>
                {photo.is_mine && (
                  <button
                    aria-label={`Delete your photo from ${photo.quest_title}`}
                    className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-danger shadow-card transition hover:bg-danger hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-wait disabled:opacity-60"
                    disabled={deletingId !== null}
                    onClick={() => void deletePhoto(photo)}
                    title="Delete photo"
                    type="button"
                  >
                    <X aria-hidden className="h-5 w-5" />
                  </button>
                )}
              </div>
              <figcaption className="mt-1 truncate text-xs text-muted">
                {photo.quest_title}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted">
            No photos yet. Open a completed meetup, partner, or multi-step quest
            to upload one.
          </p>
          <Link
            className="text-sm font-semibold text-link hover:underline"
            href="/"
          >
            Browse quests
          </Link>
        </div>
      )}
    </Card>
  );
}
