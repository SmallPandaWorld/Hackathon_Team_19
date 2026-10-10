"use client";

import {
  useAddUserUsersPost,
  useGetUsersUsersGet,
} from "@/src/lib/api/default";
import { useState, type FormEvent } from "react";

type UsersResponse = {
  users: string[];
  count: number;
};

function isUsersResponse(value: unknown): value is UsersResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as Record<string, unknown>;
  return (
    Array.isArray(response.users) &&
    response.users.every((user) => typeof user === "string") &&
    typeof response.count === "number"
  );
}

export default function Home() {
  const { data, isLoading, isError, refetch } = useGetUsersUsersGet();
  const addUser = useAddUserUsersPost();
  const [name, setName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const users = isUsersResponse(data?.data) ? data.data.users : [];

  async function handleAddUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setSubmitError("Please enter a name.");
      return;
    }

    setSubmitError(null);

    try {
      const response = await addUser.mutateAsync({ data: { name: trimmedName } });

      if (response.status !== 201) {
        setSubmitError("Unable to add this user.");
        return;
      }

      setName("");
      const refreshedUsers = await refetch();
      if (refreshedUsers.isError) {
        setSubmitError("User added, but the list could not be refreshed.");
      }
    } catch {
      setSubmitError("Unable to add this user. Please try again.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
          Hackathon users
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">User list</h1>
        <p className="mt-3 text-slate-600">
          Everyone currently registered for the hackathon.
        </p>

        <form
          className="mt-8 flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-end"
          onSubmit={handleAddUser}
        >
          <label className="flex-1 text-sm font-medium text-slate-700" htmlFor="user-name">
            Add a user
            <input
              className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-normal outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              id="user-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter a name"
              value={name}
            />
          </label>
          <button
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={addUser.isPending}
            type="submit"
          >
            {addUser.isPending ? "Adding..." : "Add user"}
          </button>
          {submitError && (
            <p className="basis-full text-sm text-red-600" role="alert">
              {submitError}
            </p>
          )}
        </form>

        <section className="mt-10 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {isLoading ? (
            <p className="text-slate-500">Loading users...</p>
          ) : isError || !isUsersResponse(data?.data) ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-red-600">Unable to load users.</p>
              <button
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                onClick={() => refetch()}
                type="button"
              >
                Try again
              </button>
            </div>
          ) : users.length === 0 ? (
            <p className="text-slate-500">No users have registered yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {users.map((user, index) => (
                <li className="flex items-center gap-3 py-4 first:pt-0 last:pb-0" key={`${user}-${index}`}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700">
                    {user.charAt(0).toUpperCase()}
                  </span>
                  <span className="font-medium">{user}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}