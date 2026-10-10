"use client";

import { CampusMap } from "@/src/components/campus-map";
import { Page, PageTitle } from "@/src/components/page";
import { QuestCard } from "@/src/components/quest-card";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import { useListQuests } from "@/src/lib/api/quests";
import { useEffect, useState } from "react";

export default function MapPage() {
  const { data, isLoading, isError, refetch } = useListQuests();
  const quests = data?.status === 200 ? data.data : undefined;
  const error = isError
    ? "Could not load quests. Check your connection."
    : apiErrorMessage(data);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // "Show on map" links point to /map#quest-ID.
  useEffect(() => {
    const match = window.location.hash.match(/^#quest-(\d+)$/);
    if (match) setSelectedId(Number(match[1]));
  }, []);

  const pinned =
    quests?.filter((q) => q.map_x != null && q.map_y != null) ?? [];
  const unpinned =
    quests?.filter((q) => q.map_x == null || q.map_y == null) ?? [];
  const selected = pinned.find((q) => q.id === selectedId);

  return (
    <Page>
      <PageTitle eyebrow="ETH Zentrum">Campus map</PageTitle>

      {isLoading ? (
        <LoadingState label="Loading map..." />
      ) : error || !quests ? (
        <ErrorState
          message={error ?? "Could not load quests."}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <div>
            <CampusMap
              onSelect={setSelectedId}
              pins={pinned.map((q) => ({
                id: q.id,
                x: q.map_x as number,
                y: q.map_y as number,
                label: q.title,
                done: q.completed,
              }))}
              selectedId={selectedId}
            />
            <p className="mt-2 text-xs text-slate-500">
              Tap a pin to see its quest. Green pins are quests you completed.
            </p>
          </div>

          {selected ? (
            <QuestCard quest={selected} />
          ) : (
            pinned.length > 0 && (
              <p className="rounded-2xl bg-white p-4 text-center text-sm text-slate-500 ring-1 ring-slate-200">
                No quest selected.
              </p>
            )
          )}

          {/* Text alternative to the map */}
          <section>
            <h2 className="mb-3 text-lg font-bold">Quests by location</h2>
            <ul className="flex flex-col gap-3">
              {pinned.map((quest) => (
                <li key={quest.id}>
                  <QuestCard quest={quest} />
                </li>
              ))}
            </ul>
          </section>

          {unpinned.length > 0 && (
            <section>
              <h2 className="mb-1 text-lg font-bold">Anywhere on campus</h2>
              <p className="mb-3 text-sm text-slate-500">
                These quests aren&apos;t tied to one place.
              </p>
              <ul className="flex flex-col gap-3">
                {unpinned.map((quest) => (
                  <li key={quest.id}>
                    <QuestCard quest={quest} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Page>
  );
}
