"use client";

import { buttonStyles } from "@/src/components/page";
import { ErrorState } from "@/src/components/states";
import type {
  CompletionResult,
  QuestOut,
} from "@/src/lib/api/hackathon.schemas";
import { useQuestAction } from "@/src/lib/use-quest-action";
import { useState } from "react";
import { ResultBanner } from "./result-banner";
import { Check } from "lucide-react";

export function StepsAction({ quest }: { quest: QuestOut }) {
  const steps = quest.steps ?? [];
  const { perform, pending, error } = useQuestAction(quest.id);
  const [result, setResult] = useState<CompletionResult | null>(null);
  const nextStep = steps.find((step) => !step.done);
  const doneCount = steps.filter((step) => step.done).length;

  async function handleStep(stepId: string) {
    const response = await perform({ type: "step", step_id: stepId });
    if (response?.completion) setResult(response.completion);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-card dark:bg-surface-variant">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Steps</h2>
          <span className="text-sm text-muted">
            {doneCount}/{steps.length} done
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%`,
            }}
          />
        </div>
        <ol className="mt-4 flex flex-col gap-3">
          {steps.map((step) => {
            const isNext = step.id === nextStep?.id;
            return (
              <li
                className={`rounded-xl p-3 ring-1 ${
                  step.done
                    ? "bg-success-surface ring-success/30"
                    : isNext
                      ? "bg-surface-variant ring-outline dark:bg-surface-container"
                      : "ring-outline-variant opacity-60"
                }`}
                key={step.id}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      step.done
                        ? "bg-primary text-on-primary"
                        : "bg-surface dark:bg-surface-variant text-muted ring-1 ring-outline"
                    }`}
                  >
                    {step.done ? (
                      <Check
                        aria-label="Done"
                        className="h-4 w-4"
                        strokeWidth={3}
                      />
                    ) : (
                      step.position
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{step.title}</p>
                    {step.description && (
                      <p className="mt-0.5 text-sm text-muted">
                        {step.description}
                      </p>
                    )}
                  </div>
                </div>
                {isNext && !result && (
                  <button
                    className={`${buttonStyles.primary} mt-3 w-full py-2`}
                    disabled={pending !== null}
                    onClick={() => handleStep(step.id)}
                    type="button"
                  >
                    {pending
                      ? "Saving..."
                      : "Done with this step"}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs text-muted">
          Do the steps in order. You get the points when the last step is done.
        </p>
      </div>
      {result && <ResultBanner result={result} />}
      {!result && quest.completed && (
        <p className="rounded-2xl bg-success-surface p-4 text-center font-semibold text-success border border-success/30">
          All steps done. Quest completed!
        </p>
      )}
      {error && <ErrorState message={error} />}
    </div>
  );
}
