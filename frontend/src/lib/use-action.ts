"use client";

import { apiErrorMessage, NETWORK_ERROR } from "@/src/lib/api-error";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

type ApiResponse = { status: number; data: unknown };

/**
 * Runs an API call and keeps a user-readable error. Resolves to the response
 * on 2xx, or null after setting `error`. `refreshAll` refetches every query,
 * since one action can change quests, points, badges and the leaderboard.
 */
export function useAction() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T extends ApiResponse>(
      call: () => Promise<T>,
    ): Promise<T | null> => {
      setError(null);
      try {
        const response = await call();
        if (response.status < 200 || response.status >= 300) {
          setError(apiErrorMessage(response));
          return null;
        }
        return response;
      } catch {
        setError(NETWORK_ERROR);
        return null;
      }
    },
    [],
  );

  const refreshAll = useCallback(
    () => queryClient.invalidateQueries(),
    [queryClient],
  );

  return { error, setError, run, refreshAll };
}
