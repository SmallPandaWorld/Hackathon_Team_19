"use client";

import { buttonStyles, Card } from "@/src/components/page";
import { ResultBanner } from "@/src/components/quest-actions/result-banner";
import { BackLink, ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import type { PairJoinResult } from "@/src/lib/api/hackathon.schemas";
import { useGetPairCode, useJoinPairSession } from "@/src/lib/api/pair";
import { useAction } from "@/src/lib/use-action";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

export function JoinView() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code).trim().toUpperCase();
  const preview = useGetPairCode(code);
  const joinSession = useJoinPairSession();
  const { error, run, refreshAll } = useAction();
  const [result, setResult] = useState<PairJoinResult | null>(null);

  const session = preview.data?.status === 200 ? preview.data.data : undefined;
  const loadError =
    preview.data?.status === 404
      ? `No quest found for code ${code}. Check the code with your partner.`
      : preview.isError
        ? "Could not check the code. Check your connection."
        : apiErrorMessage(preview.data);

  async function handleJoin() {
    const response = await run(() => joinSession.mutateAsync({ code }));
    if (response?.status === 200) {
      setResult(response.data);
      await refreshAll();
    }
  }

  if (preview.isLoading) return <LoadingState label="Checking code..." />;

  if (loadError || !session) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ErrorState message={loadError ?? "Could not check the code."} />
      </div>
    );
  }

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-center text-lg font-semibold">
          You completed “{result.session.quest_title}” with{" "}
          {result.session.host_name}!
        </p>
        <ResultBanner result={result.completion} />
      </div>
    );
  }

  const blocked = session.is_host
    ? "This is your own code. Show it to another player so they can join."
    : session.state === "expired"
      ? "This code has expired. Ask your partner to start the quest again."
      : session.state === "cancelled"
        ? "This code was cancelled."
        : session.state === "completed"
          ? "This code was already used."
          : null;

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <Card className="text-center">
        <p className="text-sm text-slate-500">Partner quest</p>
        <h1 className="mt-1 text-2xl font-bold">{session.quest_title}</h1>
        <p className="mt-3 text-slate-700">
          <span className="font-semibold">{session.host_name}</span> invited you
          to complete this quest together.
        </p>
        <p className="mt-2 font-mono text-lg tracking-[0.2em] text-indigo-700">
          {session.code}
        </p>
        {blocked ? (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            {blocked}
          </p>
        ) : (
          <button
            className={`${buttonStyles.primary} mt-4 w-full py-4 text-lg`}
            disabled={joinSession.isPending}
            onClick={handleJoin}
            type="button"
          >
            {joinSession.isPending
              ? "Joining..."
              : "Join and complete together"}
          </button>
        )}
        <Link
          className="mt-3 inline-block text-sm font-semibold text-indigo-600"
          href={`/quests/${session.quest_id}`}
        >
          Read the quest instructions
        </Link>
      </Card>
      {error && <ErrorState message={error} />}
    </div>
  );
}
