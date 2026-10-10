import { QuestCard } from "@/src/components/quest-card";
import type { QuestOut } from "@/src/lib/api/hackathon.schemas";

export function QuestList({ quests }: { quests: QuestOut[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {quests.map((quest) => (
        <li key={quest.id}>
          <QuestCard quest={quest} />
        </li>
      ))}
    </ul>
  );
}
