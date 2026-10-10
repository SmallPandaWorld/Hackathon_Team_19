"use client";

import { QuestList } from "@/src/components/quest-list";
import { Page, PageTitle, buttonStyles } from "@/src/components/page";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import { useListQuests } from "@/src/lib/api/quests";
import { sortQuests } from "@/src/lib/quest-sections";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function QuestsToDoPage() {
  const { data, isLoading, isError, refetch } = useListQuests();
  const quests = data?.status === 200 ? data.data : undefined;
  const error = isError
    ? "Could not load quests. Check your connection."
    : apiErrorMessage(data);
  const sections = quests ? sortQuests(quests) : undefined;

  return (
    <Page>
      <Link
        className={`${buttonStyles.secondary} inline-flex min-h-11 w-fit items-center gap-2 py-2 text-sm`}
        href="/"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" /> Back to quests
      </Link>
      <PageTitle eyebrow="Your activities">Quests to do</PageTitle>
      {isLoading ? (
        <LoadingState label="Loading quests..." />
      ) : error || !sections ? (
        <ErrorState
          message={error ?? "Could not load quests."}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-bold">
              Available now ({sections.available.length})
            </h2>
            {sections.available.length > 0 ? (
              <QuestList quests={sections.available} />
            ) : (
              <p className="rounded-lg border border-dashed border-outline-variant p-4 text-center text-sm text-muted">
                No quests are available right now.
              </p>
            )}
          </section>
          {sections.upcoming.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-xl font-bold">
                Upcoming ({sections.upcoming.length})
              </h2>
              <QuestList quests={sections.upcoming} />
            </section>
          )}
        </>
      )}
    </Page>
  );
}
