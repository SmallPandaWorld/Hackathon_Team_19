"use client";

import { ErrorState } from "@/src/components/states";
import type { QuestOut } from "@/src/lib/api/hackathon.schemas";
import { useQuestAction } from "@/src/lib/use-quest-action";
import { ThumbsDown, ThumbsUp } from "lucide-react";

// Up/down votes on player-created quests. The author only sees the counts.
export function QuestVotes({ quest }: { quest: QuestOut }) {
  const votes = quest.votes;
  const { perform, pending, error } = useQuestAction(quest.id);
  if (!votes) return null;

  const busy = pending === "vote";
  const canVote = votes.can_vote && quest.status === "published";
  const mine = votes.mine;

  // Tapping the active vote again removes it.
  function cast(value: 1 | -1) {
    void perform({ type: "vote", value: mine === value ? 0 : value });
  }

  const base =
    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-default disabled:opacity-70";

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-label="Upvote this quest"
          aria-pressed={votes.mine === 1}
          className={`${base} ${
            votes.mine === 1
              ? "border-success bg-success/15 text-success"
              : "border-outline-variant text-on-surface-variant hover:border-success hover:text-success"
          }`}
          disabled={!canVote || busy}
          onClick={() => cast(1)}
          type="button"
        >
          <ThumbsUp aria-hidden className="h-4 w-4" />
          {votes.up}
        </button>
        <button
          aria-label="Downvote this quest"
          aria-pressed={votes.mine === -1}
          className={`${base} ${
            votes.mine === -1
              ? "border-danger bg-danger/15 text-danger"
              : "border-outline-variant text-on-surface-variant hover:border-danger hover:text-danger"
          }`}
          disabled={!canVote || busy}
          onClick={() => cast(-1)}
          type="button"
        >
          <ThumbsDown aria-hidden className="h-4 w-4" />
          {votes.down}
        </button>
        <span className="text-xs text-muted">
          {!votes.can_vote
            ? "This is your quest. Other players can vote on it."
            : votes.mine === 0
              ? "Was this quest worth it? Let others know."
              : "Tap again to remove your vote."}
        </span>
      </div>
      {error && <ErrorState message={error} />}
    </div>
  );
}
