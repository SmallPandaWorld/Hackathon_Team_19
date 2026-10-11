import type { QuestOut, QuestOutKind } from "@/src/lib/api/hackathon.schemas";
import { KIND_LABELS } from "@/src/lib/quest-display";

export type QuestSections = {
  available: QuestOut[];
  upcoming: QuestOut[];
  inReview: QuestOut[];
  completed: QuestOut[];
};

export type QuestSortOrder =
  | "recommended"
  | "votes"
  | "title"
  | "type"
  | "points_desc"
  | "points_asc"
  | "soonest";

export type QuestKindFilter = QuestOutKind | "all";

// Net vote score; quests that can't be voted on (maintainer quests) count as 0.
export function voteScore(quest: QuestOut): number {
  return quest.votes?.score ?? 0;
}

// Search quest names and apply the selected stable ordering.
export function filterAndSortQuests(
  quests: QuestOut[],
  query: string,
  sortOrder: QuestSortOrder,
  kindFilter: QuestKindFilter = "all",
): QuestOut[] {
  const term = query.trim().toLocaleLowerCase();
  const filtered = quests.filter(
    (quest) =>
      (kindFilter === "all" || quest.kind === kindFilter) &&
      (!term || quest.title.toLocaleLowerCase().includes(term)),
  );

  if (sortOrder === "recommended") return filtered;

  return filtered.sort((a, b) => {
    if (sortOrder === "title")
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    if (sortOrder === "type") {
      return (
        KIND_LABELS[a.kind].label.localeCompare(
          KIND_LABELS[b.kind].label,
          undefined,
          { sensitivity: "base" },
        ) || a.title.localeCompare(b.title)
      );
    }
    if (sortOrder === "votes")
      return voteScore(b) - voteScore(a) || a.title.localeCompare(b.title);
    if (sortOrder === "points_desc")
      return b.points - a.points || a.title.localeCompare(b.title);
    if (sortOrder === "points_asc")
      return a.points - b.points || a.title.localeCompare(b.title);

    const aStart = a.starts_at
      ? Date.parse(a.starts_at)
      : Number.POSITIVE_INFINITY;
    const bStart = b.starts_at
      ? Date.parse(b.starts_at)
      : Number.POSITIVE_INFINITY;
    return aStart - bStart || a.title.localeCompare(b.title);
  });
}

// Available now first, then scheduled events, then the player's history.
export function sortQuests(quests: QuestOut[]): QuestSections {
  const sections: QuestSections = {
    available: [],
    upcoming: [],
    inReview: [],
    completed: [],
  };
  for (const quest of quests) {
    if (quest.completed) sections.completed.push(quest);
    else if (quest.completion_status === "pending")
      sections.inReview.push(quest);
    else if (quest.kind === "meetup") {
      if (quest.meetup_state === "live") sections.available.push(quest);
      else if (
        quest.meetup_state === "upcoming" ||
        quest.meetup_state === "cancelled"
      )
        sections.upcoming.push(quest);
      // Past meetups the player missed are no longer actionable.
    } else sections.available.push(quest);
  }
  // Best-rated first; ties keep the backend's newest-first order (stable sort).
  sections.available.sort((a, b) => voteScore(b) - voteScore(a));
  sections.upcoming.sort((a, b) =>
    (a.starts_at ?? "").localeCompare(b.starts_at ?? ""),
  );
  return sections;
}
