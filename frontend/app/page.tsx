"use client";

import { JoinCodeForm } from "@/src/components/join-code-form";
import { Card, Page, PageTitle, buttonStyles } from "@/src/components/page";
import { PlayerSummary } from "@/src/components/player-summary";
import { QuestCard } from "@/src/components/quest-card";
import { ShareButton } from "@/src/components/share-button";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import { useListQuests } from "@/src/lib/api/quests";
import Link from "next/link";

const STEPS = [
  "Pick a quest below and read the instructions.",
  "Go out on campus and do the activity, some with a partner or a group.",
  "Confirm it in the app to collect your points and badges.",
];

export default function Home() {
  const { data, isLoading, isError, refetch } = useListQuests();
  const quests = data?.status === 200 ? data.data : undefined;
  const error = isError
    ? "Could not load quests. Check your connection."
    : apiErrorMessage(data);
  const openCount = quests?.filter((quest) => !quest.completed).length ?? 0;

  return (
    <Page>
      <PageTitle eyebrow="VISCON 2026">Campus Voyager</PageTitle>

      <PlayerSummary />

      <Card>
        <h2 className="font-semibold">How it works</h2>
        <ol className="mt-3 space-y-2 text-sm text-muted">
          {STEPS.map((step, index) => (
            <li className="flex gap-3" key={step}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <h2 className="font-semibold">Got a code from another player?</h2>
        <p className="mb-3 mt-1 text-sm text-muted">
          Enter it to complete a partner quest together.
        </p>
        <JoinCodeForm />
      </Card>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">Quests</h2>
          {quests && (
            <span className="text-sm text-muted">{openCount} open</span>
          )}
        </div>

        {isLoading ? (
          <LoadingState label="Loading quests..." />
        ) : error || !quests ? (
          <ErrorState
            message={error ?? "Could not load quests."}
            onRetry={() => refetch()}
          />
        ) : quests.length === 0 ? (
          <p className="py-8 text-center text-muted">
            No quests available yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {quests.map((quest) => (
              <li key={quest.id}>
                <QuestCard quest={quest} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <ShareButton
          className={`${buttonStyles.secondary} w-full`}
          label="📨 Invite a friend"
          path="/"
          text="Join me on Campus Voyager: explore ETH and complete quests together!"
          title="Campus Voyager"
        />
        <Link
          className={`${buttonStyles.secondary} text-center`}
          href="/submit"
        >
          💡 Suggest a quest
        </Link>
      </div>
    </Page>
  );
}
