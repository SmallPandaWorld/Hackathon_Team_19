"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { buttonStyles, Card, inputStyles } from "@/src/components/page";

type QuestPhoto = {
  id: string;
  quest_id: string;
  quest_title: string;
  uploaded_at: string;
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
  const [file, setFile] = useState<File | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [uploading, setUploading] = useState(false);
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

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!completed) {
      setError("Complete this quest before adding a photo.");
      return;
    }
    if (!file) {
      setError("Choose a photo to upload.");
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
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
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

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">Quest photos</h2>
        <p className="mt-1 text-sm text-muted">
          Share a photo with players viewing this activity. Your photo appears
          on your profile only while you have opted in under Privacy.
        </p>
      </div>

      <form className="flex flex-col gap-3" onSubmit={upload}>
        <label className="text-sm font-medium text-on-surface-variant">
          Add a photo
          <input
            accept="image/png,image/jpeg,image/webp"
            className={inputStyles}
            disabled={!completed || uploading}
            onChange={(event) => {
              setError(null);
              setMessage(null);
              setFile(event.target.files?.[0] ?? null);
            }}
            ref={inputRef}
            type="file"
          />
        </label>
        {!completed && (
          <p className="text-sm text-muted">
            Complete this quest to upload a photo.
          </p>
        )}
        <button
          className={`${buttonStyles.primary} self-start py-2`}
          disabled={!completed || !file || uploading}
          type="submit"
        >
          {uploading ? "Uploading…" : "Upload photo"}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
        {message && <p className="text-sm text-muted">{message}</p>}
      </form>

      {photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <figure className="min-w-0" key={photo.id}>
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
}: {
  username: string;
  visible?: boolean;
}) {
  const url = `/api/players/${encodeURIComponent(username)}/quest-photos`;
  const [photoResult, setPhotoResult] = useState<{
    url: string;
    photos: QuestPhoto[];
  }>({ url, photos: [] });
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
  }, [url, visible]);

  if (!visible || photos.length === 0) return null;
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Quest photos</h2>
        <p className="mt-1 text-sm text-muted">
          Photos this player shared from completed activities.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo) => (
          <figure className="min-w-0" key={photo.id}>
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
            <figcaption className="mt-1 truncate text-xs text-muted">
              {photo.quest_title}
            </figcaption>
          </figure>
        ))}
      </div>
    </Card>
  );
}
