"use client";

import { buttonStyles, inputStyles } from "@/src/components/page";
import { ErrorState } from "@/src/components/states";
import type {
  CompletionResult,
  QuestOut,
} from "@/src/lib/api/hackathon.schemas";
import { useQuestAction } from "@/src/lib/use-quest-action";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CompletedNote, ResultBanner } from "./result-banner";

export type CodeCopy = {
  label: string;
  placeholder: string;
  button: string;
  hint: string;
};

const SOLO_COPY: CodeCopy = {
  label: "Code from the quest sign",
  placeholder: "Enter the printed code",
  button: "Verify completion",
  hint: "You can also scan the sign’s QR code with your phone camera. Each player earns points once.",
};

export function CodeAction({
  quest,
  copy = SOLO_COPY,
}: {
  quest: QuestOut;
  copy?: CodeCopy;
}) {
  const scannedCode = useSearchParams().get("code");
  const [code, setCode] = useState(scannedCode ?? "");
  const [result, setResult] = useState<CompletionResult | null>(null);
  const attemptedScan = useRef<string | null>(null);
  const { perform, pending, error } = useQuestAction(quest.id);

  const redeem = useCallback(
    async (value: string) => {
      const response = await perform({ type: "redeem", code: value.trim() });
      if (response?.completion) setResult(response.completion);
    },
    [perform],
  );

  useEffect(() => {
    if (!scannedCode || attemptedScan.current === scannedCode) return;
    attemptedScan.current = scannedCode;
    setCode(scannedCode);
    void redeem(scannedCode);
  }, [redeem, scannedCode]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.trim() && !pending) void redeem(code);
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
        {copy.label}
        <input
          autoComplete="off"
          className={`${inputStyles} font-mono`}
          id="quest-code"
          maxLength={40}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder={copy.placeholder}
          required
          value={code}
        />
      </label>
      <button
        className={`${buttonStyles.primary} w-full py-4 text-lg`}
        disabled={!!pending || !code.trim()}
        type="submit"
      >
        {pending ? "Checking code..." : copy.button}
      </button>
      <p className="text-center text-xs text-muted">{copy.hint}</p>
      {error && <ErrorState message={error} />}
    </form>
  );
}
