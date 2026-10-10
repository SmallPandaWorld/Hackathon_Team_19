"use client";

import { buttonStyles, inputStyles } from "@/src/components/page";
import { useGetMe } from "@/src/lib/api/players";
import { KeyRound, Wrench } from "lucide-react";
import Link from "next/link";
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
  const { data } = useGetMe();
  const [open, setOpen] = useState(false);
  const isMaintainer = data?.status === 200 && data.data.is_maintainer;

  const adminLink = isMaintainer ? (
    <Link
      aria-label="Maintainer tools"
      className="flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-outline-variant text-[10px] font-semibold text-muted hover:border-outline hover:text-on-surface"
      href="/admin"
    >
      <Wrench aria-hidden className="h-4 w-4" />
      Admin
    </Link>
  ) : null;

  if (open) {
    return (
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-2xl border border-outline-variant p-3">
          <p className="text-sm text-muted">
            Enter the code your partner shows you:
          </p>
          <JoinCodeForm autoFocus id="join-code-compact" />
        </div>
        {adminLink}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        className={`${buttonStyles.secondary} flex ${
          isMaintainer ? "flex-1" : "w-full"
        } items-center justify-center gap-2 py-2.5 text-sm`}
        onClick={() => setOpen(true)}
        type="button"
      >
        <KeyRound aria-hidden className="h-4 w-4" />
        Join with code
      </button>
      {adminLink}
    </div>
  );
}
