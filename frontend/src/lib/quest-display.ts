import type {
  QuestOutKind,
  QuestOutMeetupState,
  QuestOutStatus,
} from "@/src/lib/api/hackathon.schemas";

export const KIND_LABELS: Record<
  QuestOutKind,
  { label: string; icon: string }
> = {
  solo: { label: "Solo", icon: "🧭" },
  pair: { label: "With a partner", icon: "🤝" },
  quiz: { label: "Quiz", icon: "❓" },
  multi_step: { label: "Multi-step", icon: "🪜" },
  meetup: { label: "Meetup", icon: "📅" },
};

export const MEETUP_LABELS: Record<
  NonNullable<QuestOutMeetupState>,
  { label: string; className: string }
> = {
  upcoming: { label: "Upcoming", className: "bg-sky-100 text-sky-700" },
  live: {
    label: "Check-in open",
    className: "bg-emerald-100 text-emerald-700",
  },
  past: { label: "Over", className: "bg-slate-200 text-slate-600" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700" },
};

export const STATUS_LABELS: Record<
  QuestOutStatus,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-slate-200 text-slate-700" },
  pending_review: {
    label: "Waiting for review",
    className: "bg-amber-100 text-amber-800",
  },
  published: {
    label: "Published",
    className: "bg-emerald-100 text-emerald-700",
  },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700" },
  retired: { label: "Retired", className: "bg-slate-200 text-slate-500" },
};

// Meetups are on campus, so times are always shown in Zurich time,
// whatever the phone's time zone is.
const zurichFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const zurichTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatZurich(iso: string): string {
  return zurichFormat.format(new Date(iso));
}

export function formatMeetupTime(startsAt: string, endsAt: string): string {
  return `${zurichFormat.format(new Date(startsAt))}–${zurichTime.format(new Date(endsAt))} (Zurich time)`;
}
