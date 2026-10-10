"use client";

import {
  getGetQuestQueryKey,
  useActOnQuest,
  type ActOnQuestMutationVariables,
} from "@/src/lib/api/quests";
import { useAction } from "@/src/lib/use-action";
import { useQueryClient } from "@tanstack/react-query";

export type QuestAction = ActOnQuestMutationVariables["data"];
export type QuestActionType = QuestAction["type"];

/**
 * Runs one action on a quest (POST /quests/{id}/actions). The fresh quest in
 * the response goes straight into the quest's cache so the screen updates
 * without waiting; everything else (points, badges, lists) is refetched.
 * Resolves to the action result, or null after setting `error`.
 */
export function useQuestAction(questId: string) {
  const queryClient = useQueryClient();
  const actOnQuest = useActOnQuest();
  const { error, setError, run, refreshAll } = useAction();

  async function perform(action: QuestAction) {
    const response = await run(() =>
      actOnQuest.mutateAsync({ questId, data: action }),
    );
    if (response?.status !== 200) return null;
    queryClient.setQueryData(getGetQuestQueryKey(questId), {
      ...response,
      data: response.data.quest,
    });
    await refreshAll();
    return response.data;
  }

  // Which action is in flight, so each button can show its own spinner.
  const pending: QuestActionType | null = actOnQuest.isPending
    ? (actOnQuest.variables?.data.type ?? null)
    : null;

  return { perform, pending, error, setError };
}
