"use client";

import { apiErrorMessage } from "@/src/lib/api-error";
import { ProfilePicture } from "@/src/components/profile-picture";
import { useGetMe } from "@/src/lib/api/players";
import { Wrench } from "lucide-react";
import Link from "next/link";

// Compact player strip: name and points, plus a small admin link for
// maintainers.
export function PlayerSummary() {
  const { data, isLoading, isError } = useGetMe();
  const player = data?.status === 200 ? data.data : undefined;
  const error = isError
    ? "Could not load your profile."
    : apiErrorMessage(data);

  if (isLoading) {
    return (
      <div className="h-14 animate-pulse rounded-2xl bg-surface-variant" />
    );
  }
  if (error || !player) {
    return (
      <p
        className="rounded-2xl border border-danger/40 p-3 text-sm text-danger"
        role="alert"
      >
        {error ?? "Could not load your profile."}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-outline-variant bg-surface px-3 py-2.5 shadow-card hover:border-outline dark:bg-surface-variant"
        href="/profile"
      >
        <ProfilePicture
          displayName={player.display_name}
          size="small"
          username={player.username}
        />
        <span className="min-w-0 flex-1 truncate font-semibold">
          {player.display_name}
        </span>
        <span className="shrink-0 text-right leading-tight">
          <span className="block rounded-md bg-accent px-2 py-0.5 text-sm font-bold text-on-accent">
            {player.total_points}
          </span>
          <span className="mt-0.5 block text-xs text-muted">points</span>
        </span>
      </Link>
      {player.is_maintainer && (
        <Link
          aria-label="Maintainer tools"
          className="flex h-[54px] w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-outline-variant text-[10px] font-semibold text-muted hover:border-outline hover:text-on-surface"
          href="/admin"
        >
          <Wrench aria-hidden className="h-4 w-4" />
          Admin
        </Link>
      )}
    </div>
  );
}
