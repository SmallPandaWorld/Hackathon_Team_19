"use client";

import { CampusMotif } from "@/src/components/campus-motif";
import { JoinWithCode } from "@/src/components/join-code-form";
import { buttonStyles, Page } from "@/src/components/page";
import { PairInvites } from "@/src/components/pair-invites";
import { PlayerSummary } from "@/src/components/player-summary";
import { QuestCard } from "@/src/components/quest-card";
import { ShareButton } from "@/src/components/share-button";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import type { QuestOut } from "@/src/lib/api/hackathon.schemas";
import { useListQuests } from "@/src/lib/api/quests";
import { ChevronDown, Lightbulb, Send } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const STEPS = [
  "Pick a quest and read the instructions.",
  "Go out on campus and do the activity, some with a partner or a group.",
  "Confirm it in the app to collect your points and badges.",
];

type Sections = {
  available: QuestOut[];
  upcoming: QuestOut[];
  inReview: QuestOut[];
  completed: QuestOut[];
};

// Available now first, then scheduled events, then the player's history.
function sortQuests(quests: QuestOut[]): Sections {
  const sections: Sections = {
    available: [],
    upcoming: [],
    inReview: [],
    completed: [],
  };
  for (const quest of quests) {
    if (quest.completed) sections.completed.push(quest);
    else if (quest.completion_status === "pending")
      sections.inReview.push(quest);
    else if (quest.kind === "meetup") {
      if (quest.meetup_state === "live") sections.available.push(quest);
      else if (
        quest.meetup_state === "upcoming" ||
        quest.meetup_state === "cancelled"
      )
        sections.upcoming.push(quest);
      // Past meetups the player missed are no longer actionable.
    } else sections.available.push(quest);
  }
  sections.upcoming.sort((a, b) =>
    (a.starts_at ?? "").localeCompare(b.starts_at ?? ""),
  );
  return sections;
}

function QuestList({ quests }: { quests: QuestOut[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {quests.map((quest) => (
        <li key={quest.id}>
          <QuestCard quest={quest} />
        </li>
      ))}
    </ul>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-baseline justify-between text-xl font-bold">
        {title}
        <span className="text-sm font-medium text-muted">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="group rounded-lg border border-outline-variant"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          aria-hidden
          className="h-5 w-5 text-muted transition group-open:rotate-180"
        />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

export default function Home() {
  const { data, isLoading, isError, refetch } = useListQuests();
  const quests = data?.status === 200 ? data.data : undefined;
  const error = isError
    ? "Could not load quests. Check your connection."
    : apiErrorMessage(data);
  const sections = quests ? sortQuests(quests) : undefined;
  const isNewPlayer = sections
    ? sections.completed.length === 0 && sections.inReview.length === 0
    : false;

  return (
    <Page>
      <header className="relative">
        <p className="text-sm font-medium text-muted">VISCON 2026</p>
        <h1 className="mt-1 text-4xl font-bold tracking-tight">
          Campus Voyager
        </h1>
        <CampusMotif className="mt-2 h-16 w-full text-outline" />
      </header>

      <PlayerSummary />
      <PairInvites />
      <JoinWithCode />

      {isLoading ? (
        <LoadingState label="Loading quests..." />
      ) : error || !sections ? (
        <ErrorState
          message={error ?? "Could not load quests."}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          {isNewPlayer && (
            <Collapsible defaultOpen title="How it works">
              <HowItWorks />
            </Collapsible>
          )}

          <Section count={sections.available.length} title="Available now">
            {sections.available.length > 0 ? (
              <QuestList quests={sections.available} />
            ) : (
              <p className="rounded-lg border border-dashed border-outline-variant p-4 text-center text-sm text-muted">
                {!quests?.length
                  ? "No quests yet. Check back soon, or suggest one!"
                  : "You've done everything available right now. Check the upcoming events, or suggest a new quest!"}
              </p>
            )}
          </Section>

          {sections.upcoming.length > 0 && (
            <Section count={sections.upcoming.length} title="Upcoming">
              <QuestList quests={sections.upcoming} />
            </Section>
          )}

          {sections.inReview.length > 0 && (
            <Section count={sections.inReview.length} title="In review">
              <QuestList quests={sections.inReview} />
            </Section>
          )}

          {sections.completed.length > 0 && (
            <Collapsible title={`Completed (${sections.completed.length})`}>
              <QuestList quests={sections.completed} />
            </Collapsible>
          )}

          {!isNewPlayer && (
            <Collapsible title="How it works">
              <HowItWorks />
            </Collapsible>
          )}
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <ShareButton
          className={`${buttonStyles.secondary} flex w-full items-center justify-center gap-2`}
          label={
            <>
              <Send aria-hidden className="h-4 w-4" /> Invite a friend
            </>
          }
          path="/"
          text="Join me on Campus Voyager: explore ETH and complete quests together!"
          title="Campus Voyager"
        />
        <Link
          className={`${buttonStyles.secondary} flex self-start items-center justify-center gap-2`}
          href="/submit"
        >
          <Lightbulb aria-hidden className="h-4 w-4" /> Suggest a quest
        </Link>
      </div>
    </Page>
  );
}

function HowItWorks() {
  return (
    <ol className="space-y-2 text-sm text-on-surface-variant">
      {STEPS.map((step, index) => (
        <li className="flex gap-3" key={step}>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
            {index + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}
