"use client";

import { buttonStyles } from "@/src/components/page";
import { ErrorState } from "@/src/components/states";
import type {
  CompletionResult,
  QuestOut,
  QuizResult,
} from "@/src/lib/api/hackathon.schemas";
import { useQuestAction } from "@/src/lib/use-quest-action";
import { useState } from "react";
import { CompletedNote, ResultBanner } from "./result-banner";
import { Check, X } from "lucide-react";

export function QuizAction({ quest }: { quest: QuestOut }) {
  const questions = quest.questions ?? [];
  const { perform, pending, error } = useQuestAction(quest.id);
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    questions.map(() => null),
  );
  const [result, setResult] = useState<QuizResult | null>(null);
  const [completion, setCompletion] = useState<CompletionResult | null>(null);
  const allAnswered = answers.every((answer) => answer !== null);

  async function handleSubmit() {
    const response = await perform({
      type: "quiz",
      answers: answers as number[],
    });
    if (response?.quiz) {
      setResult(response.quiz);
      setCompletion(response.completion ?? null);
    }
  }

  function retry() {
    setResult(null);
    setCompletion(null);
    setAnswers(questions.map(() => null));
  }

  if (result?.passed && completion)
    return <ResultBanner result={completion} />;
  if (quest.completed && !result)
    return <CompletedNote completedAt={quest.completed_at} />;

  return (
    <div className="flex flex-col gap-4">
      {questions.map((question, index) => {
        const checked = result?.correct[index];
        return (
          <fieldset
            className={`rounded-2xl bg-surface p-5 shadow-card ring-1 dark:bg-surface-variant ${
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
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ring-1 ${
                    answers[index] === choiceIndex
                      ? "bg-primary/10 ring-primary"
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
          className="rounded-2xl bg-warning-surface p-5 text-warning border border-warning/30"
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
          disabled={!allAnswered || pending !== null}
          onClick={handleSubmit}
          type="button"
        >
          {pending
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
