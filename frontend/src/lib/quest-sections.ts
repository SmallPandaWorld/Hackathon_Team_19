import type { QuestOut } from "@/src/lib/api/hackathon.schemas";

export type QuestSections = {
  available: QuestOut[];
  upcoming: QuestOut[];
  inReview: QuestOut[];
  completed: QuestOut[];
};

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
  sections.upcoming.sort((a, b) =>
    (a.starts_at ?? "").localeCompare(b.starts_at ?? ""),
  );
  return sections;
}
