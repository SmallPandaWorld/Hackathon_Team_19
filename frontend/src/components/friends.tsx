"use client";

import { buttonStyles, Card } from "@/src/components/page";
import { ProfilePicture } from "@/src/components/profile-picture";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import type {
  FriendOut,
  FriendRequestOut,
  PublicPlayer,
} from "@/src/lib/api/hackathon.schemas";
import {
  useAcceptFriendRequest,
  useListFriends,
  useRemoveFriend,
  useSendFriendRequest,
} from "@/src/lib/api/friends";
import { useAction } from "@/src/lib/use-action";
import { Check, UserMinus, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

function profileHref(username: string): string {
  return `/profile?player=${encodeURIComponent(username)}`;
}

// One hook set shared by both views: every call returns the updated friends
// list, and `refreshAll` also refreshes the profile's `friend_status`.
function useFriendActions() {
  const send = useSendFriendRequest();
  const accept = useAcceptFriendRequest();
  const remove = useRemoveFriend();
  const { error, run, refreshAll } = useAction();
  const pending = send.isPending || accept.isPending || remove.isPending;

  async function act(call: () => Promise<{ status: number; data: unknown }>) {
    if (await run(call)) await refreshAll();
  }

  return {
    error,
    pending,
    sendRequest: (username: string) =>
      act(() => send.mutateAsync({ username })),
    acceptRequest: (username: string) =>
      act(() => accept.mutateAsync({ username })),
    remove: (username: string) => act(() => remove.mutateAsync({ username })),
  };
}

// Add / accept / cancel / remove, depending on where we stand with this player.
export function FriendActions({ player }: { player: PublicPlayer }) {
  const actions = useFriendActions();
  const name = player.display_name;
  const username = player.username;

  let body;
  switch (player.friend_status) {
    case "friends":
      body = (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 font-semibold text-success">
            <Check aria-hidden className="h-4 w-4" /> You are friends
          </span>
          <button
            className="text-sm font-semibold text-muted hover:text-danger"
            disabled={actions.pending}
            onClick={() => {
              if (window.confirm(`Remove ${name} from your friends?`))
                actions.remove(username);
            }}
            type="button"
          >
            Remove friend
          </button>
        </div>
      );
      break;
    case "outgoing":
      body = (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">Friend request sent</span>
          <button
            className="text-sm font-semibold text-muted hover:text-danger"
            disabled={actions.pending}
            onClick={() => actions.remove(username)}
            type="button"
          >
            Cancel request
          </button>
        </div>
      );
      break;
    case "incoming":
      body = (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            <span className="font-semibold">{name}</span> wants to be your
            friend.
          </p>
          <div className="flex gap-2">
            <button
              className={`${buttonStyles.primary} flex-1 py-2 text-sm`}
              disabled={actions.pending}
              onClick={() => actions.acceptRequest(username)}
              type="button"
            >
              Accept
            </button>
            <button
              className={`${buttonStyles.danger} flex-1 py-2 text-sm`}
              disabled={actions.pending}
              onClick={() => actions.remove(username)}
              type="button"
            >
              Decline
            </button>
          </div>
        </div>
      );
      break;
    default:
      body = (
        <button
          className={`${buttonStyles.primary} flex w-full items-center justify-center gap-2 py-2`}
          disabled={actions.pending}
          onClick={() => actions.sendRequest(username)}
          type="button"
        >
          <UserPlus aria-hidden className="h-4 w-4" /> Add friend
        </button>
      );
  }

  return (
    <div>
      {body}
      {actions.error && (
        <p className="mt-2 text-sm text-danger">{actions.error}</p>
      )}
    </div>
  );
}

function Avatar({ username, name }: { username: string; name: string }) {
  return <ProfilePicture displayName={name} size="small" username={username} />;
}

function RequestRow({
  request,
  children,
}: {
  request: FriendRequestOut;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-md bg-surface-variant p-3">
      <Avatar name={request.display_name} username={request.username} />
      <Link
        className="min-w-0 flex-1 truncate font-semibold hover:underline"
        href={profileHref(request.username)}
      >
        {request.display_name}
      </Link>
      {children}
    </li>
  );
}

function FriendRow({
  friend,
  onRemove,
  disabled,
}: {
  friend: FriendOut;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-md bg-surface-variant p-3">
      <Avatar name={friend.display_name} username={friend.username} />
      <Link
        className="min-w-0 flex-1 truncate font-semibold hover:underline"
        href={profileHref(friend.username)}
      >
        {friend.display_name}
      </Link>
      <span className="shrink-0 text-sm">
        <span className="font-bold">{friend.total_points}</span>{" "}
        <span className="text-xs text-muted">pts</span>
      </span>
      <button
        aria-label={`Remove ${friend.display_name} from friends`}
        className="shrink-0 text-muted hover:text-danger disabled:opacity-50"
        disabled={disabled}
        onClick={onRemove}
        type="button"
      >
        <UserMinus aria-hidden className="h-4 w-4" />
      </button>
    </li>
  );
}

// Friends, incoming and outgoing requests on the player's own profile.
export function FriendsCard() {
  const { data, isLoading, isError, refetch } = useListFriends();
  const actions = useFriendActions();
  const friends = data?.status === 200 ? data.data : undefined;
  const error = isError
    ? "Could not load your friends."
    : apiErrorMessage(data);

  return (
    <Card>
      <h2 className="flex items-center gap-2 font-semibold">
        <Users aria-hidden className="h-5 w-5" /> Friends
        {friends && friends.friends.length > 0 && (
          <span className="text-muted">({friends.friends.length})</span>
        )}
      </h2>

      {isLoading ? (
        <LoadingState label="Loading friends..." />
      ) : error || !friends ? (
        <div className="mt-3">
          <ErrorState
            message={error ?? "Could not load your friends."}
            onRetry={() => refetch()}
          />
        </div>
      ) : (
        <>
          {friends.incoming.length > 0 && (
            <section className="mt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Requests for you
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                {friends.incoming.map((request) => (
                  <RequestRow key={request.username} request={request}>
                    <button
                      className={`${buttonStyles.primary} shrink-0 px-3 py-1.5 text-sm`}
                      disabled={actions.pending}
                      onClick={() => actions.acceptRequest(request.username)}
                      type="button"
                    >
                      Accept
                    </button>
                    <button
                      className="shrink-0 text-xs font-semibold text-muted hover:text-danger"
                      disabled={actions.pending}
                      onClick={() => actions.remove(request.username)}
                      type="button"
                    >
                      Decline
                    </button>
                  </RequestRow>
                ))}
              </ul>
            </section>
          )}

          {friends.friends.length === 0 ? (
            <p className="mt-1 text-sm text-muted">
              No friends yet. Find players by name below or open a suggested
              player&apos;s profile and tap “Add friend”.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {friends.friends.map((friend) => (
                <FriendRow
                  disabled={actions.pending}
                  friend={friend}
                  key={friend.username}
                  onRemove={() => {
                    if (
                      window.confirm(
                        `Remove ${friend.display_name} from your friends?`,
                      )
                    )
                      actions.remove(friend.username);
                  }}
                />
              ))}
            </ul>
          )}

          {friends.outgoing.length > 0 && (
            <section className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Sent requests
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                {friends.outgoing.map((request) => (
                  <RequestRow key={request.username} request={request}>
                    <button
                      className="shrink-0 text-xs font-semibold text-muted hover:text-danger"
                      disabled={actions.pending}
                      onClick={() => actions.remove(request.username)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </RequestRow>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {actions.error && (
        <p className="mt-2 text-sm text-danger">{actions.error}</p>
      )}
    </Card>
  );
}
