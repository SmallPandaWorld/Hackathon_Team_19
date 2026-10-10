"use client";

import { apiErrorMessage } from "@/src/lib/api-error";
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
    return <div className="h-14 animate-pulse rounded-lg bg-surface-variant" />;
  }
  if (error || !player) {
    return (
      <p
        className="rounded-lg border border-danger/40 p-3 text-sm text-danger"
        role="alert"
      >
        {error ?? "Could not load your profile."}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-outline-variant bg-surface px-3 py-2 hover:border-outline dark:bg-surface-variant"
        href="/profile"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-on-primary">
          {player.display_name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold">
          {player.display_name}
        </span>
        <span className="shrink-0 text-right leading-tight">
          <span className="block text-lg font-bold">{player.total_points}</span>
          <span className="block text-xs text-muted">points</span>
        </span>
      </Link>
      {player.is_maintainer && (
        <Link
          aria-label="Maintainer tools"
          className="flex h-[54px] w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-outline-variant text-[10px] font-semibold text-muted hover:border-outline hover:text-on-surface"
          href="/admin"
        >
          <Wrench aria-hidden className="h-4 w-4" />
          Admin
        </Link>
      )}
    </div>
  );
}
