"use client";

import { apiErrorMessage } from "@/src/lib/api-error";
import { ProfilePicture } from "@/src/components/profile-picture";
import { useGetMe } from "@/src/lib/api/players";
import Link from "next/link";

// Compact mobile account controls above the home logo.
export function PlayerSummary() {
  const { data, isLoading, isError } = useGetMe();
  const player = data?.status === 200 ? data.data : undefined;
  const error = isError
    ? "Could not load your profile."
    : apiErrorMessage(data);

  if (isLoading) {
    return (
      <div className="flex h-10 items-center justify-end gap-2" aria-hidden>
        <span className="h-7 w-9 animate-pulse rounded-md bg-accent/50" />
        <span className="h-10 w-10 animate-pulse rounded-full bg-surface-variant" />
      </div>
    );
  }
  if (error || !player) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        aria-label={`Your profile, ${player.total_points} points`}
        className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        href="/profile"
      >
        <span className="rounded-md bg-accent px-2 py-0.5 text-sm font-bold text-on-accent">
          {player.total_points}
        </span>
      </Link>
      <ProfilePicture
        displayName={player.display_name}
        size="medium"
        username={player.username}
      />
    </div>
  );
}
