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
    return (
      <Chip className="border border-success text-success">Completed</Chip>
    );
  }
  if (quest.completion_status === "pending") {
    return (
      <Chip className="border border-warning text-warning">In review</Chip>
    );
  }
  if (quest.completion_status === "rejected") {
    return <Chip className="border border-danger text-danger">Try again</Chip>;
  }
  const steps = quest.steps ?? [];
  const done = steps.filter((step) => step.done).length;
  if (done > 0) {
    return (
      <Chip className="border border-on-surface text-on-surface">{`${done}/${steps.length} steps`}</Chip>
    );
  }
  return null;
}

const tileMonth = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  month: "short",
});
const tileDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  day: "2-digit",
});

// Calendar tile like the event dates on vis.ethz.ch.
function DateTile({ iso }: { iso: string }) {
  const date = new Date(iso);
  return (
    <span className="flex h-12 w-12 shrink-0 flex-col overflow-hidden rounded-sm border border-on-surface text-center leading-none">
      <span className="border-b border-on-surface py-0.5 text-[10px] font-semibold uppercase">
        {tileMonth.format(date)}
      </span>
      <span className="flex flex-1 items-center justify-center text-lg font-bold">
        {tileDay.format(date)}
      </span>
    </span>
  );
}

export function QuestCard({ quest }: { quest: QuestOut }) {
  const kind = KIND_LABELS[quest.kind];
  const meetup = quest.meetup_state ? MEETUP_LABELS[quest.meetup_state] : null;

  return (
    <Link
      className="flex items-center gap-4 rounded-lg bg-surface dark:bg-surface-variant p-4 ring-1 ring-outline-variant transition hover:ring-outline active:scale-[0.99]"
      href={`/quests/${quest.id}`}
    >
      {quest.kind === "meetup" && quest.starts_at && !quest.completed ? (
        <DateTile iso={quest.starts_at} />
      ) : (
        <span
          aria-hidden
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-sm text-xl ${
            quest.completed
              ? "bg-on-surface font-bold text-surface"
              : "bg-surface-variant dark:bg-surface-container"
          }`}
        >
          {quest.completed ? "✓" : kind.icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{quest.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <Chip className="border border-outline-variant text-on-surface-variant">
            {kind.label}
          </Chip>
          {meetup && <Chip className={meetup.className}>{meetup.label}</Chip>}
          <ProgressChip quest={quest} />
        </span>
        {quest.kind === "meetup" && quest.starts_at ? (
          <span className="mt-1 block truncate text-sm text-muted">
            {formatZurich(quest.starts_at)}
          </span>
        ) : (
          quest.location && (
            <span className="mt-1 block truncate text-sm text-muted">
              {quest.location}
            </span>
          )
        )}
      </span>
      <span className="shrink-0 rounded-sm bg-primary px-2 py-0.5 text-sm font-bold text-on-primary">
        +{quest.points}
      </span>
    </Link>
  );
}
