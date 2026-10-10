"use client";

import { Page, PageTitle } from "@/src/components/page";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import type { LeaderboardEntry } from "@/src/lib/api/hackathon.schemas";
import { useGetLeaderboard } from "@/src/lib/api/leaderboard";

function EntryRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${
        entry.is_current_player ? "bg-indigo-50 font-semibold" : ""
      }`}
    >
      <span className="w-8 shrink-0 text-center font-bold text-slate-500">
        {entry.rank}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {entry.display_name}
        {entry.is_current_player && (
          <span className="ml-2 text-xs text-indigo-600">(you)</span>
        )}
      </span>
      <span className="shrink-0 font-bold text-indigo-600">{entry.points}</span>
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

  return (
    <Page>
      <PageTitle eyebrow="Ranking">Leaderboard</PageTitle>

      {isLoading ? (
        <LoadingState label="Loading leaderboard..." />
      ) : error || !board ? (
        <ErrorState
          message={error ?? "Could not load the leaderboard."}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          {board.entries.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200">
              Nobody has points yet. Complete a quest to take first place!
            </p>
          ) : (
            <ol className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              {board.entries.map((entry) => (
                <EntryRow entry={entry} key={entry.player_id} />
              ))}
            </ol>
          )}
          {!currentListed && (
            <div>
              <p className="mb-2 text-sm text-slate-500">Your position</p>
              <ol className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
                <EntryRow entry={board.current_player} />
              </ol>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
