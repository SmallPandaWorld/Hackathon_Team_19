"use client";

import { buttonStyles } from "@/src/components/page";
import { useGetMe } from "@/src/lib/api/players";
import { Users } from "lucide-react";
import Link from "next/link";

// Partner-quest invitations from suggested players, part of GET /me. Polled,
// so an invite shows up while the app is open.
export function PairInvites() {
  const { data } = useGetMe({ query: { refetchInterval: 15000 } });
  const invites = data?.status === 200 ? data.data.invitations : [];
  if (invites.length === 0) return null;

  return (
    <section aria-label="Invitations" className="flex flex-col gap-2">
      {invites.map((invite) => (
        <div
          className="flex items-center gap-3 rounded-lg border-2 border-primary bg-primary/10 p-4"
          key={invite.code}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-primary text-on-primary">
            <Users aria-hidden className="h-5 w-5" />
          </span>
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{invite.host_name}</span> invited
            you to <span className="font-semibold">{invite.quest_title}</span>
          </p>
          <Link
            className={`${buttonStyles.primary} shrink-0 py-2 text-sm`}
            href={`/join/${invite.code}`}
          >
            Join
          </Link>
        </div>
      ))}
    </section>
  );
}
