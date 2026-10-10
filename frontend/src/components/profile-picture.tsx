"use client";

import Image from "next/image";
import { Camera, ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

const MAX_PICTURE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type ProfilePictureProps = {
  username?: string;
  displayName: string;
  editable?: boolean;
  size?: "small" | "medium" | "large";
};

async function responseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    detail?: unknown;
  } | null;
  return typeof body?.detail === "string"
    ? body.detail
    : "Could not update the profile picture. Please try again.";
}

export function ProfilePicture({
  username,
  displayName,
  editable = false,
  size = "large",
}: ProfilePictureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const [pictureVersion, setPictureVersion] = useState(0);
  const [pictureState, setPictureState] = useState<
    "loading" | "loaded" | "missing"
  >(username ? "loading" : "missing");
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const firstLetter = displayName.trim().charAt(0).toLocaleUpperCase() || "?";
  const dimensions =
    size === "small"
      ? "h-9 w-9"
      : size === "medium"
        ? "h-10 w-10"
        : "h-20 w-20";
  const letterSize =
    size === "small" ? "text-base" : size === "medium" ? "text-xl" : "text-3xl";

  useEffect(() => {
    setPictureState(username ? "loading" : "missing");
  }, [username]);

  async function uploadPicture(file: File | undefined) {
    if (!file) return;

    setError("");
    setMessage("");
    if (!ALLOWED_TYPES.has(file.type)) {
      setError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_PICTURE_BYTES) {
      setError("Profile pictures must be 2 MiB or smaller.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/me/avatar", {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error(await responseError(response));

      setPictureState("loading");
      setPictureVersion((version) => version + 1);
      setMessage("Profile picture updated.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update the profile picture. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function changePicture(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    void uploadPicture(file);
  }

  useEffect(() => {
    if (!cameraOpen) return;

    let cancelled = false;
    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is unavailable in this browser.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "user" } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStream.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (cause) {
        if (cancelled) return;
        if (cause instanceof DOMException && cause.name === "NotFoundError") {
          setCameraError("No camera was found on this device.");
        } else if (
          cause instanceof DOMException &&
          cause.name === "NotAllowedError"
        ) {
          setCameraError(
            "Allow camera access in your browser to take a photo.",
          );
        } else {
          setCameraError(
            "Could not open the camera. You can choose an image instead.",
          );
        }
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      cameraStream.current?.getTracks().forEach((track) => track.stop());
      cameraStream.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [cameraOpen]);

  function openCamera() {
    setCameraError("");
    setCameraReady(false);
    setCameraOpen(true);
  }

  function closeCamera() {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    setCameraReady(false);
    setCameraOpen(false);
  }

  async function takePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("Wait for the camera preview before taking a photo.");
      return;
    }

    setBusy(true);
    try {
      const scale = Math.min(
        1,
        1024 / Math.max(video.videoWidth, video.videoHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) {
        setCameraError("Could not capture the photo. Please try again.");
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.85),
      );
      if (!blob) {
        setCameraError("Could not capture the photo. Please try again.");
        return;
      }

      closeCamera();
      await uploadPicture(
        new File([blob], "profile-picture.jpg", { type: "image/jpeg" }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function removePicture() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/me/avatar", { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      setPictureState("missing");
      setPictureVersion((version) => version + 1);
      setMessage("Profile picture removed.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not remove the profile picture. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div
        className={`relative ${dimensions} overflow-hidden rounded-full bg-primary text-on-primary shadow-card`}
      >
        <span
          aria-hidden={pictureState !== "missing"}
          aria-label={
            pictureState === "missing"
              ? `${displayName}'s profile picture`
              : undefined
          }
          className={`flex h-full w-full items-center justify-center ${letterSize} font-semibold`}
          role={pictureState === "missing" ? "img" : undefined}
        >
          {firstLetter}
        </span>
        {username && pictureState !== "missing" && (
          <Image
            alt={`${displayName}'s profile picture`}
            className="object-cover"
            fill
            key={username}
            onError={() => setPictureState("missing")}
            onLoad={() => setPictureState("loaded")}
            sizes={
              size === "small" ? "36px" : size === "medium" ? "40px" : "80px"
            }
            src={`/api/players/${encodeURIComponent(username)}/avatar?v=${pictureVersion}`}
            unoptimized
          />
        )}
        {editable && pictureState === "loaded" && (
          <button
            aria-label="Remove profile picture"
            className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-surface-variant text-on-surface shadow-card hover:bg-surface-container disabled:opacity-60 dark:border-surface-variant"
            disabled={busy}
            onClick={removePicture}
            type="button"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        )}
      </div>
      {editable && (
        <div className="flex items-center justify-end gap-1.5">
          <button
            className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-variant px-2 py-1 text-xs font-semibold text-on-surface hover:bg-surface-container focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            disabled={busy}
            onClick={openCamera}
            type="button"
          >
            <Camera aria-hidden className="h-3.5 w-3.5" />
            Take photo
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-outline-variant bg-surface-variant px-2 py-1 text-xs font-semibold text-on-surface hover:bg-surface-container focus-within:ring-2 focus-within:ring-primary">
            <ImagePlus aria-hidden className="h-3.5 w-3.5" />
            Choose
            <input
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={changePicture}
              type="file"
            />
          </label>
        </div>
      )}
      {editable && cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <section
            aria-labelledby="profile-camera-title"
            aria-modal="true"
            className="w-full max-w-lg rounded-2xl border border-outline-variant bg-surface p-4 text-on-surface shadow-card"
            role="dialog"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold" id="profile-camera-title">
                Take a profile picture
              </h2>
              <button
                aria-label="Close camera"
                className="rounded-full p-2 text-muted hover:bg-surface-variant hover:text-on-surface focus-visible:ring-2 focus-visible:ring-primary"
                onClick={closeCamera}
                type="button"
              >
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>
            <video
              autoPlay
              className="mt-3 aspect-[3/4] max-h-[55vh] w-full rounded-xl bg-black object-cover"
              muted
              onCanPlay={() => setCameraReady(true)}
              playsInline
              ref={videoRef}
            />
            {cameraError && (
              <p className="mt-3 text-sm text-danger" role="alert">
                {cameraError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-full border border-outline px-4 py-2 text-sm font-semibold hover:bg-surface-variant focus-visible:ring-2 focus-visible:ring-primary"
                disabled={busy}
                onClick={closeCamera}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                disabled={!cameraReady || busy}
                onClick={takePhoto}
                type="button"
              >
                <Camera aria-hidden className="h-4 w-4" />
                Take photo
              </button>
            </div>
          </section>
        </div>
      )}
      {editable && message && (
        <span
          aria-live="polite"
          className="max-w-40 text-right text-xs text-muted"
          role="status"
        >
          {message}
        </span>
      )}
      {editable && error && (
        <span className="max-w-40 text-right text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
