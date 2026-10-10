"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import Link from "next/link";
import { buttonStyles, Card } from "@/src/components/page";

type QuestPhoto = {
  id: string;
  quest_id: string;
  quest_title: string;
  uploaded_at: string;
  is_mine: boolean;
  uploader_username?: string | null;
  uploader_display_name?: string | null;
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

export function QuestPhotoGallery({ questId }: { questId: string }) {
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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const photos = photoResult.url === collectionUrl ? photoResult.photos : [];
  const ownPhotos = photos.filter((photo) => photo.is_mine);
  const otherPhotos = photos.filter(
    (photo) =>
      !photo.is_mine && photo.uploader_username && photo.uploader_display_name,
  );

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !cameraStreamRef.current) return;

    const video = videoRef.current;
    video.srcObject = cameraStreamRef.current;
    void video.play().catch(() => {
      setError("Could not start the camera preview. Please try again.");
    });
    return () => {
      video.srcObject = null;
    };
  }, [cameraOpen]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

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

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraOpen(false);
  }

  async function startCamera() {
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      setCameraOpen(true);
    } catch {
      if (isMountedRef.current) {
        setError(
          "Could not access the camera. Check your browser permissions and try again.",
        );
      }
    } finally {
      if (isMountedRef.current) setCameraStarting(false);
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setError("The camera is still starting. Please try again in a moment.");
      return;
    }

    const maxDimension = 2048;
    const scale = Math.min(
      1,
      maxDimension / Math.max(video.videoWidth, video.videoHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Could not prepare the photo. Please try again.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturing(true);
    stopCamera();
    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (!blob) {
          setError("Could not prepare the photo. Please try again.");
          return;
        }
        const file = new File([blob], "quest-photo.jpg", {
          type: "image/jpeg",
        });
        void upload(file);
      },
      "image/jpeg",
      0.88,
    );
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

  function renderPhotos(photoList: QuestPhoto[]) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photoList.map((photo) => (
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
              {photo.is_mine ? (
                "You"
              ) : photo.uploader_username && photo.uploader_display_name ? (
                <Link
                  className="font-semibold text-link hover:underline"
                  href={`/profile?player=${encodeURIComponent(photo.uploader_username)}`}
                >
                  {photo.uploader_display_name}
                </Link>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">Quest photos</h2>
        <p className="mt-1 text-sm text-muted">
          Add a photo before or after completing this activity. Other quest
          viewers see your uploads only if you opt in under Privacy. Photos from
          other players appear here only when they opt in too.
        </p>
      </div>

      <div className="flex flex-col items-start gap-3">
        <input
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={uploading || deletingId !== null || cameraOpen}
          onChange={(event) => {
            const selected = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (selected) void upload(selected);
          }}
          ref={inputRef}
          type="file"
        />
        <input
          accept="image/png,image/jpeg,image/webp"
          capture="environment"
          className="hidden"
          disabled={uploading || deletingId !== null}
          onChange={(event) => {
            const selected = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (selected) void upload(selected);
          }}
          ref={cameraInputRef}
          type="file"
        />
        {!cameraOpen ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={`${buttonStyles.secondary} inline-flex items-center gap-2 py-2`}
              disabled={
                uploading || deletingId !== null || cameraStarting || capturing
              }
              onClick={() => void startCamera()}
              type="button"
            >
              <Camera aria-hidden className="h-4 w-4" />
              {cameraStarting ? "Starting camera…" : "Take photo"}
            </button>
            <button
              className={`${buttonStyles.primary} py-2`}
              disabled={
                uploading || deletingId !== null || cameraStarting || capturing
              }
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              {uploading
                ? "Uploading…"
                : photos.length > 0
                  ? "Upload more photos"
                  : "Upload Photo"}
            </button>
          </div>
        ) : (
          <div className="w-full max-w-lg space-y-3">
            <video
              aria-label="Live camera preview"
              autoPlay
              className="aspect-video w-full rounded-xl bg-black object-cover"
              muted
              playsInline
              ref={videoRef}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                className={`${buttonStyles.primary} py-2`}
                disabled={capturing}
                onClick={capturePhoto}
                type="button"
              >
                {capturing ? "Preparing photo…" : "Capture photo"}
              </button>
              <button
                className={`${buttonStyles.secondary} py-2`}
                disabled={capturing}
                onClick={stopCamera}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        {message && <p className="text-sm text-muted">{message}</p>}
      </div>

      {ownPhotos.length > 0 || otherPhotos.length > 0 ? (
        <div className="flex flex-col gap-5">
          {ownPhotos.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Your photos</h3>
              {renderPhotos(ownPhotos)}
            </section>
          )}
          {otherPhotos.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Photos of others</h3>
              {renderPhotos(otherPhotos)}
            </section>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">No photos are visible here yet.</p>
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
    if (!visible) return;
    let cancelled = false;
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
