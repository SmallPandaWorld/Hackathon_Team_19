"use client";

import {
  FriendSuggestions,
  SearchPlayers,
} from "@/src/components/friend-discovery";
import { FriendsCard } from "@/src/components/friends";
import { Page, PageTitle } from "@/src/components/page";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import { useGetMe } from "@/src/lib/api/players";

export default function FriendsPage() {
  const me = useGetMe();
  const player = me.data?.status === 200 ? me.data.data : undefined;
  const error = me.isError
    ? "Could not load your profile."
    : apiErrorMessage(me.data);

  return (
    <Page>
      <PageTitle eyebrow="Community">Friends</PageTitle>
      <SearchPlayers />
      <FriendsCard />
      {me.isLoading ? (
        <LoadingState label="Loading suggestions..." />
      ) : error || !player ? (
        <ErrorState
          message={error ?? "Could not load your profile."}
          onRetry={() => me.refetch()}
        />
      ) : (
        <FriendSuggestions player={player} />
      )}
    </Page>
  );
}
