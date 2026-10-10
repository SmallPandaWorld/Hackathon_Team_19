"use client";

import { buttonStyles, inputStyles } from "@/src/components/page";
import { ErrorState } from "@/src/components/states";
import type {
  CompletionResult,
  QuestOut,
} from "@/src/lib/api/hackathon.schemas";
import { useRedeemQuestCode } from "@/src/lib/api/quests";
import { useAction } from "@/src/lib/use-action";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CompletedNote, ResultBanner } from "./result-banner";

export function CodeAction({ quest }: { quest: QuestOut }) {
  const scannedCode = useSearchParams().get("code");
  const [code, setCode] = useState(scannedCode ?? "");
  const [result, setResult] = useState<CompletionResult | null>(null);
  const attemptedScan = useRef<string | null>(null);
  const { mutateAsync, isPending } = useRedeemQuestCode();
  const { error, run, refreshAll } = useAction();

  const redeem = useCallback(
    async (value: string) => {
      const response = await run(() =>
        mutateAsync({ questId: quest.id, data: { code: value.trim() } }),
      );
      if (response?.status === 200) {
        setResult(response.data);
        await refreshAll();
      }
    },
    [mutateAsync, quest.id, refreshAll, run],
  );

  useEffect(() => {
    if (!scannedCode || attemptedScan.current === scannedCode)
      return;
    attemptedScan.current = scannedCode;
    setCode(scannedCode);
    void redeem(scannedCode);
  }, [redeem, scannedCode]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.trim() && !isPending) void redeem(code);
  }

  if (result) return <ResultBanner result={result} />;
  if (quest.completed && !scannedCode)
    return <CompletedNote completedAt={quest.completed_at} />;

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <label
        className="text-sm font-medium text-on-surface-variant"
        htmlFor="quest-code"
      >
        Code from the quest sign
        <input
          autoComplete="off"
          className={`${inputStyles} font-mono`}
          id="quest-code"
          maxLength={40}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="Enter the printed code"
          required
          value={code}
        />
      </label>
      <button
        className={`${buttonStyles.primary} w-full py-4 text-lg`}
        disabled={isPending || !code.trim()}
        type="submit"
      >
        {isPending ? "Checking code..." : "Verify completion"}
      </button>
      <p className="text-center text-xs text-muted">
        You can also scan the sign’s QR code with your phone camera. Each player
        earns points once.
      </p>
      {error && <ErrorState message={error} />}
    </form>
  );
}
