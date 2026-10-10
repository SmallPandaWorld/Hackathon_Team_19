"use client";

import { buttonStyles, Chip } from "@/src/components/page";
import { ErrorState } from "@/src/components/states";
import type {
  CompletionResult,
  QuestOut,
} from "@/src/lib/api/hackathon.schemas";
import { formatMeetupTime, MEETUP_LABELS } from "@/src/lib/quest-display";
import { useQuestAction } from "@/src/lib/use-quest-action";
import { useState } from "react";
import { CodeAction, type CodeCopy } from "./code-action";
import { CompletedNote, ResultBanner } from "./result-banner";

const CLOSED_MESSAGES = {
  upcoming: "Check-in opens 15 minutes before the start.",
  past: "This meetup is over.",
  cancelled: "This meetup was cancelled.",
} as const;

// QR meetups: the organiser shows the printed sign, players scan it to check in.
const MEETUP_CODE_COPY: CodeCopy = {
  label: "Code from the organiser’s sign",
  placeholder: "Enter the code shown at the meetup",
  button: "Check in",
  hint: "Scan the organiser’s QR code with your phone camera, or type its code. Each player earns the points once.",
};

export function MeetupAction({ quest }: { quest: QuestOut }) {
  const { perform, pending, error } = useQuestAction(quest.id);
  const [result, setResult] = useState<CompletionResult | null>(null);
  const state = quest.meetup_state ?? "upcoming";
  const rsvpOpen = state === "upcoming" || state === "live";

  async function handleCheckIn() {
    const response = await perform({ type: "complete" });
    if (response?.completion) setResult(response.completion);
  }

  async function toggleRsvp() {
    await perform({ type: "rsvp", attending: !quest.rsvp });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-card dark:bg-surface-variant">
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
            disabled={pending === "rsvp"}
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
        quest.requires_code ? (
          <CodeAction copy={MEETUP_CODE_COPY} quest={quest} />
        ) : (
          <button
            className={`${buttonStyles.primary} w-full py-4 text-lg`}
            disabled={pending === "complete"}
            onClick={handleCheckIn}
            type="button"
          >
            {pending === "complete" ? "Checking in..." : "I'm here: check in"}
          </button>
        )
      ) : (
        <p className="rounded-2xl bg-surface-variant p-4 text-center text-sm text-muted">
          {CLOSED_MESSAGES[state]}
          {quest.requires_code && state === "upcoming" && (
            <span className="mt-1 block">
              Then scan the organiser’s QR code to check in.
            </span>
          )}
        </p>
      )}
      {error && <ErrorState message={error} />}
    </div>
  );
}
