"use client";

import { CampusMotif } from "@/src/components/campus-motif";
import { JoinWithCode } from "@/src/components/join-code-form";
import { buttonStyles, Page } from "@/src/components/page";
import { PairInvites } from "@/src/components/pair-invites";
import { PlayerSummary } from "@/src/components/player-summary";
import { QuestList } from "@/src/components/quest-list";
import { ShareButton } from "@/src/components/share-button";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import { useListQuests } from "@/src/lib/api/quests";
import { sortQuests } from "@/src/lib/quest-sections";
import { ArrowRight, ChevronDown, CircleHelp, Plus, Send } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const STEPS = [
  "Pick a quest, read the instructions and join it.",
  "Go out on campus and do the activity, some with a partner or a group.",
  "Confirm it in the app to collect your points and badges.",
];

function Section({
  title,
  count,
  help,
  children,
}: {
  title: string;
  count: number;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        <div className="flex items-center gap-2 text-sm font-medium text-muted">
          <span>{count}</span>
          {help && (
            <details className="group relative">
              <summary
                aria-label="How quests work"
                className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full border border-outline-variant transition hover:border-primary/60 hover:text-primary [&::-webkit-details-marker]:hidden group-open:border-primary/60 group-open:text-primary"
                title="How quests work"
              >
                <CircleHelp aria-hidden className="h-4 w-4" />
              </summary>
              <div className="absolute right-0 z-[120] mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-outline-variant bg-surface p-4 text-on-surface shadow-card dark:bg-surface-container">
                <h3 className="font-semibold">How it works</h3>
                <div className="mt-2">{help}</div>
              </div>
            </details>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function Collapsible({
  title,
  defaultOpen = false,
  compact = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className={`group border border-outline-variant ${
        compact
          ? "rounded-xl bg-transparent"
          : "rounded-2xl bg-surface shadow-card dark:bg-surface-variant"
      }`}
      open={defaultOpen}
    >
      <summary
        className={`flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden ${
          compact
            ? "rounded-xl px-4 py-3 text-sm font-medium text-muted"
            : "rounded-2xl px-5 py-4 font-semibold"
        }`}
      >
        {title}
        <ChevronDown
          aria-hidden
          className={`${
            compact ? "h-4 w-4" : "h-5 w-5"
          } text-muted transition group-open:rotate-180`}
        />
      </summary>
      <div className={compact ? "px-4 pb-4" : "px-5 pb-5"}>{children}</div>
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
  return (
    <Page>
      <header className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase leading-none tracking-wider text-link">
              VISCON 2026 <span className="px-1 text-muted">/</span> ETH ZURICH
            </p>
            <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-6xl">
              Campus Voyager
            </h1>
          </div>
          <div className="shrink-0 lg:hidden">
            <PlayerSummary />
          </div>
        </div>
        <CampusMotif className="mt-5 h-28 w-full text-outline sm:h-40 lg:h-52 dark:text-[#88969c]" />
      </header>

      <PairInvites />
      <div className="lg:hidden">
        <JoinWithCode />
      </div>

      {isLoading ? (
        <LoadingState label="Loading quests..." />
      ) : error || !sections ? (
        <ErrorState
          message={error ?? "Could not load quests."}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <Section
            count={sections.available.length}
            help={<HowItWorks />}
            title="Available now"
          >
            {sections.available.length > 0 ? (
              <>
                <QuestList quests={sections.available.slice(0, 4)} />
                {sections.available.length > 4 && (
                  <Link
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition hover:border-primary/50 hover:bg-primary/15"
                    href="/quests"
                  >
                    See all quests to do
                    <ArrowRight aria-hidden className="h-4 w-4" />
                  </Link>
                )}
              </>
            ) : (
              <p className="rounded-lg border border-dashed border-outline-variant p-4 text-center text-sm text-muted">
                {!quests?.length
                  ? "No quests yet. Create one to get things started!"
                  : "You've done everything available right now. Check the upcoming events, or create a new quest!"}
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
            <Collapsible
              compact
              title={`Completed (${sections.completed.length})`}
            >
              <QuestList quests={sections.completed} />
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
          href="/create"
        >
          <Plus aria-hidden className="h-4 w-4" /> Create a quest
        </Link>
      </div>
    </Page>
  );
}

function HowItWorks() {
  return (
    <ol className="space-y-1.5 text-xs text-on-surface-variant">
      {STEPS.map((step, index) => (
        <li className="flex gap-2" key={step}>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-on-accent">
            {index + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}
