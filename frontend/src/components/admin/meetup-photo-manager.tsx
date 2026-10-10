"use client";

import Image from "next/image";
import { buttonStyles, Card } from "@/src/components/page";
import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type MeetupPhoto = {
  id: string;
  quest_id: string;
  quest_title: string;
  uploaded_at: string;
};

async function responseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    detail?: unknown;
  } | null;
  return typeof body?.detail === "string"
    ? body.detail
    : "Could not update meetup photos. Please try again.";
}

export function MeetupPhotoManager({ questId }: { questId: string }) {
  const [photos, setPhotos] = useState<MeetupPhoto[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/admin/quests/${encodeURIComponent(questId)}/photos`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response));
        return (await response.json()) as MeetupPhoto[];
      })
      .then((data) => {
        if (!cancelled) setPhotos(data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load meetup photos.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [questId, refresh]);

  async function uploadPhotos(files: File[]) {
    if (files.length === 0) return;
    setError("");
    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type)) {
        setError("Choose PNG, JPEG, or WebP photos.");
        return;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setError("Meetup photos must be 8 MiB or smaller.");
        return;
      }
    }

    setBusy(true);
    let uploaded = false;
    try {
      for (const file of files) {
        const response = await fetch(
          `/api/admin/quests/${encodeURIComponent(questId)}/photos`,
          {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          },
        );
        if (!response.ok) throw new Error(await responseError(response));
        uploaded = true;
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not upload the photo. Please try again.",
      );
    } finally {
      if (uploaded) setRefresh((value) => value + 1);
      setBusy(false);
    }
  }

  function changePhoto(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = "";
    void uploadPhotos(files);
  }

  async function removePhoto(photoId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/quests/${encodeURIComponent(questId)}/photos/${encodeURIComponent(photoId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await responseError(response));
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not delete the photo. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Meetup photos</h2>
        <p className="mt-1 text-sm text-muted">
          Photos appear on this meetup and on the profiles of checked-in players
          who have opted in under Privacy settings. PNG, JPEG, or WebP, up to 8
          MiB each.
        </p>
      </div>
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <figure className="min-w-0" key={photo.id}>
              <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-container">
                <Image
                  alt={`Photo from ${photo.quest_title}`}
                  className="object-cover"
                  fill
                  sizes="(max-width: 640px) 45vw, 220px"
                  src={`/api/meetup-photos/${photo.id}`}
                  unoptimized
                />
                <button
                  aria-label="Delete meetup photo"
                  className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-danger shadow-card disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void removePhoto(photo.id)}
                  type="button"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              </div>
            </figure>
          ))}
        </div>
      )}
      <label
        className={`${buttonStyles.secondary} inline-flex w-fit cursor-pointer items-center gap-2 py-2`}
      >
        <ImagePlus aria-hidden className="h-4 w-4" />
        Add meetup photos
        <input
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={busy}
          multiple
          onChange={changePhoto}
          type="file"
        />
      </label>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}
