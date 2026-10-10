"use client";

import { JoinCodeForm } from "@/src/components/join-code-form";
import { ProfilePicture } from "@/src/components/profile-picture";
import { useGetMe } from "@/src/lib/api/players";
import { Wrench } from "lucide-react";
import Link from "next/link";

// Desktop-only panel in the top-right corner: who you are, the partner
// code form and (for maintainers) the admin link. On mobile the home page
// shows PlayerSummary and JoinWithCode instead. Errors render nothing;
// the pages show their own.
export function UserRail() {
  const { data, isLoading, isError } = useGetMe();
  const player = data?.status === 200 ? data.data : undefined;

  if (isLoading) {
    return (
      <aside className="flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface p-5 shadow-card dark:bg-surface-variant">
        <div className="h-12 animate-pulse rounded-xl bg-surface-variant dark:bg-surface-container" />
        <div className="h-16 animate-pulse rounded-xl bg-surface-variant dark:bg-surface-container" />
      </aside>
    );
  }
  if (isError || !player) return null;

  return (
    <aside
      aria-label="Your account"
      className="flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface p-5 shadow-card dark:bg-surface-variant"
    >
      <Link
        className="-m-2 flex items-center gap-3 rounded-xl p-2 transition hover:bg-surface-variant dark:hover:bg-surface-container"
        href="/profile"
      >
        <ProfilePicture
          displayName={player.display_name}
          size="medium"
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

      <div className="flex flex-col gap-2 border-t border-outline-variant pt-4">
        <p className="text-sm font-semibold text-on-surface-variant">
          Join a Quest via partner code
        </p>
        <JoinCodeForm id="join-code-rail" />
      </div>

      {player.is_maintainer && (
        <Link
          className="flex items-center gap-2 border-t border-outline-variant pt-4 text-sm font-semibold text-muted hover:text-on-surface"
          href="/admin"
        >
          <Wrench aria-hidden className="h-4 w-4" />
          Admin
        </Link>
      )}
    </aside>
  );
}
