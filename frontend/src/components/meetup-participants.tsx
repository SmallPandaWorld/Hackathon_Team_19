"use client";

import { profileHref } from "@/src/components/friends";
import { Card } from "@/src/components/page";
import { ProfilePicture } from "@/src/components/profile-picture";
import type { QuestOut } from "@/src/lib/api/hackathon.schemas";
import { useGetMe } from "@/src/lib/api/players";
import { Users } from "lucide-react";
import Link from "next/link";

// Attendees are visible to players who RSVP'd to an upcoming or live meetup.
// Only players who opted in to suggestions are named.
export function MeetupParticipants({ quest }: { quest: QuestOut }) {
  const me = useGetMe();
  const people = quest.participants;
  if (quest.kind !== "meetup" || !people) return null;

  const unnamed = Math.max(0, (quest.participant_count ?? 0) - people.length);
  const hidden = me.data?.status === 200 && !me.data.data.discoverable;

  return (
    <Card>
      <h2 className="flex items-center gap-2 font-semibold">
        <Users aria-hidden className="h-5 w-5" />
        Also coming
      </h2>
      {people.length === 0 && unnamed === 0 && (
        <p className="mt-1 text-sm text-muted">
          Nobody else has said they&apos;re coming yet.
        </p>
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
    </Card>
  );
}
