import { buttonStyles } from "@/src/components/page";
import type { CompletionResult } from "@/src/lib/api/hackathon.schemas";
import Link from "next/link";

export function ResultBanner({ result }: { result: CompletionResult }) {
  const pending = result.status === "pending";
  return (
    <div
      className={`rounded-lg p-5 ring-1 ${
        pending
          ? "bg-warning-surface text-warning ring-warning/40"
          : "bg-success-surface text-success ring-success/40"
      }`}
      role="status"
    >
      {pending ? (
        <p className="text-lg font-bold">Sent for review ⏳</p>
      ) : result.already_completed ? (
        <p className="font-semibold">
          You already completed this quest. No extra points this time.
        </p>
      ) : (
        <p className="text-lg font-bold">
          Quest complete! +{result.points_awarded} points 🎉
        </p>
      )}
      <p className="mt-1 text-sm">
        {pending
          ? "A maintainer will check it. You get the points once it's approved."
          : `Your total: ${result.total_points} points`}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link className={`${buttonStyles.primary} py-2 text-sm`} href="/">
          Back to quests
        </Link>
        <Link
          className={`${buttonStyles.secondary} py-2 text-sm`}
          href="/leaderboard"
        >
          See ranking
        </Link>
      </div>
    </div>
  );
}

export function CompletedNote({
  completedAt,
}: {
  completedAt?: string | null;
}) {
  return (
    <div className="rounded-lg bg-success-surface p-5 text-success ring-1 ring-success/40">
      <p className="font-semibold">✓ You completed this quest.</p>
      {completedAt && (
        <p className="mt-1 text-sm">
          on {new Date(completedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
