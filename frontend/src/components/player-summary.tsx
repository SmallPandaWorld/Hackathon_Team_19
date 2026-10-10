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
    return <div className="h-16 animate-pulse rounded-2xl bg-white/60" />;
  }
  if (error || !player) {
    return (
      <p
        className="rounded-2xl bg-white p-4 text-sm text-red-600 ring-1 ring-slate-200"
        role="alert"
      >
        {error ?? "Could not load your profile."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Link
        className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-indigo-300"
        href="/profile"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700">
            {player.display_name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Playing as</p>
            <p className="truncate font-semibold">{player.display_name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-indigo-600">
            {player.total_points}
          </p>
          <p className="text-xs text-slate-500">points</p>
        </div>
      </Link>
      {player.is_maintainer && (
        <Link
          className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
          href="/admin"
        >
          🛠️ Maintainer tools: quests, reviews and reports →
        </Link>
      )}
    </div>
  );
}
