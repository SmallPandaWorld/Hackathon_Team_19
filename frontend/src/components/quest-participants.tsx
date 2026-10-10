"use client";

import { profileHref } from "@/src/components/friends";
import { Card } from "@/src/components/page";
import { ProfilePicture } from "@/src/components/profile-picture";
import type { QuestOut } from "@/src/lib/api/hackathon.schemas";
import { useGetMe } from "@/src/lib/api/players";
import { useQuestAction } from "@/src/lib/use-quest-action";
import { Users } from "lucide-react";
import Link from "next/link";

// Other players on the same quest. The backend only sends the list while
// the player is on the quest too, and only names players who opted in to
// suggestions; the rest are a number.
export function QuestParticipants({ quest }: { quest: QuestOut }) {
  const { perform, pending, error } = useQuestAction(quest.id);
  const me = useGetMe();
  const people = quest.participants;
  if (!people) return null;

  const meetup = quest.kind === "meetup";
  const unnamed = Math.max(0, (quest.participant_count ?? 0) - people.length);
  const hidden = me.data?.status === 200 && !me.data.data.discoverable;

  return (
    <Card>
      <h2 className="flex items-center gap-2 font-semibold">
        <Users aria-hidden className="h-5 w-5" />
        {meetup ? "Also coming" : "Also doing this quest"}
      </h2>
      {people.length === 0 && unnamed === 0 ? (
        <p className="mt-1 text-sm text-muted">
          {meetup
            ? "Nobody else has said they're coming yet."
            : "Nobody else has joined yet. You're the first!"}
        </p>
      ) : (
        quest.kind === "pair" && (
          <p className="mt-1 text-sm text-muted">
            Looking for a partner? Find one of them on campus.
          </p>
        )
      )}
      {people.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {people.map((person) => (
            <li
              className="flex items-center gap-3 rounded-xl bg-surface-variant p-3 dark:bg-surface-container"
              key={person.username}
            >
              <ProfilePicture
                displayName={person.display_name}
                size="small"
                username={person.username}
              />
              <div className="min-w-0 flex-1">
                <Link
                  className="block truncate font-semibold hover:underline"
                  href={profileHref(person.username)}
                >
                  {person.display_name}
                </Link>
                {person.shared_hobbies.length > 0 && (
                  <p className="text-xs text-muted">
                    You both like {person.shared_hobbies.join(", ")}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {unnamed > 0 && (
        <p className="mt-3 text-sm text-muted">
          {people.length > 0 ? "+ " : ""}
          {unnamed} {people.length > 0 ? "more" : "other"}{" "}
          {unnamed === 1 ? "player" : "players"} not shown by name.
        </p>
      )}
      {hidden && (
        <p className="mt-3 text-xs text-muted">
          Others don&apos;t see your name here.{" "}
          <Link
            className="font-semibold text-link hover:underline"
            href="/profile"
          >
            Turn on suggestions in your profile
          </Link>{" "}
          to appear in this list.
        </p>
      )}
      {!meetup && (
        <button
          className="mt-4 text-sm font-semibold text-muted hover:text-danger"
          disabled={pending !== null}
          onClick={() => perform({ type: "leave" })}
          type="button"
        >
          Leave this quest
        </button>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}
