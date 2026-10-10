"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  QuestAnswerResult,
  QuestAnswerSubmit,
  QuestRead,
  UserRead,
} from "@/src/lib/api/hackathon.schemas";
import {
  getNextQuestQuestsNextGet,
  submitQuestAnswerQuestsQuestIdAnswerPost,
} from "@/src/lib/api/quests";
import { getMeMeGet } from "@/src/lib/api/users";

type ApiError = {
  detail?: string;
};

function errorMessage(body: unknown, status: number): string {
  const detail = (body as ApiError | null)?.detail;
  return detail ?? `Request failed (${status}).`;
}

async function fetchNextQuest(): Promise<QuestRead | null> {
  const response = await getNextQuestQuestsNextGet();
  const status = Number(response.status);
  if (status === 404) return null;
  if (status >= 400) throw new Error(errorMessage(response.data, status));
  return response.data;
}

export default function Home() {
  const [user, setUser] = useState<UserRead | null>(null);
  const [quest, setQuest] = useState<QuestRead | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPage() {
      try {
        const [userResponse, nextQuest] = await Promise.all([
          getMeMeGet(),
          fetchNextQuest(),
        ]);
        if (userResponse.status !== 200) {
          throw new Error(
            errorMessage(userResponse.data, Number(userResponse.status)),
          );
        }
        const currentUser: UserRead = userResponse.data;
        if (active) {
          setUser(currentUser);
          setQuest(nextQuest);
        }
      } catch (error) {
        if (active) {
          setPageError(
            error instanceof Error ? error.message : "Unable to load the page.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPage();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quest || !answer.trim()) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const submission: QuestAnswerSubmit = { answer: answer.trim() };
      const response = await submitQuestAnswerQuestsQuestIdAnswerPost(
        quest.id,
        submission,
      );
      if (response.status !== 200) {
        throw new Error(errorMessage(response.data, Number(response.status)));
      }
      const result: QuestAnswerResult = response.data;
      setAnswer("");

      if (!result.correct) {
        setFeedback({
          kind: "error",
          message:
            "That answer isn’t correct. Try again or move to another quest.",
        });
        return;
      }

      setUser((currentUser) =>
        currentUser
          ? { ...currentUser, score: result.total_score }
          : currentUser,
      );
      setFeedback({
        kind: "success",
        message: `Correct! You earned ${result.points_awarded} points.`,
      });

      setLoadingNext(true);
      setQuest(await fetchNextQuest());
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Unable to submit answer.",
      });
    } finally {
      setSubmitting(false);
      setLoadingNext(false);
    }
  }

  async function handleNextQuest() {
    setLoadingNext(true);
    setFeedback(null);
    setAnswer("");
    try {
      setQuest(await fetchNextQuest());
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Unable to load a quest.",
      });
    } finally {
      setLoadingNext(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16 text-slate-900">
      <div className="mx-auto max-w-2xl space-y-6">
        <section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
            Björn&apos;s Quests
          </p>
          {loading ? (
            <p className="mt-3 text-slate-600">Loading your profile...</p>
          ) : pageError ? (
            <p className="mt-3 text-red-700" role="alert">
              {pageError}
            </p>
          ) : user ? (
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Hi, {user.name}!
                </h1>
                <p className="mt-1 text-sm text-slate-500">@{user.username}</p>
              </div>
              <p className="rounded-full bg-indigo-50 px-4 py-2 font-semibold text-indigo-700">
                Score: {user.score}
              </p>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold">Your next quest</h2>
          {loading || loadingNext ? (
            <p className="mt-4 text-slate-600">Loading quest...</p>
          ) : quest ? (
            <>
              <p className="mt-4 text-lg leading-relaxed">{quest.question}</p>
              <p className="mt-2 text-sm font-medium text-indigo-700">
                Worth {quest.points} points
              </p>

              <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
                <label
                  className="block text-sm font-medium text-slate-700"
                  htmlFor="quest-answer"
                >
                  Your answer
                </label>
                <input
                  autoComplete="off"
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  id="quest-answer"
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Type your answer"
                  value={answer}
                />
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={submitting || !answer.trim()}
                    type="submit"
                  >
                    {submitting ? "Checking..." : "Submit answer"}
                  </button>
                  <button
                    className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    disabled={submitting || loadingNext}
                    onClick={handleNextQuest}
                    type="button"
                  >
                    Try another quest
                  </button>
                </div>
              </form>
            </>
          ) : (
            <p className="mt-4 text-slate-600">
              No unsolved quests are available right now.
            </p>
          )}

          {feedback && (
            <p
              className={`mt-4 rounded-lg px-4 py-3 text-sm ${
                feedback.kind === "success"
                  ? "bg-green-50 text-green-800"
                  : "bg-red-50 text-red-800"
              }`}
              role="status"
            >
              {feedback.message}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
