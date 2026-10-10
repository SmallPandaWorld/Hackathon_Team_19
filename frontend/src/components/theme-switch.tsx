"use client";

import { useTheme, type ThemeMode } from "@/src/lib/theme";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

const MODES: { mode: ThemeMode; label: string; icon: LucideIcon }[] = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "system", label: "System", icon: Monitor },
];

// Three-way pill switch for the colour theme. `compact` shows icons only
// (labels stay available to screen readers and as tooltips).
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useTheme();

  return (
    <div
      aria-label="Colour theme"
      className={`grid grid-cols-3 gap-1 rounded-full bg-surface-container p-1 ${
        compact ? "w-full" : "w-full max-w-sm"
      }`}
      role="radiogroup"
    >
      {MODES.map(({ mode: value, label, icon: Icon }) => {
        const selected = mode === value;
        return (
          <button
            aria-checked={selected}
            className={`flex items-center justify-center gap-1.5 rounded-full font-semibold transition ${
              compact ? "py-1.5 text-xs" : "px-3 py-2 text-sm"
            } ${
              selected
                ? "bg-primary text-on-primary shadow-card"
                : "text-muted hover:bg-surface hover:text-on-surface dark:hover:bg-surface-variant"
            }`}
            key={value}
            onClick={() => setMode(value)}
            role="radio"
            title={label}
            type="button"
          >
            <Icon aria-hidden className="h-4 w-4" />
            <span className={compact ? "sr-only" : ""}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
