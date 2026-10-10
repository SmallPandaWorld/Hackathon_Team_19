"use client";

import { useState } from "react";

// Shares a link with the phone's share sheet, or copies it as a fallback.
// Never sends anything on the player's behalf.
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
  label: string;
  className: string;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setFeedback("Link copied!");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFeedback(url); // show the link so it can be copied by hand
    }
    setTimeout(() => setFeedback(null), 4000);
  }

  return (
    <div className="flex flex-col gap-1">
      <button className={className} onClick={share} type="button">
        {label}
      </button>
      {feedback && (
        <p className="break-all text-center text-xs text-muted" role="status">
          {feedback}
        </p>
      )}
    </div>
  );
}
