"use client";

import { useEffect, useState } from "react";

type User = {
  username: string;
  name: string;
  score: number;
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    fetch("/api/me")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load your profile.");
        return response.json() as Promise<User>;
      })
      .then((profile) => {
        if (active) setUser(profile);
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16 text-slate-900">
      <section className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
          Björn&apos;s Quests
        </p>
        {user ? (
          <>
            <h1 className="mt-3 text-4xl font-bold tracking-tight">
              Hi, {user.name}!
            </h1>
            <p className="mt-3 text-slate-600">Username: {user.username}</p>
            <p className="mt-1 text-slate-600">Score: {user.score}</p>
          </>
        ) : error ? (
          <p className="mt-3 text-red-600">Unable to load your profile.</p>
        ) : (
          <p className="mt-3 text-slate-600">Loading your profile...</p>
        )}
      </section>
    </main>
  );
}
