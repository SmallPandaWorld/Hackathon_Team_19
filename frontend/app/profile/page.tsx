"use client";

import {
  buttonStyles,
  Card,
  Chip,
  inputStyles,
  Page,
} from "@/src/components/page";
import { FriendActions, FriendsCard } from "@/src/components/friends";
import { BadgeIcon } from "@/src/components/icons";
import { ProfilePicture } from "@/src/components/profile-picture";
import { ProfileMeetupGallery } from "@/src/components/meetup-photo-gallery";
import { ProfileQuestPhotoGallery } from "@/src/components/quest-photo-gallery";
import { ShareButton } from "@/src/components/share-button";
import { ThemeSwitch } from "@/src/components/theme-switch";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import type {
  Badge,
  HobbyOption,
  Me,
  PublicPlayer,
} from "@/src/lib/api/hackathon.schemas";
import {
  useDismissSuggestion,
  useGetMe,
  useGetPlayer,
  useSearchPlayers,
  useUpdateMe,
} from "@/src/lib/api/players";
import { useActOnQuest, useListQuests } from "@/src/lib/api/quests";
import { STATUS_LABELS } from "@/src/lib/quest-display";
import { useAction } from "@/src/lib/use-action";
import { keepPreviousData } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Search,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

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

function nextBadge(badges: Badge[]): Badge | undefined {
  // The unearned badge the player is closest to.
  return badges
    .filter((badge) => !badge.earned)
    .sort((a, b) => b.progress / b.target - a.progress / a.target)[0];
}

function nextBadgeHint(badge: Badge): string {
  const left = badge.target - badge.progress;
  if (badge.key === "century")
    return `${left} more points to earn “${badge.title}”`;
  if (badge.target > 1)
    return `${left} more ${left === 1 ? "quest" : "quests"} to earn “${badge.title}”`;
  return `${badge.description.replace(/\.$/, "")} to earn “${badge.title}”`;
}

function Achievements({ player }: { player: Me }) {
  const badges = player.badges;
  const earned = badges.filter((badge) => badge.earned);
  const next = nextBadge(badges);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-3xl font-bold">{player.total_points}</p>
          <p className="text-sm text-muted">points</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold">
            {earned.length}
            <span className="text-lg text-muted">/{badges.length}</span>
          </p>
          <p className="text-sm text-muted">badges</p>
        </div>
      </div>

      {earned.length > 0 && (
        <ul aria-label="Earned badges" className="flex flex-wrap gap-2">
          {earned.map((badge) => (
            <li
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-on-accent"
              key={badge.key}
              title={badge.title}
            >
              <BadgeIcon badgeKey={badge.key} />
              <span className="sr-only">{badge.title}</span>
            </li>
          ))}
        </ul>
      )}

      {next ? (
        <div className="rounded-xl border border-outline-variant p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-outline text-muted">
              <BadgeIcon badgeKey={next.key} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Next badge
              </p>
              <p className="font-semibold">{nextBadgeHint(next)}</p>
            </div>
          </div>
          {next.target > 1 && (
            <div
              aria-label={`${next.progress} of ${next.target}`}
              className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(next.progress / next.target) * 100}%` }}
              />
            </div>
          )}
        </div>
      ) : (
        <p className="font-semibold">You earned every badge. Legendary!</p>
      )}

      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-link [&::-webkit-details-marker]:hidden">
          All badges
          <ChevronDown
            aria-hidden
            className="h-4 w-4 transition group-open:rotate-180"
          />
        </summary>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {badges.map((badge) => (
            <li
              className={`flex items-center gap-3 rounded-xl border p-2 ${
                badge.earned
                  ? "border-outline-variant"
                  : "border-outline-variant opacity-60"
              }`}
              key={badge.key}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  badge.earned
                    ? "bg-accent text-on-accent"
                    : "border border-dashed border-outline text-muted"
                }`}
              >
                <BadgeIcon badgeKey={badge.key} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {badge.title}
                </span>
                <span className="block text-xs text-muted">
                  {badge.description}
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-muted">
                {badge.earned ? (
                  <Check
                    aria-label="Earned"
                    className="h-4 w-4 text-success"
                    strokeWidth={2.5}
                  />
                ) : (
                  `${badge.progress}/${badge.target}`
                )}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

function HobbyEditor({ player }: { player: Me }) {
  const updateMe = useUpdateMe();
  const { error, run, refreshAll } = useAction();
  const [selected, setSelected] = useState<string[]>(player.hobbies);
  const [saved, setSaved] = useState(false);
  const options = player.hobby_options;
  const changed =
    selected.length !== player.hobbies.length ||
    selected.some((key) => !player.hobbies.includes(key));

  function toggle(key: string) {
    setSaved(false);
    setSelected((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key],
    );
  }

  async function save() {
    if (
      await run(() =>
        updateMe.mutateAsync({
          data: { hobbies: selected, discoverable: player.discoverable },
        }),
      )
    ) {
      setSaved(true);
      await refreshAll();
    }
  }

  return (
    <Card>
      <h2 className="font-semibold">Hobbies (optional)</h2>
      <p className="mt-1 text-sm text-muted">
        Pick what you like to find people with shared interests. Your hobbies
        stay private until you opt into suggestions in the Privacy card.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option.key);
          return (
            <button
              aria-pressed={active}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition ${
                active
                  ? "bg-primary text-on-primary ring-primary"
                  : "bg-surface text-on-surface-variant ring-outline-variant hover:ring-outline dark:bg-surface-variant"
              }`}
              key={option.key}
              onClick={() => toggle(option.key)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          className={`${buttonStyles.primary} py-2`}
          disabled={!changed || updateMe.isPending}
          onClick={save}
          type="button"
        >
          {updateMe.isPending ? "Saving..." : "Save"}
        </button>
        {selected.length > 0 && (
          <button
            className="text-sm font-semibold text-muted hover:text-danger"
            onClick={() => {
              setSaved(false);
              setSelected([]);
            }}
            type="button"
          >
            Remove all hobbies
          </button>
        )}
        {saved && !changed && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check aria-hidden className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}

function PrivacySettings({ player }: { player: Me }) {
  const updateMe = useUpdateMe();
  const { error, run, refreshAll } = useAction();
  const [discoverable, setDiscoverable] = useState(player.discoverable);
  const [saved, setSaved] = useState(false);
  const changed = discoverable !== player.discoverable;

  async function save() {
    if (
      await run(() =>
        updateMe.mutateAsync({
          data: { hobbies: player.hobbies, discoverable },
        }),
      )
    ) {
      setSaved(true);
      await refreshAll();
    }
  }

  return (
    <Card className="border-2 border-primary/30 bg-surface-variant p-6 lg:p-8 dark:bg-surface-container">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldCheck aria-hidden className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">Privacy</h2>
            <Chip
              className={
                discoverable
                  ? "bg-primary/10 text-primary"
                  : "bg-surface text-muted dark:bg-surface-variant"
              }
            >
              {discoverable ? "Opted in" : "Opted out"}
            </Chip>
          </div>
          <p className="mt-1 text-sm text-muted">
            Choose whether other players can find you and see your pictures.
          </p>
        </div>
      </div>

      <label className="mt-6 flex cursor-pointer items-start gap-4 rounded-2xl border border-outline-variant bg-surface p-4 text-sm transition hover:border-primary/50 sm:p-5 dark:bg-surface-variant">
        <input
          checked={discoverable}
          className="mt-1 h-5 w-5 shrink-0 accent-primary"
          onChange={(event) => {
            setSaved(false);
            setDiscoverable(event.target.checked);
          }}
          type="checkbox"
        />
        <span>
          <span className="block text-base font-semibold">
            I consent to appearing in connection suggestions and showing my
            profile picture and photos
          </span>
          <span className="mt-1 block leading-relaxed text-muted">
            When checked, you can appear in connection suggestions. Your profile
            picture, photos you upload to completed activities, and meetup
            photos from events you checked into appear on your profile. Players
            only see each other in suggestions when both have opted in. You can
            change this setting any time.
          </span>
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className={`${buttonStyles.primary} py-2`}
          disabled={!changed || updateMe.isPending}
          onClick={save}
          type="button"
        >
          {updateMe.isPending ? "Saving..." : "Save privacy settings"}
        </button>
        {saved && !changed && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check aria-hidden className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}

function Appearance() {
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Appearance</h2>
        <p className="mt-1 text-sm text-muted">
          System follows your device&apos;s light or dark setting.
        </p>
      </div>
      <ThemeSwitch />
    </Card>
  );
}

function SuggestionsList({ player }: { player: Me }) {
  const quests = useListQuests();
  const dismiss = useDismissSuggestion();
  const startSession = useActOnQuest();
  const router = useRouter();
  const { error, run, refreshAll } = useAction();
  const result = player.suggestions;
  // A partner quest to play with a suggestion: one the player hasn't done
  // yet if possible, otherwise any (then only the invitee earns points).
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
          Pick hobbies and opt in through Privacy above to see players who
          share them.
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
                  {suggestion.display_name.charAt(0).toUpperCase()}
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
        No players found. Only players who turned on suggestions can be found.
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
            className="flex items-center gap-3 rounded-xl bg-surface-variant p-3 dark:bg-surface-container transition hover:ring-2 hover:ring-primary"
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

function SearchPlayers() {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const query = useDebouncedValue(trimmed, SEARCH_DELAY_MS);
  const ready = query.length >= MIN_QUERY_LENGTH;

  return (
    <Card className="flex flex-col gap-3">
      <label className="font-semibold" htmlFor="player-search">
        Find a player by name
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
          suggestions can be found.
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

function MySubmissions({ player }: { player: Me }) {
  const submissions = player.submissions;

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">Your quest ideas</h2>
        <Link
          className="text-sm font-semibold text-link hover:underline"
          href="/submit"
        >
          + Suggest a quest
        </Link>
      </div>
      {submissions.length === 0 ? (
        <p className="mt-1 text-sm text-muted">
          You haven&apos;t suggested any quests yet.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {submissions.map((submission) => (
            <li
              className="rounded-xl bg-surface-variant p-3 dark:bg-surface-container"
              key={submission.id}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{submission.title}</p>
                <Chip className={STATUS_LABELS[submission.status].className}>
                  {STATUS_LABELS[submission.status].label}
                </Chip>
              </div>
              {submission.status === "rejected" && submission.review_note && (
                <p className="mt-1 text-sm text-danger">
                  Reviewer: “{submission.review_note}”
                </p>
              )}
              {submission.status === "published" && (
                <Link
                  className="mt-1 inline-block text-sm font-semibold text-link"
                  href={`/quests/${submission.id}`}
                >
                  View quest
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function OtherProfile({
  player,
  hobbyOptions,
}: {
  player: PublicPlayer;
  hobbyOptions: HobbyOption[];
}) {
  const labels = player.hobbies.map(
    (key) => hobbyOptions.find((option) => option.key === key)?.label ?? key,
  );
  const earned = player.badges.filter((badge) => badge.earned);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <p className="text-3xl font-bold">{player.total_points}</p>
          <p className="text-sm text-muted">points</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold">
            {earned.length}
            <span className="text-lg text-muted">/{player.badges.length}</span>
          </p>
          <p className="text-sm text-muted">badges</p>
        </div>
      </div>
      <FriendActions player={player} />
      {earned.length > 0 && (
        <ul aria-label="Earned badges" className="flex flex-wrap gap-2">
          {earned.map((badge) => (
            <li
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-on-accent"
              key={badge.key}
              title={badge.title}
            >
              <BadgeIcon badgeKey={badge.key} />
              <span className="sr-only">{badge.title}</span>
            </li>
          ))}
        </ul>
      )}
      {labels.length > 0 && (
        <div>
          <h2 className="font-semibold">Hobbies</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {labels.map((label) => (
              <li
                className="rounded-full bg-surface-variant px-3 py-1.5 text-sm font-medium text-on-surface-variant dark:bg-surface-container"
                key={label}
              >
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link
        className="text-sm font-semibold text-link hover:underline"
        href="/profile"
      >
        Back to your profile
      </Link>
    </Card>
  );
}

function OwnProfile({ player }: { player: Me }) {
  return (
    <>
      <Achievements player={player} />
      <ProfileMeetupGallery
        username={player.username}
        visible={player.discoverable}
      />
      <ProfileQuestPhotoGallery
        username={player.username}
        visible={player.discoverable}
      />
      <FriendsCard />
      <SuggestionsList player={player} />
      <SearchPlayers />
      {/* Not keyed on the saved values: a remount after saving would hide "Saved". */}
      <HobbyEditor player={player} />
      <PrivacySettings player={player} />
      <Appearance />
      <MySubmissions player={player} />
      <ShareButton
        className={`${buttonStyles.secondary} flex w-full items-center justify-center gap-2`}
        label={
          <>
            <Send aria-hidden className="h-4 w-4" /> Invite a friend to Campus
            Voyager
          </>
        }
        path="/"
        text="Join me on Campus Voyager: explore ETH and complete quests together!"
        title="Campus Voyager"
      />
    </>
  );
}

function ProfileContent() {
  // `?player=<username>` shows another player; without it the page is your own.
  const requested = useSearchParams().get("player")?.trim() || undefined;

  const me = useGetMe();
  const myself = me.data?.status === 200 ? me.data.data : undefined;
  // Your own username in the URL shows your full profile, so skip fetching it twice.
  const isOwn = requested === undefined || requested === myself?.username;
  // Waits for `me`: it decides whether this is your own profile and labels the hobbies.
  const other = useGetPlayer(encodeURIComponent(requested ?? ""), {
    query: { enabled: !isOwn && myself !== undefined },
  });
  const otherPlayer = other.data?.status === 200 ? other.data.data : undefined;

  const meError = me.isError
    ? "Could not load your profile."
    : apiErrorMessage(me.data);
  const otherError = other.isError
    ? "Could not load this profile."
    : other.data?.status === 404
      ? "This player doesn't exist or keeps their profile private."
      : apiErrorMessage(other.data);

  let title = "You";
  let body: ReactNode;
  if (me.isLoading) {
    body = <LoadingState label="Loading profile..." />;
  } else if (meError || !myself) {
    body = (
      <ErrorState
        message={meError ?? "Could not load your profile."}
        onRetry={() => me.refetch()}
      />
    );
  } else if (isOwn) {
    title = myself.display_name;
    body = <OwnProfile player={myself} />;
  } else if (other.isPending) {
    title = "Player";
    body = <LoadingState label="Loading profile..." />;
  } else if (otherError || !otherPlayer) {
    title = "Player";
    body = (
      <ErrorState
        message={otherError ?? "Could not load this profile."}
        onRetry={() => other.refetch()}
      />
    );
  } else {
    title = otherPlayer.display_name;
    body = (
      <OtherProfile hobbyOptions={myself.hobby_options} player={otherPlayer} />
    );
  }

  const profileForHeading =
    isOwn && myself
      ? {
          username: myself.username,
          displayName: myself.display_name,
          editable: true,
        }
      : !isOwn && otherPlayer
        ? {
            username: otherPlayer.username,
            displayName: otherPlayer.display_name,
            editable: false,
          }
        : undefined;

  return (
    <Page>
      <header>
        <p className="text-sm font-semibold text-link">Profile</p>
        <div className="mt-1 flex items-center justify-between gap-4">
          <h1 className="min-w-0 flex-1 break-words text-4xl font-bold tracking-tight sm:text-5xl">
            {title}
          </h1>
          {profileForHeading && <ProfilePicture {...profileForHeading} />}
        </div>
      </header>
      {body}
      {!isOwn && otherPlayer && (
        <>
          <ProfileMeetupGallery username={otherPlayer.username} />
          <ProfileQuestPhotoGallery username={otherPlayer.username} />
        </>
      )}
    </Page>
  );
}

export default function ProfilePage() {
  // useSearchParams() needs a Suspense boundary when cacheComponents is enabled.
  return (
    <Suspense
      fallback={
        <Page>
          <LoadingState label="Loading profile..." />
        </Page>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}
