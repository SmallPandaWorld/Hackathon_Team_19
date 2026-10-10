import { buttonStyles } from "@/src/components/page";
import type { CompletionResult } from "@/src/lib/api/hackathon.schemas";
import Link from "next/link";
import { Camera, Check, Hourglass, PartyPopper } from "lucide-react";
import { Confetti } from "./celebration";

export function ResultBanner({
  result,
  photoQuestId,
}: {
  result: CompletionResult;
  photoQuestId?: string;
}) {
  const pending = result.status === "pending";
  // Only a completion that just earned its points gets the party.
  const celebrate = !pending && !result.already_completed;
  return (
    <>
      {/* Outside the banner: its pop animation would trap a fixed overlay. */}
      {celebrate && <Confetti />}
      <div
        className={`rounded-2xl border p-5 ${
          pending
            ? "border-warning/30 bg-warning-surface text-warning"
            : "border-success/30 bg-success-surface text-success"
        } ${celebrate ? "quest-pop" : ""}`}
        role="status"
      >
        {pending ? (
          <p className="flex items-center gap-2 text-lg font-bold">
            <Hourglass aria-hidden className="h-5 w-5" /> Sent for review
          </p>
        ) : result.already_completed ? (
          <p className="font-semibold">
            You already completed this quest. No extra points this time.
          </p>
        ) : (
          <p className="flex items-center gap-2 text-lg font-bold">
            <PartyPopper aria-hidden className="h-5 w-5" /> Quest complete! +
            {result.points_awarded} points
          </p>
        )}
        <p className="mt-1 text-sm">
          {pending
            ? "A maintainer will check it. You get the points once it's approved."
            : `Your total: ${result.total_points} points`}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {photoQuestId && (
            <Link
              className={`${buttonStyles.primary} inline-flex items-center gap-2 py-2 text-sm`}
              href={`/quests/${photoQuestId}#quest-photos`}
            >
              <Camera aria-hidden className="h-4 w-4" /> Add a photo
            </Link>
          )}
          <Link
            className={`${photoQuestId ? buttonStyles.secondary : buttonStyles.primary} py-2 text-sm`}
            href="/"
          >
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
    </>
  );
}

export function CompletedNote({
  completedAt,
}: {
  completedAt?: string | null;
}) {
  return (
    <div className="rounded-2xl bg-success-surface p-5 text-success border border-success/30">
      <p className="flex items-center gap-2 font-semibold">
        <Check aria-hidden className="h-5 w-5" /> You completed this quest.
      </p>
      {completedAt && (
        <p className="mt-1 text-sm">
          on {new Date(completedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
