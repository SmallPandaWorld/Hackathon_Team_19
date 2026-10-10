"use client";

import { buttonStyles, inputStyles } from "@/src/components/page";
import { ErrorState } from "@/src/components/states";
import type {
  CompletionResult,
  QuestOut,
} from "@/src/lib/api/hackathon.schemas";
import { useCompleteQuest } from "@/src/lib/api/quests";
import { useAction } from "@/src/lib/use-action";
import { useState } from "react";
import { CompletedNote, ResultBanner } from "./result-banner";

// Solo quests: self-reported, or reviewed by a maintainer if requires_approval.
export function SoloAction({ quest }: { quest: QuestOut }) {
  const completeQuest = useCompleteQuest();
  const { error, run, refreshAll } = useAction();
  const [result, setResult] = useState<CompletionResult | null>(null);
  const [note, setNote] = useState("");

  async function handleComplete() {
    const response = await run(() =>
      completeQuest.mutateAsync({
        questId: quest.id,
        data: quest.requires_approval ? { note: note.trim() || null } : null,
      }),
    );
    if (response?.status === 200) {
      setResult(response.data);
      await refreshAll();
    }
  }

  if (result) return <ResultBanner result={result} />;
  if (quest.completed)
    return <CompletedNote completedAt={quest.completed_at} />;
  if (quest.completion_status === "pending") {
    return (
      <div className="rounded-lg bg-warning-surface p-5 text-warning ring-1 ring-warning/40">
        <p className="font-semibold">
          ⏳ Waiting for a maintainer to review your completion.
        </p>
        <p className="mt-1 text-sm">
          You get the points once it&apos;s approved.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {quest.completion_status === "rejected" && (
        <div className="rounded-lg bg-danger-surface p-4 text-sm text-danger ring-1 ring-danger/40">
          <p className="font-semibold">
            Your last submission was not accepted.
          </p>
          {quest.review_note && (
            <p className="mt-1">Reviewer: “{quest.review_note}”</p>
          )}
          <p className="mt-1">You can try again below.</p>
        </div>
      )}
      {quest.requires_approval && (
        <label
          className="text-sm font-medium text-on-surface-variant"
          htmlFor="completion-note"
        >
          What did you do?{" "}
          <span className="font-normal text-muted">
            (shown to the reviewer)
          </span>
          <textarea
            className={inputStyles}
            id="completion-note"
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. I met Lea from D-ARCH at the Polyterrasse"
            rows={3}
            value={note}
          />
        </label>
      )}
      <button
        className={`${buttonStyles.primary} w-full py-4 text-lg`}
        disabled={completeQuest.isPending}
        onClick={handleComplete}
        type="button"
      >
        {completeQuest.isPending
          ? "Saving..."
          : quest.requires_approval
            ? "Submit for review"
            : "I completed this"}
      </button>
      <p className="text-center text-xs text-muted">
        {quest.requires_approval
          ? "A maintainer checks this quest before you get the points."
          : "Only tap after you have done the activity. Points are awarded once per quest."}
      </p>
      {error && <ErrorState message={error} />}
    </div>
  );
}
