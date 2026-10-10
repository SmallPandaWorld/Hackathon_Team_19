"use client";

import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import { useGetMe } from "@/src/lib/api/players";
import type { ReactNode } from "react";

// The backend enforces permissions; this only avoids showing tools that
// would fail for regular players.
export function MaintainerOnly({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useGetMe();
  const player = data?.status === 200 ? data.data : undefined;

  if (isLoading) return <LoadingState label="Checking permissions..." />;
  if (isError || !player) {
    return (
      <ErrorState
        message={apiErrorMessage(data) ?? "Could not load your profile."}
      />
    );
  }
  if (!player.is_maintainer) {
    return <ErrorState message="Only quest maintainers can open this page." />;
  }
  return <>{children}</>;
}
