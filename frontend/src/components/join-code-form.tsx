"use client";

import { buttonStyles, inputStyles } from "@/src/components/page";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

// Sends the player to /join/CODE, where the code is checked and joined.
export function JoinCodeForm() {
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
      <label className="sr-only" htmlFor="join-code">
        Partner code
      </label>
      <input
        autoCapitalize="characters"
        autoComplete="off"
        className={`${inputStyles} mt-0 font-mono uppercase tracking-widest`}
        id="join-code"
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
