"use client";

import { JoinCodeForm } from "@/src/components/join-code-form";
import { buttonStyles } from "@/src/components/page";
import { ShareButton } from "@/src/components/share-button";
import { ErrorState } from "@/src/components/states";
import type { PairSessionOut, QuestOut } from "@/src/lib/api/hackathon.schemas";
import { useQuestAction } from "@/src/lib/use-quest-action";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { CompletedNote } from "./result-banner";
import { Camera, Send } from "lucide-react";
import Link from "next/link";

function useSecondsLeft(expiresAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000))
    : 0;
}

function WaitingForPartner({
  session,
  onCancel,
  cancelling,
}: {
  session: PairSessionOut;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const secondsLeft = useSecondsLeft(session.expires_at);
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-outline bg-surface p-6 text-center shadow-card dark:bg-surface-variant">
      {session.invited_name && (
        <p className="rounded-xl bg-accent/50 px-3 py-2 text-sm dark:bg-accent/10">
          Invitation sent to{" "}
          <span className="font-semibold">{session.invited_name}</span>. It
          shows up in their app, or show them this code.
        </p>
      )}
      <p className="text-sm text-muted">Show this code to your partner:</p>
      <p
        className="font-mono text-5xl font-bold tracking-[0.2em] text-link"
        aria-label={`Code ${session.code.split("").join(" ")}`}
      >
        {session.code}
      </p>
      <p className="text-sm text-muted" role="timer">
        {secondsLeft > 0 ? `Valid for ${minutes}:${seconds}` : "Expired"}
      </p>
      <p className="animate-pulse text-sm font-semibold text-link">
        Waiting for your partner to join…
      </p>
      <ShareButton
        className={`${buttonStyles.secondary} w-full py-2`}
        label={
          <span className="flex items-center justify-center gap-2">
            <Send aria-hidden className="h-4 w-4" /> Send join link instead
          </span>
        }
        path={`/join/${session.code}`}
        text={`Join my quest “${session.quest_title}” on Campus Voyager`}
        title="Campus Voyager"
      />
      <button
        className="text-sm font-semibold text-muted hover:text-danger"
        disabled={cancelling}
        onClick={onCancel}
        type="button"
      >
        Cancel code
      </button>
    </div>
  );
}

export function PairAction({ quest }: { quest: QuestOut }) {
  // The quest detail polls the quest while the host waits (see QuestDetail).
  const { perform, pending, error } = useQuestAction(quest.id);
  const queryClient = useQueryClient();
  const session = quest.pair_session ?? null;
  const state = session?.state;

  // When the partner joins, points and progress changed: refresh everything once.
  const previousState = useRef(state);
  const [partnerJustJoined, setPartnerJustJoined] = useState(false);
  useEffect(() => {
    if (previousState.current === "waiting" && state === "completed") {
      setPartnerJustJoined(true);
      queryClient.invalidateQueries();
    }
    previousState.current = state;
  }, [state, queryClient]);

  async function handleStart() {
    await perform({ type: "pair_start" });
  }

  async function handleCancel() {
    await perform({ type: "pair_cancel" });
  }

  const hosting = state === "waiting" && session?.is_host;

  if (quest.completed && !hosting) {
    return (
      <div className="flex flex-col gap-3">
        {partnerJustJoined && session?.is_host && (
          <p
            className="rounded-2xl bg-success-surface p-4 text-lg font-bold text-success border border-success/30"
            role="status"
          >
            {session.partner_name} joined! Quest completed together.
          </p>
        )}
        <CompletedNote completedAt={quest.completed_at} />
        <Link
          className={`${buttonStyles.primary} inline-flex items-center justify-center gap-2 py-2`}
          href={`/quests/${quest.id}#quest-photos`}
        >
          <Camera aria-hidden className="h-4 w-4" /> Add a photo
        </Link>
        {session?.state === "completed" && (
          <p className="text-center text-sm text-muted">
            Completed together with{" "}
            {session.is_host ? session.partner_name : session.host_name}.
          </p>
        )}
        <button
          className={`${buttonStyles.secondary} py-2 text-sm`}
          disabled={pending === "pair_start"}
          onClick={handleStart}
          type="button"
        >
          Play again to help someone else (they earn the points)
        </button>
        {error && <ErrorState message={error} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {hosting && session ? (
        <WaitingForPartner
          cancelling={pending === "pair_cancel"}
          onCancel={handleCancel}
          session={session}
        />
      ) : (
        <div className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-card dark:bg-surface-variant">
          <h2 className="font-semibold">Start together</h2>
          <p className="mt-1 text-sm text-muted">
            One of you starts the quest and shows the code; the other enters it.
            You both get the points.
          </p>
          {state === "expired" && (
            <p className="mt-2 text-sm text-warning">Your last code expired.</p>
          )}
          <button
            className={`${buttonStyles.primary} mt-3 w-full py-3`}
            disabled={pending === "pair_start"}
            onClick={handleStart}
            type="button"
          >
            {pending === "pair_start"
              ? "Starting..."
              : "Get a code for my partner"}
          </button>
          <div className="my-4 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-outline-variant" />
            or enter your partner&apos;s code
            <span className="h-px flex-1 bg-outline-variant" />
          </div>
          <JoinCodeForm />
        </div>
      )}
      {error && <ErrorState message={error} />}
    </div>
  );
}
