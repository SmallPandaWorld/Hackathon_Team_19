"use client";

import { QuestList } from "@/src/components/quest-list";
import {
  inputStyles,
  Page,
  PageTitle,
  buttonStyles,
} from "@/src/components/page";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import { useListQuests } from "@/src/lib/api/quests";
import type { QuestOutKind } from "@/src/lib/api/hackathon.schemas";
import { KIND_LABELS } from "@/src/lib/quest-display";
import {
  filterAndSortQuests,
  sortQuests,
  type QuestKindFilter,
  type QuestSortOrder,
} from "@/src/lib/quest-sections";
import { ArrowLeft, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function QuestsToDoPage() {
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<QuestSortOrder>("recommended");
  const [kindFilter, setKindFilter] = useState<QuestKindFilter>("all");
  const { data, isLoading, isError, refetch } = useListQuests();
  const quests = data?.status === 200 ? data.data : undefined;
  const error = isError
    ? "Could not load quests. Check your connection."
    : apiErrorMessage(data);
  const sections = quests ? sortQuests(quests) : undefined;
  const available = sections
    ? filterAndSortQuests(sections.available, search, sortOrder, kindFilter)
    : [];
  const upcoming = sections
    ? filterAndSortQuests(sections.upcoming, search, sortOrder, kindFilter)
    : [];
  const hasSearch = search.trim().length > 0;
  const hasFilters = hasSearch || kindFilter !== "all";
  const questKinds = Object.keys(KIND_LABELS) as QuestOutKind[];

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
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div>
              <label
                className="text-xs font-medium text-muted"
                htmlFor="quest-search"
              >
                Search by name
              </label>
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                />
                <input
                  autoComplete="off"
                  className="mt-1 block w-full rounded-lg border border-outline-variant/70 bg-surface/70 py-2 pl-9 pr-3 text-sm text-on-surface outline-none transition placeholder:text-muted hover:border-outline focus:border-outline focus:ring-2 focus:ring-primary/30 dark:bg-surface-variant/70"
                  id="quest-search"
                  maxLength={120}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Quest name"
                  type="search"
                  value={search}
                />
              </div>
            </div>
            <div>
              <label
                className="text-xs font-medium text-muted"
                htmlFor="quest-type"
              >
                Activity type
              </label>
              <select
                className={`${inputStyles} !text-muted`}
                id="quest-type"
                onChange={(event) =>
                  setKindFilter(event.target.value as QuestKindFilter)
                }
                value={kindFilter}
              >
                <option className="text-muted" value="all">
                  All types
                </option>
                {questKinds.map((kind) => (
                  <option className="text-muted" key={kind} value={kind}>
                    {KIND_LABELS[kind].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-xs font-medium text-muted"
                htmlFor="quest-sort"
              >
                Sort by
              </label>
              <select
                className={`${inputStyles} !text-muted`}
                id="quest-sort"
                onChange={(event) =>
                  setSortOrder(event.target.value as QuestSortOrder)
                }
                value={sortOrder}
              >
                <option className="text-muted" value="recommended">
                  Recommended
                </option>
                <option className="text-muted" value="title">
                  Name (A–Z)
                </option>
                <option className="text-muted" value="type">
                  Type
                </option>
                <option className="text-muted" value="points_desc">
                  Most points
                </option>
                <option className="text-muted" value="points_asc">
                  Fewest points
                </option>
                <option className="text-muted" value="soonest">
                  Soonest first
                </option>
              </select>
            </div>
          </div>

          {hasFilters && available.length === 0 && upcoming.length === 0 ? (
            <p className="rounded-lg border border-dashed border-outline-variant p-4 text-center text-sm text-muted">
              No quests match these filters. Try a different name or type.
            </p>
          ) : (
            <>
              {(available.length > 0 || !hasFilters) && (
                <section className="flex flex-col gap-4">
                  <h2 className="text-xl font-bold">
                    Available now ({available.length})
                  </h2>
                  {available.length > 0 ? (
                    <QuestList quests={available} />
                  ) : (
                    <p className="rounded-lg border border-dashed border-outline-variant p-4 text-center text-sm text-muted">
                      No quests are available right now.
                    </p>
                  )}
                </section>
              )}
              {upcoming.length > 0 && (
                <section className="flex flex-col gap-4">
                  <h2 className="text-xl font-bold">
                    Upcoming ({upcoming.length})
                  </h2>
                  <QuestList quests={upcoming} />
                </section>
              )}
            </>
          )}
        </>
      )}
    </Page>
  );
}
