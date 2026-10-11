"use client";

import { buttonStyles } from "@/src/components/page";
import type { LucideIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";

type AppDialogProps = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  icon?: LucideIcon;
  busy?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
};

export function AppDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  icon: Icon,
  busy = false,
  onConfirm,
  onCancel,
}: AppDialogProps) {
  const dialogRef = useRef<HTMLElementTagNameMap["section"]>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement;
    (cancelButtonRef.current ?? confirmButtonRef.current)?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!busy) onCancel?.();
      return;
    }
    if (event.key !== "Tab") return;

    const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    );
    if (!buttons?.length) {
      event.preventDefault();
      return;
    }
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-transparent p-4 backdrop-blur-md"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel?.();
      }}
      onKeyDown={handleKeyDown}
      role="presentation"
      tabIndex={-1}
    >
      <section
        aria-describedby={messageId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-primary/30 bg-surface p-6 text-on-surface shadow-overlay dark:bg-surface-variant"
        ref={dialogRef}
        role={cancelLabel ? "alertdialog" : "dialog"}
      >
        {Icon ? (
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-link">
            <Icon aria-hidden className="h-6 w-6" />
          </div>
        ) : (
          <div
            aria-hidden
            className="mb-4 h-1.5 w-12 rounded-full bg-primary"
          />
        )}
        <h2 className="text-lg font-bold" id={titleId}>
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted" id={messageId}>
          {message}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {cancelLabel && onCancel && (
            <button
              className={`${buttonStyles.secondary} py-2`}
              disabled={busy}
              onClick={onCancel}
              ref={cancelButtonRef}
              type="button"
            >
              {cancelLabel}
            </button>
          )}
          <button
            className={`${tone === "danger" ? buttonStyles.danger : buttonStyles.primary} py-2`}
            disabled={busy}
            onClick={onConfirm}
            ref={confirmButtonRef}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
