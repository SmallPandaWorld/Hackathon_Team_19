"use client";

import { buttonStyles } from "@/src/components/page";
import { ErrorState } from "@/src/components/states";
import type {
  CompletionResult,
  QuestOut,
} from "@/src/lib/api/hackathon.schemas";
import { useCompleteStep } from "@/src/lib/api/quests";
import { useAction } from "@/src/lib/use-action";
import { useState } from "react";
import { ResultBanner } from "./result-banner";

export function StepsAction({ quest }: { quest: QuestOut }) {
  const steps = quest.steps ?? [];
  const completeStep = useCompleteStep();
  const { error, run, refreshAll } = useAction();
  const [result, setResult] = useState<CompletionResult | null>(null);
  const nextStep = steps.find((step) => !step.done);
  const doneCount = steps.filter((step) => step.done).length;

  async function handleStep(stepId: number) {
    const response = await run(() =>
      completeStep.mutateAsync({ questId: quest.id, stepId }),
    );
    if (response?.status === 200) {
      if (response.data.completion) setResult(response.data.completion);
      await refreshAll();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Steps</h2>
          <span className="text-sm text-slate-500">
            {doneCount}/{steps.length} done
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
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
                    ? "bg-emerald-50 ring-emerald-200"
                    : isNext
                      ? "bg-indigo-50 ring-indigo-300"
                      : "ring-slate-200 opacity-60"
                }`}
                key={step.id}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      step.done
                        ? "bg-emerald-600 text-white"
                        : "bg-white text-slate-600 ring-1 ring-slate-300"
                    }`}
                  >
                    {step.done ? "✓" : step.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{step.title}</p>
                    {step.description && (
                      <p className="mt-0.5 text-sm text-slate-600">
                        {step.description}
                      </p>
                    )}
                  </div>
                </div>
                {isNext && !result && (
                  <button
                    className={`${buttonStyles.primary} mt-3 w-full py-2`}
                    disabled={completeStep.isPending}
                    onClick={() => handleStep(step.id)}
                    type="button"
                  >
                    {completeStep.isPending
                      ? "Saving..."
                      : "Done with this step"}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Do the steps in order. You get the points when the last step is done.
        </p>
      </div>
      {result && <ResultBanner result={result} />}
      {!result && quest.completed && (
        <p className="rounded-2xl bg-emerald-50 p-4 text-center font-semibold text-emerald-800 ring-1 ring-emerald-200">
          ✓ All steps done. Quest completed!
        </p>
      )}
      {error && <ErrorState message={error} />}
    </div>
  );
}
