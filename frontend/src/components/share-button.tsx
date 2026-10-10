"use client";

import type { ReactNode } from "react";
import { useState } from "react";

// Shares a link with the phone's share sheet, or copies it as a fallback.
// Every outcome gets visible feedback. Never sends anything on the player's
// behalf.
export function ShareButton({
  path,
  title,
  text,
  label,
  className,
}: {
  path: string;
  title: string;
  text: string;
  label: ReactNode;
  className: string;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);

  function show(message: string, keep = false) {
    setFeedback(message);
    if (!keep) setTimeout(() => setFeedback(null), 4000);
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      show("Link copied! Paste it in a chat to invite someone.");
    } catch {
      show(`Copy this link: ${url}`, true); // clipboard blocked
    }
  }

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        show("Thanks for sharing!");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        // Share sheet unavailable here: fall back to copying.
      }
    }
    await copy(url);
  }

  return (
    <div className="flex flex-col gap-1">
      <button className={className} onClick={share} type="button">
        {label}
      </button>
      {feedback && (
        <p className="break-all text-center text-sm text-success" role="status">
          {feedback}
        </p>
      )}
    </div>
  );
}
