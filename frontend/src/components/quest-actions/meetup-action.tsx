"use client";

import { buttonStyles, Chip } from "@/src/components/page";
import { ErrorState } from "@/src/components/states";
import type {
  CompletionResult,
  QuestOut,
} from "@/src/lib/api/hackathon.schemas";
import {
  useCompleteQuest,
  useJoinMeetup,
  useLeaveMeetup,
} from "@/src/lib/api/quests";
import { formatMeetupTime, MEETUP_LABELS } from "@/src/lib/quest-display";
import { useAction } from "@/src/lib/use-action";
import { useState } from "react";
import { CompletedNote, ResultBanner } from "./result-banner";

const CLOSED_MESSAGES = {
  upcoming: "Check-in opens 15 minutes before the start.",
  past: "This meetup is over.",
  cancelled: "This meetup was cancelled.",
} as const;

export function MeetupAction({ quest }: { quest: QuestOut }) {
  const checkIn = useCompleteQuest();
  const joinMeetup = useJoinMeetup();
  const leaveMeetup = useLeaveMeetup();
  const { error, run, refreshAll } = useAction();
  const [result, setResult] = useState<CompletionResult | null>(null);
  const state = quest.meetup_state ?? "upcoming";
  const rsvpOpen = state === "upcoming" || state === "live";

  async function handleCheckIn() {
    const response = await run(() =>
      checkIn.mutateAsync({ questId: quest.id, data: null }),
    );
    if (response?.status === 200) {
      setResult(response.data);
      await refreshAll();
    }
  }

  async function toggleRsvp() {
    const call = quest.rsvp
      ? () => leaveMeetup.mutateAsync({ questId: quest.id })
      : () => joinMeetup.mutateAsync({ questId: quest.id });
    if (await run(call)) await refreshAll();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-surface dark:bg-surface-variant p-5 ring-1 ring-outline-variant">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">When</h2>
          <Chip className={MEETUP_LABELS[state].className}>
            {MEETUP_LABELS[state].label}
          </Chip>
        </div>
        {quest.starts_at && quest.ends_at && (
          <p
            className={`mt-2 text-lg font-semibold ${state === "cancelled" ? "line-through text-muted" : ""}`}
          >
            {formatMeetupTime(quest.starts_at, quest.ends_at)}
          </p>
        )}
        <p className="mt-2 text-sm text-muted">
          {quest.rsvp_count ?? 0}{" "}
          {quest.rsvp_count === 1 ? "player is" : "players are"} coming
          {quest.rsvp ? ", including you." : "."}
        </p>
        {rsvpOpen && !quest.completed && (
          <button
            className={`${quest.rsvp ? buttonStyles.secondary : buttonStyles.primary} mt-3 w-full py-2`}
            disabled={joinMeetup.isPending || leaveMeetup.isPending}
            onClick={toggleRsvp}
            type="button"
          >
            {quest.rsvp ? "I can't come anymore" : "I'm coming"}
          </button>
        )}
      </div>

      {result ? (
        <ResultBanner result={result} />
      ) : quest.completed ? (
        <CompletedNote completedAt={quest.completed_at} />
      ) : state === "live" ? (
        <button
          className={`${buttonStyles.primary} w-full py-4 text-lg`}
          disabled={checkIn.isPending}
          onClick={handleCheckIn}
          type="button"
        >
          {checkIn.isPending ? "Checking in..." : "I'm here: check in"}
        </button>
      ) : (
        <p className="rounded-lg bg-surface-variant p-4 text-center text-sm text-muted">
          {CLOSED_MESSAGES[state]}
        </p>
      )}
      {error && <ErrorState message={error} />}
    </div>
  );
}
