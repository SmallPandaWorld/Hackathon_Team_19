"use client";

import { buttonStyles, Card, inputStyles } from "@/src/components/page";
import { ProfilePicture } from "@/src/components/profile-picture";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import { initials } from "@/src/lib/initials";
import type { Me } from "@/src/lib/api/hackathon.schemas";
import {
  useDismissSuggestion,
  useSearchPlayers,
} from "@/src/lib/api/players";
import { useActOnQuest, useListQuests } from "@/src/lib/api/quests";
import { useAction } from "@/src/lib/use-action";
import { keepPreviousData } from "@tanstack/react-query";
import { ChevronRight, Search, Send, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function profileHref(username: string): string {
  return `/profile?player=${encodeURIComponent(username)}`;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function SuggestionsList({ player }: { player: Me }) {
  const quests = useListQuests();
  const dismiss = useDismissSuggestion();
  const startSession = useActOnQuest();
  const router = useRouter();
  const { error, run, refreshAll } = useAction();
  const result = player.suggestions;
  // Prefer a partner quest the player hasn't completed yet.
  const pairQuests =
    quests.data?.status === 200
      ? quests.data.data.filter((q) => q.kind === "pair")
      : [];
  const pairQuest = pairQuests.find((q) => !q.completed) ?? pairQuests[0];

  async function invite(username: string) {
    if (!pairQuest) return;
    const response = await run(() =>
      startSession.mutateAsync({
        questId: pairQuest.id,
        data: { type: "pair_start", invite_username: username },
      }),
    );
    if (response) router.push(`/quests/${pairQuest.id}`);
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 font-semibold">
        <Users aria-hidden className="h-5 w-5" /> People you might get along
        with
      </h2>
      {!result.enabled ? (
        <p className="mt-1 text-sm text-muted">
          Pick hobbies and turn on connection suggestions in{" "}
          <Link
            className="font-semibold text-link hover:underline"
            href="/profile#privacy-settings"
          >
            Privacy settings
          </Link>{" "}
          to see players who share them.
        </p>
      ) : result.suggestions.length === 0 ? (
        <p className="mt-1 text-sm text-muted">
          No matches yet. Add more hobbies or check back later as more players
          join.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            {pairQuest
              ? `Invite them to “${pairQuest.title}”: they get the invitation in their app, then you meet up and complete it together.${pairQuest.completed ? " You've done it already, so they earn the points." : ""}`
              : "Say hi when you see them on campus!"}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {result.suggestions.map((suggestion) => (
              <li
                className="flex items-center gap-3 rounded-xl bg-surface-variant p-3 dark:bg-surface-container"
                key={suggestion.username}
              >
                <Link
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-on-primary"
                  href={profileHref(suggestion.username)}
                  tabIndex={-1}
                >
                  {initials(suggestion.display_name)}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    className="block truncate font-semibold hover:underline"
                    href={profileHref(suggestion.username)}
                  >
                    {suggestion.display_name}
                  </Link>
                  <p className="text-xs text-muted">
                    You both like {suggestion.shared_hobbies.join(", ")}
                  </p>
                </div>
                {pairQuest && (
                  <button
                    className={`${buttonStyles.primary} flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm`}
                    disabled={startSession.isPending}
                    onClick={() => invite(suggestion.username)}
                    type="button"
                  >
                    <Send aria-hidden className="h-4 w-4" /> Invite
                  </button>
                )}
                <button
                  aria-label={`Not interested in ${suggestion.display_name}`}
                  className="shrink-0 text-xs font-semibold text-muted hover:text-danger"
                  disabled={dismiss.isPending}
                  onClick={async () => {
                    if (
                      await run(() =>
                        dismiss.mutateAsync({ username: suggestion.username }),
                      )
                    )
                      await refreshAll();
                  }}
                  type="button"
                >
                  Hide
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}

const SEARCH_DELAY_MS = 400;
const MIN_QUERY_LENGTH = 2;
const SEARCH_CACHE_MS = 60_000;

function SearchResults({ query }: { query: string }) {
  const { data, isLoading, isError, isFetching, refetch } = useSearchPlayers(
    { q: query },
    {
      query: {
        placeholderData: keepPreviousData,
        staleTime: SEARCH_CACHE_MS,
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  );
  const results = data?.status === 200 ? data.data : undefined;
  const error = isError ? "Could not search players." : apiErrorMessage(data);

  if (isLoading) return <LoadingState label="Searching..." />;
  if (error || !results)
    return (
      <ErrorState
        message={error ?? "Could not search players."}
        onRetry={() => refetch()}
      />
    );
  if (results.length === 0)
    return (
      <p className="text-sm text-muted">
        No players found. Only players who turned on connection suggestions can
        be found.
      </p>
    );

  return (
    <ul
      aria-busy={isFetching}
      className={`flex flex-col gap-2 transition ${isFetching ? "opacity-60" : ""}`}
    >
      {results.map((result) => (
        <li key={result.username}>
          <Link
            className="flex items-center gap-3 rounded-xl bg-surface-variant p-3 transition hover:ring-2 hover:ring-primary dark:bg-surface-container"
            href={profileHref(result.username)}
          >
            <ProfilePicture
              displayName={result.display_name}
              size="small"
              username={result.username}
            />
            <span className="min-w-0 flex-1 truncate font-semibold">
              {result.display_name}
            </span>
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SearchPlayers() {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const query = useDebouncedValue(trimmed, SEARCH_DELAY_MS);
  const ready = query.length >= MIN_QUERY_LENGTH;

  return (
    <Card className="flex flex-col gap-3">
      <label className="font-semibold" htmlFor="player-search">
        Find a new friend
      </label>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        />
        <input
          autoComplete="off"
          className={`${inputStyles} mt-0 pl-9`}
          id="player-search"
          maxLength={100}
          onChange={(event) => setText(event.target.value)}
          placeholder="Start typing a name..."
          type="search"
          value={text}
        />
      </div>
      {trimmed.length < MIN_QUERY_LENGTH ? (
        <p className="text-sm text-muted">
          Type at least {MIN_QUERY_LENGTH} letters. Only players who turned on
          connection suggestions can be found.
        </p>
      ) : ready ? (
        <div aria-live="polite">
          <SearchResults query={query} />
        </div>
      ) : (
        <LoadingState label="Searching..." />
      )}
    </Card>
  );
}

export function FriendSuggestions({ player }: { player: Me }) {
  return <SuggestionsList player={player} />;
}
