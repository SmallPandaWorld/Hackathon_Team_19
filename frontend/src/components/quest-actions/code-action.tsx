"use client";

import { buttonStyles, inputStyles } from "@/src/components/page";
import { ErrorState } from "@/src/components/states";
import type {
  CompletionResult,
  QuestOut,
} from "@/src/lib/api/hackathon.schemas";
import { useQuestAction } from "@/src/lib/use-quest-action";
import { useSearchParams } from "next/navigation";
import { ScanQrCode } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CompletedNote, ResultBanner } from "./result-banner";
import { QrScanner } from "./qr-scanner";

function codeFromQr(value: string, questId: string) {
  const text = value.trim();
  const looksLikeUrl = /^(https?:\/\/|\/)/i.test(text);
  if (!looksLikeUrl) return text;

  let url: URL;
  try {
    url = new URL(text, window.location.origin);
  } catch {
    throw new Error("This QR code does not contain a valid quest link.");
  }

  if (url.pathname !== `/quests/${questId}`) {
    throw new Error("This QR code belongs to a different quest.");
  }

  const code = url.searchParams.get("code")?.trim();
  if (!code) throw new Error("This QR code does not contain a quest code.");
  return code;
}

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
  hint: "Scan the sign or enter its printed code. Each player earns points once.",
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
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const attemptedScan = useRef<string | null>(null);
  const { perform, pending, error } = useQuestAction(quest.id);

  const redeem = useCallback(
    async (value: string) => {
      const response = await perform({ type: "redeem", code: value.trim() });
      if (response?.completion) setResult(response.completion);
    },
    [perform],
  );

  const handleQrDecode = useCallback(
    (value: string) => {
      setScannerOpen(false);
      try {
        const scanned = codeFromQr(value, quest.id);
        setCode(scanned.toUpperCase());
        setScanError(null);
        void redeem(scanned);
      } catch (cause) {
        setScanError(
          cause instanceof Error
            ? cause.message
            : "This QR code could not be used for this quest.",
        );
      }
    },
    [quest.id, redeem],
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
    <div className="flex flex-col gap-3">
      {!scannerOpen && (
        <button
          aria-expanded={scannerOpen}
          className={`${buttonStyles.primary} flex w-full items-center justify-center gap-2`}
          disabled={!!pending}
          onClick={() => {
            setScanError(null);
            setScannerOpen(true);
          }}
          type="button"
        >
          <ScanQrCode aria-hidden className="h-4 w-4" />
          Scan QR code
        </button>
      )}

      {scannerOpen && (
        <QrScanner
          onClose={() => setScannerOpen(false)}
          onDecode={handleQrDecode}
        />
      )}
      {scanError && <ErrorState message={scanError} />}

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
          className={`${buttonStyles.secondary} w-full py-4 text-lg`}
          disabled={!!pending || !code.trim()}
          type="submit"
        >
          {pending ? "Checking code..." : copy.button}
        </button>
      </form>
      <p className="text-center text-xs text-muted">{copy.hint}</p>
      {error && <ErrorState message={error} />}
    </div>
  );
}
