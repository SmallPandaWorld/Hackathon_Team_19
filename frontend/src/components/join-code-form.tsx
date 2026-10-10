"use client";

import { buttonStyles, inputStyles } from "@/src/components/page";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

// Sends the player to /join/CODE, where the code is checked and joined.
export function JoinCodeForm({
  autoFocus = false,
  id = "join-code",
}: {
  autoFocus?: boolean;
  id?: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed) {
      router.push(`/join/${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <form className="flex gap-2" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor={id}>
        Partner code
      </label>
      <input
        autoCapitalize="characters"
        autoComplete="off"
        autoFocus={autoFocus}
        className={`${inputStyles} mt-0 font-mono uppercase tracking-widest`}
        id={id}
        maxLength={12}
        onChange={(event) => setCode(event.target.value)}
        placeholder="ABC123"
        value={code}
      />
      <button
        className={`${buttonStyles.primary} shrink-0 py-2`}
        disabled={!code.trim()}
        type="submit"
      >
        Join
      </button>
    </form>
  );
}

// Compact "Join with code" action that expands into the form.
export function JoinWithCode() {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-outline-variant p-3">
        <p className="text-sm text-muted">
          Enter the code your partner shows you:
        </p>
        <JoinCodeForm autoFocus id="join-code-compact" />
      </div>
    );
  }
  return (
    <button
      className={`${buttonStyles.secondary} flex w-full items-center justify-center gap-2 py-2.5 text-sm`}
      onClick={() => setOpen(true)}
      type="button"
    >
      <KeyRound aria-hidden className="h-4 w-4" />
      Join with code
    </button>
  );
}
