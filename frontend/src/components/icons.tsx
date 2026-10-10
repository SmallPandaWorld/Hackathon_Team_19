// One icon family (Lucide, 2px line icons) for the whole app.
import type { QuestOutKind } from "@/src/lib/api/hackathon.schemas";
import {
  Brain,
  CalendarCheck,
  CalendarDays,
  Compass,
  Flag,
  Footprints,
  Gem,
  Handshake,
  ListChecks,
  Route,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

export const KIND_ICONS: Record<QuestOutKind, LucideIcon> = {
  solo: Footprints,
  pair: Users,
  quiz: Brain,
  multi_step: ListChecks,
  meetup: CalendarDays,
};

// Every badge gets its own symbol.
export const BADGE_ICONS: Record<string, LucideIcon> = {
  first_quest: Flag,
  explorer: Compass,
  social: Handshake,
  quiz: Brain,
  tour: Route,
  meetup: CalendarCheck,
  century: Gem,
  first_friend: UserPlus,
};

export function KindIcon({
  kind,
  className = "h-5 w-5",
}: {
  kind: QuestOutKind;
  className?: string;
}) {
  const Icon = KIND_ICONS[kind];
  return <Icon aria-hidden className={className} strokeWidth={2} />;
}

export function BadgeIcon({
  badgeKey,
  className = "h-5 w-5",
}: {
  badgeKey: string;
  className?: string;
}) {
  const Icon = BADGE_ICONS[badgeKey] ?? Flag;
  return <Icon aria-hidden className={className} strokeWidth={2} />;
}
