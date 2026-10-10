"use client";

import { CampusMotif } from "@/src/components/campus-motif";
import { buttonStyles, Page, PageTitle } from "@/src/components/page";
import { ErrorState, LoadingState } from "@/src/components/states";
import { ProfilePicture } from "@/src/components/profile-picture";
import { apiErrorMessage } from "@/src/lib/api-error";
import type {
  LeaderboardEntry,
  LeaderboardScope,
} from "@/src/lib/api/hackathon.schemas";
import { useGetLeaderboard } from "@/src/lib/api/players";
import { keepPreviousData } from "@tanstack/react-query";
import { Crown, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const SCOPES: { key: LeaderboardScope; label: string }[] = [
  { key: "global", label: "Global" },
  { key: "friends", label: "Friends" },
];

// Modest distinction for the top three: coloured rank markers, no podium.
const TOP_RANKS: Record<number, string> = {
  1: "bg-accent text-on-accent",
  2: "bg-rank-2 text-on-accent",
  3: "bg-rank-3 text-on-accent",
};

function EntryRow({ entry }: { entry: LeaderboardEntry }) {
  // No crown or medal colours without points (e.g. friends who all have 0).
  const top = entry.points > 0 ? TOP_RANKS[entry.rank] : undefined;
  return (
    <li
      aria-current={entry.is_current_player ? "true" : undefined}
      className={`flex items-center gap-3 px-5 py-3.5 ${
        entry.is_current_player
          ? "border-l-4 border-accent bg-accent/40 pl-4 font-semibold dark:bg-accent/10"
          : ""
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          top ?? "text-muted"
        }`}
      >
        {entry.rank === 1 && entry.points > 0 ? (
          <Crown aria-label="Rank 1" className="h-4 w-4" strokeWidth={2.5} />
        ) : (
          entry.rank
        )}
      </span>
      <div className="flex min-w-0 shrink items-center gap-2">
        {entry.username ? (
          <Link
            className="flex min-w-0 items-center gap-2 text-link hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            href={`/profile?player=${encodeURIComponent(entry.username)}`}
            title={`View ${entry.display_name}'s profile`}
          >
            <span className="min-w-0 truncate">
              {entry.display_name}
              {entry.is_current_player && (
                <span className="ml-2 rounded-md bg-accent px-1.5 py-0.5 text-xs font-semibold text-on-accent">
                  you
                </span>
              )}
            </span>
            <ProfilePicture
              displayName={entry.display_name}
              size="small"
              username={entry.username}
            />
          </Link>
        ) : (
          <>
            <span className="min-w-0 truncate">{entry.display_name}</span>
            <ProfilePicture displayName={entry.display_name} size="small" />
          </>
        )}
      </div>
      <span aria-hidden className="min-w-0 flex-1" />
      <span className="shrink-0 text-right">
        <span className="font-bold">{entry.points}</span>{" "}
        <span className="text-xs text-muted">points</span>
      </span>
    </li>
  );
}

// Global / Friends switch, styled like the admin tabs.
function ScopeTabs({
  scope,
  onChange,
}: {
  scope: LeaderboardScope;
  onChange: (scope: LeaderboardScope) => void;
}) {
  return (
    <div
      aria-label="Leaderboard view"
      className="grid grid-cols-2 gap-1 rounded-full bg-surface-container p-1"
      role="tablist"
    >
      {SCOPES.map(({ key, label }) => (
        <button
          aria-selected={scope === key}
          className={`flex items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm font-semibold ${
            scope === key
              ? "bg-surface text-link dark:bg-surface-variant"
              : "text-muted"
          }`}
          key={key}
          onClick={() => onChange(key)}
          role="tab"
          type="button"
        >
          {key === "friends" && <Users aria-hidden className="h-4 w-4" />}
          {label}
        </button>
      ))}
    </div>
  );
}

function NoFriendsYet() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant p-6 text-center">
      <CampusMotif className="h-14 w-full max-w-xs text-outline" />
      <p className="text-muted">
        You haven&apos;t added any friends yet. Add some to compare your points
        with people you know.
      </p>
      <Link
        className={`${buttonStyles.primary} flex items-center gap-2 py-2 text-sm`}
        href="/profile"
      >
        <UserPlus aria-hidden className="h-4 w-4" /> Find players
      </Link>
    </div>
  );
}

export default function LeaderboardPage() {
  const [scope, setScope] = useState<LeaderboardScope>("global");
  const { data, isLoading, isError, refetch } = useGetLeaderboard(
    { scope },
    // Keeps the current view on screen while the other one loads.
    { query: { placeholderData: keepPreviousData } },
  );
  const board = data?.status === 200 ? data.data : undefined;
  const error = isError
    ? "Could not load the leaderboard. Check your connection."
    : apiErrorMessage(data);
  const currentListed = board?.entries.some((entry) => entry.is_current_player);
  const me = board?.current_player;
  const friendsView = scope === "friends";

  return (
    <Page>
      <PageTitle eyebrow="Ranking">Leaderboard</PageTitle>
      <ScopeTabs onChange={setScope} scope={scope} />

      {isLoading ? (
        <LoadingState label="Loading leaderboard..." />
      ) : error || !board || !me ? (
        <ErrorState
          message={error ?? "Could not load the leaderboard."}
          onRetry={() => refetch()}
        />
      ) : friendsView && board.friend_count === 0 ? (
        <NoFriendsYet />
      ) : (
        <>
          <p className="rounded-2xl border border-outline-variant bg-surface p-5 text-on-surface-variant shadow-card dark:bg-surface-variant">
            {me.points > 0 ? (
              <>
                You&apos;re{" "}
                <span className="font-bold text-on-surface">#{me.rank}</span>{" "}
                {friendsView ? "among your friends" : "overall"} with{" "}
                <span className="font-bold text-on-surface">
                  {me.points} points
                </span>
                .
              </>
            ) : friendsView ? (
              <>
                You&apos;re{" "}
                <span className="font-bold text-on-surface">#{me.rank}</span>{" "}
                among your friends. Complete a quest to climb.
              </>
            ) : (
              "Complete your first quest to get on the board."
            )}
          </p>

          {board.entries.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant p-6 text-center text-muted">
              <CampusMotif className="h-14 w-full max-w-xs text-outline" />
              Nobody has points yet. Complete a quest to take first place!
            </div>
          ) : (
            <ol className="divide-y divide-outline-variant overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-card dark:bg-surface-variant">
              {board.entries.map((entry) => (
                <EntryRow
                  entry={entry}
                  key={`${entry.rank}-${entry.display_name}`}
                />
              ))}
            </ol>
          )}
          {!currentListed && board.entries.length > 0 && (
            <div>
              <p className="mb-2 text-sm text-muted">Your position</p>
              <ol className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-card dark:bg-surface-variant">
                <EntryRow entry={me} />
              </ol>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
