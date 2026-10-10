"use client";

import {
  buttonStyles,
  Card,
  Chip,
  Page,
  PageTitle,
} from "@/src/components/page";
import { ShareButton } from "@/src/components/share-button";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import {
  useDismissSuggestion,
  useListSuggestions,
} from "@/src/lib/api/connections";
import type { Player } from "@/src/lib/api/hackathon.schemas";
import {
  useGetMe,
  useListBadges,
  useListHobbies,
  useUpdateProfile,
} from "@/src/lib/api/players";
import { useListMySubmissions } from "@/src/lib/api/quests";
import { STATUS_LABELS } from "@/src/lib/quest-display";
import { useAction } from "@/src/lib/use-action";
import Link from "next/link";
import { useState } from "react";

function Badges() {
  const { data, isLoading } = useListBadges();
  const badges = data?.status === 200 ? data.data : [];
  if (isLoading) return <LoadingState label="Loading badges..." />;
  const earned = badges.filter((badge) => badge.earned).length;

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Badges</h2>
        <span className="text-sm text-slate-500">
          {earned}/{badges.length}
        </span>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {badges.map((badge) => (
          <li
            className={`rounded-xl p-3 text-center ring-1 ${
              badge.earned
                ? "bg-amber-50 ring-amber-200"
                : "bg-slate-50 opacity-60 ring-slate-200"
            }`}
            key={badge.key}
          >
            <p aria-hidden className="text-2xl">
              {badge.earned ? "🏅" : "🔒"}
            </p>
            <p className="mt-1 text-sm font-semibold">{badge.title}</p>
            <p className="text-xs text-slate-500">{badge.description}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function HobbyEditor({ player }: { player: Player }) {
  const hobbies = useListHobbies();
  const updateProfile = useUpdateProfile();
  const { error, run, refreshAll } = useAction();
  const [selected, setSelected] = useState<string[]>(player.hobbies);
  const [discoverable, setDiscoverable] = useState(player.discoverable);
  const [saved, setSaved] = useState(false);
  const options = hobbies.data?.status === 200 ? hobbies.data.data : [];
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
        updateProfile.mutateAsync({
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
      <p className="mt-1 text-sm text-slate-600">
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
                  ? "bg-indigo-600 text-white ring-indigo-600"
                  : "bg-white text-slate-700 ring-slate-300 hover:ring-indigo-300"
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
      <label className="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm">
        <input
          checked={discoverable}
          className="mt-0.5 h-4 w-4 accent-indigo-600"
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
          <span className="block text-slate-600">
            Other players who also turned this on see your name and the hobbies
            you share, and you see theirs.
          </span>
        </span>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          className={`${buttonStyles.primary} py-2`}
          disabled={!changed || updateProfile.isPending}
          onClick={save}
          type="button"
        >
          {updateProfile.isPending ? "Saving..." : "Save"}
        </button>
        {selected.length > 0 && (
          <button
            className="text-sm font-semibold text-slate-500 hover:text-red-600"
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
          <span className="text-sm text-emerald-700">Saved ✓</span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}

function SuggestionsList() {
  const { data, isLoading } = useListSuggestions();
  const dismiss = useDismissSuggestion();
  const { error, run, refreshAll } = useAction();
  const result = data?.status === 200 ? data.data : undefined;

  if (isLoading || !result) return null;

  return (
    <Card>
      <h2 className="font-semibold">People you might get along with</h2>
      {!result.enabled ? (
        <p className="mt-1 text-sm text-slate-600">
          Turn on suggestions above to see players who share your hobbies.
        </p>
      ) : result.suggestions.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">
          No matches yet. Add more hobbies or check back later as more players
          join.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-600">
            Say hi when you see them, or invite them to a partner quest!
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {result.suggestions.map((suggestion) => (
              <li
                className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"
                key={suggestion.player_id}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700">
                  {suggestion.display_name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {suggestion.display_name}
                  </p>
                  <p className="text-xs text-slate-600">
                    You both like {suggestion.shared_hobbies.join(", ")}
                  </p>
                </div>
                <button
                  className="shrink-0 text-xs font-semibold text-slate-500 hover:text-red-600"
                  disabled={dismiss.isPending}
                  onClick={async () => {
                    if (
                      await run(() =>
                        dismiss.mutateAsync({ playerId: suggestion.player_id }),
                      )
                    )
                      await refreshAll();
                  }}
                  type="button"
                >
                  Not interested
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}

function MySubmissions() {
  const { data } = useListMySubmissions();
  const submissions = data?.status === 200 ? data.data : [];

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">Your quest ideas</h2>
        <Link
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-500"
          href="/submit"
        >
          + Suggest a quest
        </Link>
      </div>
      {submissions.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">
          You haven&apos;t suggested any quests yet.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {submissions.map((submission) => (
            <li className="rounded-xl bg-slate-50 p-3" key={submission.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{submission.title}</p>
                <Chip className={STATUS_LABELS[submission.status].className}>
                  {STATUS_LABELS[submission.status].label}
                </Chip>
              </div>
              {submission.status === "rejected" && submission.review_note && (
                <p className="mt-1 text-sm text-red-700">
                  Reviewer: “{submission.review_note}”
                </p>
              )}
              {submission.status === "published" && (
                <Link
                  className="mt-1 inline-block text-sm font-semibold text-indigo-600"
                  href={`/quests/${submission.id}`}
                >
                  View quest →
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
          <Card className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total points</p>
              <p className="text-3xl font-bold text-indigo-600">
                {player.total_points}
              </p>
            </div>
            <Link
              className={`${buttonStyles.secondary} py-2 text-sm`}
              href="/leaderboard"
            >
              Ranking
            </Link>
          </Card>
          <Badges />
          {/* Not keyed on the saved values: a remount after saving would hide "Saved ✓". */}
          <HobbyEditor player={player} />
          <SuggestionsList />
          <MySubmissions />
          <ShareButton
            className={`${buttonStyles.secondary} w-full`}
            label="📨 Invite a friend to Campus Voyager"
            path="/"
            text="Join me on Campus Voyager: explore ETH and complete quests together!"
            title="Campus Voyager"
          />
        </>
      )}
    </Page>
  );
}
