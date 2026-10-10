"use client";

import { CampusMap } from "@/src/components/campus-map";
import { Page, PageTitle } from "@/src/components/page";
import { QuestCard } from "@/src/components/quest-card";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import { useListQuests } from "@/src/lib/api/quests";
import { X } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readHashId() {
  return window.location.hash.match(/^#quest-(.+)$/)?.[1] ?? null;
}

export default function MapPage() {
  const { data, isLoading, isError, refetch } = useListQuests();
  const quests = data?.status === 200 ? data.data : undefined;
  const error = isError
    ? "Could not load quests. Check your connection."
    : apiErrorMessage(data);
  // "Show on map" links point to /map#quest-ID; a tapped pin overrides it.
  const hashId = useSyncExternalStore(subscribeHash, readHashId, () => null);
  const [picked, setSelectedId] = useState<string | null | undefined>();
  const selectedId = picked === undefined ? hashId : picked;

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
        kind: q.kind,
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
              Tap a pin to see its quest. Yellow pins are open, dark pins are
              done.
            </p>
          </div>

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

          {/* Selected pin: compact bottom sheet, kept above the tab bar. */}
          {selected && (
            <>
              <div aria-hidden className="h-32" />
              <div
                aria-label="Selected quest"
                className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-[1050] px-3 pb-3"
                role="dialog"
              >
                <div className="mx-auto max-w-2xl rounded-lg border border-outline-variant bg-surface p-2 shadow-[0_-4px_24px_rgb(0_0_0/0.18)] dark:bg-surface-variant">
                  <div className="flex items-center justify-between px-2 pb-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      On the map
                    </span>
                    <button
                      aria-label="Close"
                      className="rounded-sm p-1 text-muted hover:bg-surface-container hover:text-on-surface"
                      onClick={() => setSelectedId(null)}
                      type="button"
                    >
                      <X aria-hidden className="h-4 w-4" />
                    </button>
                  </div>
                  <QuestCard quest={selected} />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </Page>
  );
}
