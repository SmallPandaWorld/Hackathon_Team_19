"use client";

import { buttonStyles } from "@/src/components/page";
import { ErrorState } from "@/src/components/states";
import type { QuestOut, QuizResult } from "@/src/lib/api/hackathon.schemas";
import { useSubmitQuiz } from "@/src/lib/api/quests";
import { useAction } from "@/src/lib/use-action";
import { useState } from "react";
import { CompletedNote, ResultBanner } from "./result-banner";
import { Check, X } from "lucide-react";

export function QuizAction({ quest }: { quest: QuestOut }) {
  const questions = quest.questions ?? [];
  const submitQuiz = useSubmitQuiz();
  const { error, run, refreshAll } = useAction();
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    questions.map(() => null),
  );
  const [result, setResult] = useState<QuizResult | null>(null);
  const allAnswered = answers.every((answer) => answer !== null);

  async function handleSubmit() {
    const response = await run(() =>
      submitQuiz.mutateAsync({
        questId: quest.id,
        data: { answers: answers as number[] },
      }),
    );
    if (response?.status === 200) {
      setResult(response.data);
      if (response.data.passed) await refreshAll();
    }
  }

  function retry() {
    setResult(null);
    setAnswers(questions.map(() => null));
  }

  if (result?.passed && result.completion)
    return <ResultBanner result={result.completion} />;
  if (quest.completed && !result)
    return <CompletedNote completedAt={quest.completed_at} />;

  return (
    <div className="flex flex-col gap-4">
      {questions.map((question, index) => {
        const checked = result?.correct[index];
        return (
          <fieldset
            className={`rounded-lg bg-surface dark:bg-surface-variant p-5  ring-1 ${
              checked === undefined
                ? "ring-outline-variant"
                : checked
                  ? "ring-success/40"
                  : "ring-danger/40"
            }`}
            disabled={result !== null}
            key={question.id}
          >
            <legend className="sr-only">Question {index + 1}</legend>
            <p className="font-semibold">
              {index + 1}. {question.prompt}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {question.choices.map((choice, choiceIndex) => (
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded px-3 py-2 ring-1 ${
                    answers[index] === choiceIndex
                      ? "bg-surface-variant ring-outline"
                      : "ring-outline-variant"
                  }`}
                  key={choiceIndex}
                >
                  <input
                    checked={answers[index] === choiceIndex}
                    className="accent-on-surface"
                    name={`question-${question.id}`}
                    onChange={() =>
                      setAnswers((current) =>
                        current.map((a, i) => (i === index ? choiceIndex : a)),
                      )
                    }
                    type="radio"
                  />
                  {choice}
                </label>
              ))}
            </div>
            {checked !== undefined && (
              <p
                className={`mt-2 text-sm font-semibold ${checked ? "text-success" : "text-danger"}`}
              >
                {checked ? (
                  <span className="flex items-center gap-1">
                    <Check aria-hidden className="h-4 w-4" /> Correct
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <X aria-hidden className="h-4 w-4" /> Not quite
                  </span>
                )}
              </p>
            )}
          </fieldset>
        );
      })}

      {result && !result.passed ? (
        <div
          className="rounded-lg bg-warning-surface p-5 text-warning ring-1 ring-warning/40"
          role="status"
        >
          <p className="font-semibold">
            {result.correct_count} of {result.total} correct. You need all of
            them to pass.
          </p>
          <button
            className={`${buttonStyles.primary} mt-3 w-full py-2`}
            onClick={retry}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : (
        <button
          className={`${buttonStyles.primary} w-full py-4 text-lg`}
          disabled={!allAnswered || submitQuiz.isPending}
          onClick={handleSubmit}
          type="button"
        >
          {submitQuiz.isPending
            ? "Checking..."
            : allAnswered
              ? "Check my answers"
              : "Answer every question"}
        </button>
      )}
      {error && <ErrorState message={error} />}
    </div>
  );
}
