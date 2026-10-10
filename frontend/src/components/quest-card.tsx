import { Chip } from "@/src/components/page";
import type { QuestOut } from "@/src/lib/api/hackathon.schemas";
import {
  KIND_LABELS,
  MEETUP_LABELS,
  formatZurich,
} from "@/src/lib/quest-display";
import Link from "next/link";

function ProgressChip({ quest }: { quest: QuestOut }) {
  if (quest.completed) {
    return <Chip className="bg-emerald-100 text-emerald-700">Completed</Chip>;
  }
  if (quest.completion_status === "pending") {
    return <Chip className="bg-amber-100 text-amber-800">In review</Chip>;
  }
  if (quest.completion_status === "rejected") {
    return <Chip className="bg-red-100 text-red-700">Try again</Chip>;
  }
  const steps = quest.steps ?? [];
  const done = steps.filter((step) => step.done).length;
  if (done > 0) {
    return (
      <Chip className="bg-indigo-100 text-indigo-700">{`${done}/${steps.length} steps`}</Chip>
    );
  }
  return null;
}

export function QuestCard({ quest }: { quest: QuestOut }) {
  const kind = KIND_LABELS[quest.kind];
  const meetup = quest.meetup_state ? MEETUP_LABELS[quest.meetup_state] : null;

  return (
    <Link
      className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:ring-indigo-300 active:scale-[0.99]"
      href={`/quests/${quest.id}`}
    >
      <span
        aria-hidden
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${
          quest.completed ? "bg-emerald-100" : "bg-indigo-50"
        }`}
      >
        {quest.completed ? "✅" : kind.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{quest.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <Chip className="bg-slate-100 text-slate-600">{kind.label}</Chip>
          {meetup && <Chip className={meetup.className}>{meetup.label}</Chip>}
          <ProgressChip quest={quest} />
        </span>
        {quest.kind === "meetup" && quest.starts_at ? (
          <span className="mt-1 block truncate text-sm text-slate-500">
            {formatZurich(quest.starts_at)}
          </span>
        ) : (
          quest.location && (
            <span className="mt-1 block truncate text-sm text-slate-500">
              {quest.location}
            </span>
          )
        )}
      </span>
      <span className="shrink-0 font-bold text-indigo-600">
        +{quest.points}
      </span>
    </Link>
  );
}
