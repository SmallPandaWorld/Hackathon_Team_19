import { KindIcon } from "@/src/components/icons";
import { Chip } from "@/src/components/page";
import type { QuestOut } from "@/src/lib/api/hackathon.schemas";
import {
  KIND_LABELS,
  MEETUP_LABELS,
  formatZurich,
} from "@/src/lib/quest-display";
import { Check } from "lucide-react";
import Link from "next/link";

function ProgressChip({ quest }: { quest: QuestOut }) {
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
  if (!quest.completed && done > 0) {
    return (
      <Chip className="bg-primary/20 text-on-surface">{`${done}/${steps.length} steps`}</Chip>
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

// Small calendar tile for meetup dates.
function DateTile({ iso }: { iso: string }) {
  const date = new Date(iso);
  return (
    <span className="flex h-12 w-12 shrink-0 flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface text-center leading-none text-on-surface dark:bg-surface-container">
      <span className="bg-primary py-0.5 text-[10px] font-bold uppercase text-on-primary">
        {tileMonth.format(date)}
      </span>
      <span className="flex flex-1 items-center justify-center text-lg font-bold">
        {tileDay.format(date)}
      </span>
    </span>
  );
}

// Completed quests render quieter, so open activities stand out.
export function QuestCard({ quest }: { quest: QuestOut }) {
  const done = quest.completed;
  const meetup = quest.meetup_state ? MEETUP_LABELS[quest.meetup_state] : null;

  return (
    <Link
      className={`flex items-center gap-4 rounded-2xl border p-4 transition active:scale-[0.99] ${
        done
          ? "border-outline-variant/70 bg-transparent hover:border-outline-variant"
          : "border-outline-variant bg-surface shadow-card hover:border-outline dark:bg-surface-variant"
      }`}
      href={`/quests/${quest.id}`}
    >
      {quest.kind === "meetup" && quest.starts_at && !done ? (
        <DateTile iso={quest.starts_at} />
      ) : (
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
            done
              ? "bg-success-surface text-success"
              : "bg-primary text-on-primary"
          }`}
        >
          {done ? (
            <Check
              aria-label="Completed"
              className="h-5 w-5"
              strokeWidth={2.5}
            />
          ) : (
            <KindIcon className="h-6 w-6" kind={quest.kind} />
          )}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold ${done ? "text-muted" : ""}`}>
          {quest.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <Chip className="border border-outline-variant text-on-surface-variant">
            {KIND_LABELS[quest.kind].label}
          </Chip>
          {meetup && !done && (
            <Chip className={meetup.className}>{meetup.label}</Chip>
          )}
          <ProgressChip quest={quest} />
        </span>
        {!done &&
          (quest.kind === "meetup" && quest.starts_at ? (
            <span className="mt-1 block truncate text-sm text-muted">
              {formatZurich(quest.starts_at)}
            </span>
          ) : (
            quest.location && (
              <span className="mt-1 block truncate text-sm text-muted">
                {quest.location}
              </span>
            )
          ))}
      </span>
      <span
        className={`shrink-0 rounded-md px-2 py-0.5 text-sm font-bold ${
          done ? "text-muted" : "bg-accent text-on-accent"
        }`}
      >
        +{quest.points}
      </span>
    </Link>
  );
}
