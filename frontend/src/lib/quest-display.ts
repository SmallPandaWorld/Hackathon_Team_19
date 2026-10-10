import type {
  QuestOutKind,
  QuestOutMeetupState,
  QuestOutStatus,
} from "@/src/lib/api/hackathon.schemas";

// Icons for each kind live in src/components/icons.tsx.
export const KIND_LABELS: Record<QuestOutKind, { label: string }> = {
  solo: { label: "Solo" },
  pair: { label: "With a partner" },
  quiz: { label: "Quiz" },
  multi_step: { label: "Multi-step" },
  meetup: { label: "Meetup" },
};

export const MEETUP_LABELS: Record<
  NonNullable<QuestOutMeetupState>,
  { label: string; className: string }
> = {
  upcoming: { label: "Upcoming", className: "border border-link text-link" },
  live: {
    label: "● Check-in open",
    className: "border border-success text-success",
  },
  past: {
    label: "Over",
    className: "border border-outline-variant text-muted",
  },
  cancelled: {
    label: "Cancelled",
    className: "border border-danger text-danger",
  },
};

export const STATUS_LABELS: Record<
  QuestOutStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "border border-outline text-on-surface-variant",
  },
  pending_review: {
    label: "Waiting for review",
    className: "border border-warning text-warning",
  },
  published: {
    label: "Published",
    className: "border border-success text-success",
  },
  rejected: {
    label: "Rejected",
    className: "border border-danger text-danger",
  },
  retired: {
    label: "Retired",
    className: "border border-outline-variant text-muted",
  },
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
