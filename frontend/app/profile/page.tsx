"use client";

import {
  buttonStyles,
  Card,
  Chip,
  Page,
  PageTitle,
} from "@/src/components/page";
import { BadgeIcon } from "@/src/components/icons";
import { ShareButton } from "@/src/components/share-button";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import type { Badge, Me } from "@/src/lib/api/hackathon.schemas";
import {
  useDismissSuggestion,
  useGetMe,
  useUpdateMe,
} from "@/src/lib/api/players";
import { useActOnQuest, useListQuests } from "@/src/lib/api/quests";
import { STATUS_LABELS } from "@/src/lib/quest-display";
import { useAction } from "@/src/lib/use-action";
import { Check, ChevronDown, Send, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
              className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary text-on-primary"
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
        <div className="rounded-md border border-outline-variant p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-dashed border-outline text-muted">
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
              className={`flex items-center gap-3 rounded-md border p-2 ${
                badge.earned
                  ? "border-outline-variant"
                  : "border-outline-variant opacity-60"
              }`}
              key={badge.key}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm ${
                  badge.earned
                    ? "bg-primary text-on-primary"
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
                  <Check aria-label="Earned" className="h-4 w-4 text-success" />
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
  const [discoverable, setDiscoverable] = useState(player.discoverable);
  const [saved, setSaved] = useState(false);
  const options = player.hobby_options;
  const changed =
    discoverable !== player.discoverable ||
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
          data: { hobbies: selected, discoverable },
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
        Pick what you like to find people with shared interests. Only you see
        this unless you turn on suggestions below.
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
                  : "bg-surface dark:bg-surface-variant text-on-surface-variant ring-outline hover:ring-outline"
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
      <label className="mt-4 flex items-start gap-3 rounded-md bg-surface-variant p-3 text-sm">
        <input
          checked={discoverable}
          className="mt-0.5 h-4 w-4 accent-on-surface"
          onChange={(event) => {
            setSaved(false);
            setDiscoverable(event.target.checked);
          }}
          type="checkbox"
        />
        <span>
          <span className="font-semibold">
            Show me in connection suggestions
          </span>
          <span className="block text-muted">
            Other players who also turned this on see your name and the hobbies
            you share, and you see theirs.
          </span>
        </span>
      </label>
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
          Pick hobbies and turn on suggestions below to see players who share
          them.
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
                className="flex items-center gap-3 rounded-md bg-surface-variant p-3"
                key={suggestion.username}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-on-primary">
                  {suggestion.display_name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {suggestion.display_name}
                  </p>
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
              className="rounded-md bg-surface-variant p-3"
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

export default function ProfilePage() {
  const { data, isLoading, isError, refetch } = useGetMe();
  const player = data?.status === 200 ? data.data : undefined;
  const error = isError
    ? "Could not load your profile."
    : apiErrorMessage(data);

  return (
    <Page>
      <PageTitle eyebrow="Profile">{player?.display_name ?? "You"}</PageTitle>
      {isLoading ? (
        <LoadingState label="Loading profile..." />
      ) : error || !player ? (
        <ErrorState
          message={error ?? "Could not load your profile."}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <Achievements player={player} />
          <SuggestionsList player={player} />
          {/* Not keyed on the saved values: a remount after saving would hide "Saved". */}
          <HobbyEditor player={player} />
          <MySubmissions player={player} />
          <ShareButton
            className={`${buttonStyles.secondary} flex w-full items-center justify-center gap-2`}
            label={
              <>
                <Send aria-hidden className="h-4 w-4" /> Invite a friend to
                Campus Voyager
              </>
            }
            path="/"
            text="Join me on Campus Voyager: explore ETH and complete quests together!"
            title="Campus Voyager"
          />
        </>
      )}
    </Page>
  );
}
