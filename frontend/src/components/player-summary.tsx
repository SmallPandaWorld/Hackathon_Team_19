"use client";

import { apiErrorMessage } from "@/src/lib/api-error";
import { useGetMe } from "@/src/lib/api/players";
import Link from "next/link";

export function PlayerSummary() {
  const { data, isLoading, isError } = useGetMe();
  const player = data?.status === 200 ? data.data : undefined;
  const error = isError
    ? "Could not load your profile."
    : apiErrorMessage(data);

  if (isLoading) {
    return <div className="h-16 animate-pulse rounded-lg bg-surface-variant" />;
  }
  if (error || !player) {
    return (
      <p
        className="rounded-lg bg-surface dark:bg-surface-variant p-4 text-sm text-danger ring-1 ring-outline-variant"
        role="alert"
      >
        {error ?? "Could not load your profile."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Link
        className="flex items-center justify-between gap-4 rounded-lg bg-surface dark:bg-surface-variant p-4 ring-1 ring-outline-variant hover:ring-outline"
        href="/profile"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-on-primary">
            {player.display_name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted">Playing as</p>
            <p className="truncate font-semibold">{player.display_name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-link">{player.total_points}</p>
          <p className="text-xs text-muted">points</p>
        </div>
      </Link>
      {player.is_maintainer && (
        <Link
          className="rounded-lg bg-warning-surface px-4 py-3 text-sm font-semibold text-warning ring-1 ring-warning/40 hover:bg-warning-surface"
          href="/admin"
        >
          🛠️ Maintainer tools: quests, reviews and reports →
        </Link>
      )}
    </div>
  );
}
