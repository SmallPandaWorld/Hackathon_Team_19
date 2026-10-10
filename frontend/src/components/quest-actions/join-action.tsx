"use client";

import { buttonStyles } from "@/src/components/page";
import { ErrorState } from "@/src/components/states";
import type { QuestOut } from "@/src/lib/api/hackathon.schemas";
import { useQuestAction } from "@/src/lib/use-quest-action";

// Shown instead of a quest's own controls until the player joins it.
export function JoinAction({ quest }: { quest: QuestOut }) {
  const { perform, pending, error } = useQuestAction(quest.id);
  const others = quest.participant_count ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <button
        className={`${buttonStyles.primary} w-full py-4 text-lg`}
        disabled={pending !== null}
        onClick={() => perform({ type: "join" })}
        type="button"
      >
        {pending === "join" ? "Joining..." : "Join this quest"}
      </button>
      <p className="text-center text-xs text-muted">
        {others > 0 &&
          `${others} ${others === 1 ? "player is" : "players are"} doing this quest right now. `}
        Join first, then do the activity and confirm it here.
      </p>
      {error && <ErrorState message={error} />}
    </div>
  );
}
