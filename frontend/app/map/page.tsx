"use client";

import { CampusMap } from "@/src/components/campus-map";
import { Page, PageTitle } from "@/src/components/page";
import { QuestCard } from "@/src/components/quest-card";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import { useListQuests } from "@/src/lib/api/quests";
import { KIND_LABELS } from "@/src/lib/quest-display";
import { useEffect, useMemo, useState } from "react";

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

  const pinned = useMemo(
    () =>
      quests?.filter((q) => q.latitude != null && q.longitude != null) ?? [],
    [quests],
  );
  const unpinned =
    quests?.filter((q) => q.latitude == null || q.longitude == null) ?? [];
  const selected = pinned.find((q) => q.id === selectedId);
  const pins = useMemo(
    () =>
      pinned.map((q) => ({
        id: q.id,
        lat: q.latitude as number,
        lng: q.longitude as number,
        label: q.title,
        icon: KIND_LABELS[q.kind].icon,
        done: q.completed,
      })),
    [pinned],
  );

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
              pins={pins}
              selectedId={selectedId}
            />
            <p className="mt-2 text-xs text-muted">
              Tap a pin to see its quest. Yellow pins are open, dark pins with ✓
              are done.
            </p>
          </div>

          {selected ? (
            <QuestCard quest={selected} />
          ) : (
            pinned.length > 0 && (
              <p className="rounded-lg border border-dashed border-outline-variant p-4 text-center text-sm text-muted">
                Tap a pin to see the quest here.
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
              <p className="mb-3 text-sm text-muted">
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
