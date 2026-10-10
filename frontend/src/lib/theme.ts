"use client";

import {
  DARK_QUERY,
  STORAGE_KEY,
  THEME_COLORS,
} from "@/src/lib/theme-script";
import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark" | "system";

// Fallback when localStorage is blocked: the choice lasts until reload.
let unsavedMode: ThemeMode = "system";

function readMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return unsavedMode;
  }
}

function applyTheme(mode: ThemeMode) {
  const resolved =
    mode === "system"
      ? window.matchMedia(DARK_QUERY).matches
        ? "dark"
        : "light"
      : mode;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", THEME_COLORS[resolved]));
}

const listeners = new Set<() => void>();

function notify() {
  applyTheme(readMode());
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia(DARK_QUERY);
  // System changes matter only in "system" mode; notify() re-resolves.
  const onSystemChange = () => {
    if (readMode() === "system") notify();
  };
  // Another tab changed the setting.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) notify();
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

// The chosen theme mode, stored in localStorage under "theme".
export function useTheme(): {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
} {
  const mode = useSyncExternalStore(
    subscribe,
    readMode,
    (): ThemeMode => "system",
  );

  // React's dev-mode remount resets <html> attributes; re-apply before paint.
  // A no-op in production, where the inline script already set them.
  useLayoutEffect(() => {
    applyTheme(readMode());
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    unsavedMode = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked: readMode() falls back to unsavedMode.
    }
    notify();
  }, []);

  return { mode, setMode };
}
