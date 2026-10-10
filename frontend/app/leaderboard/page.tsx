"use client";

import { CampusMotif } from "@/src/components/campus-motif";
import { Page, PageTitle } from "@/src/components/page";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import type { LeaderboardEntry } from "@/src/lib/api/hackathon.schemas";
import { useGetLeaderboard } from "@/src/lib/api/leaderboard";
import { Crown } from "lucide-react";

// Modest distinction for the top three: coloured rank markers, no podium.
const TOP_RANKS: Record<number, string> = {
  1: "bg-primary text-on-primary",
  2: "bg-[#d4d7dd] text-[#181c22]",
  3: "bg-[#e3b07c] text-[#181c22]",
};

function EntryRow({ entry }: { entry: LeaderboardEntry }) {
  const top = TOP_RANKS[entry.rank];
  return (
    <li
      aria-current={entry.is_current_player ? "true" : undefined}
      className={`flex items-center gap-3 px-4 py-3 ${
        entry.is_current_player
          ? "border-l-4 border-primary bg-primary/15 pl-3 font-semibold"
          : ""
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          top ?? "text-muted"
        }`}
      >
        {entry.rank === 1 ? (
          <Crown aria-label="Rank 1" className="h-4 w-4" strokeWidth={2.5} />
        ) : (
          entry.rank
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {entry.display_name}
        {entry.is_current_player && (
          <span className="ml-2 text-xs font-semibold text-muted">you</span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="font-bold">{entry.points}</span>{" "}
        <span className="text-xs text-muted">points</span>
      </span>
    </li>
  );
}

export default function LeaderboardPage() {
  const { data, isLoading, isError, refetch } = useGetLeaderboard();
  const board = data?.status === 200 ? data.data : undefined;
  const error = isError
    ? "Could not load the leaderboard. Check your connection."
    : apiErrorMessage(data);
  const currentListed = board?.entries.some((entry) => entry.is_current_player);
  const me = board?.current_player;

  return (
    <Page>
      <PageTitle eyebrow="Ranking">Leaderboard</PageTitle>

      {isLoading ? (
        <LoadingState label="Loading leaderboard..." />
      ) : error || !board || !me ? (
        <ErrorState
          message={error ?? "Could not load the leaderboard."}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <p className="rounded-lg border border-outline-variant p-4 text-on-surface-variant">
            {me.points > 0 ? (
              <>
                You&apos;re{" "}
                <span className="font-bold text-on-surface">#{me.rank}</span>{" "}
                with{" "}
                <span className="font-bold text-on-surface">
                  {me.points} points
                </span>
                .
              </>
            ) : (
              "Complete your first quest to get on the board."
            )}
          </p>

          {board.entries.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-outline-variant p-6 text-center text-muted">
              <CampusMotif className="h-14 w-full max-w-xs text-outline" />
              Nobody has points yet. Complete a quest to take first place!
            </div>
          ) : (
            <ol className="divide-y divide-outline-variant overflow-hidden rounded-lg border border-outline-variant bg-surface dark:bg-surface-variant">
              {board.entries.map((entry) => (
                <EntryRow entry={entry} key={entry.player_id} />
              ))}
            </ol>
          )}
          {!currentListed && board.entries.length > 0 && (
            <div>
              <p className="mb-2 text-sm text-muted">Your position</p>
              <ol className="overflow-hidden rounded-lg border border-outline-variant bg-surface dark:bg-surface-variant">
                <EntryRow entry={me} />
              </ol>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
