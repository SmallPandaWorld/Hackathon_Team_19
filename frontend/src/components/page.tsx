import type { ReactNode } from "react";

// Shared building blocks: warm surfaces with thin outlines and soft
// corners, teal primary actions, light-gold highlights.

// Page shell. Bottom padding leaves room for the tab bar on mobile; on
// desktop the side padding clears the sidebar (left, 14rem) and the user
// rail (right, 18rem + 1.5rem inset).
export function Page({
  children,
  cornerTrails = true,
}: {
  children: ReactNode;
  cornerTrails?: boolean;
}) {
  return (
    <main className="page-canvas relative isolate min-h-screen bg-surface px-4 pb-28 pt-8 text-on-surface sm:px-6 sm:pt-12 lg:pb-16 lg:pl-[calc(14rem+2.5rem)] lg:pr-[calc(18rem+3rem)]">
      {cornerTrails && (
        <svg
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 h-screen w-screen opacity-60 dark:opacity-70"
          fill="none"
          preserveAspectRatio="none"
          viewBox="0 0 1000 1000"
        >
          <g
            stroke="var(--page-trail)"
            strokeDasharray="1 8"
            strokeLinecap="round"
            strokeWidth="2.5"
          >
            <path d="M902 -12c-35 42 57 37 80 83 22 44-45 57-4 94 17 15 24 30 21 47" />
            <path d="M-12 713c46 16 17 54 65 78 42 21 81 3 104 58 7 17 8 38 1 64" />
          </g>
          <g fill="var(--page-trail)">
            <circle cx="999" cy="211" r="2.5" />
            <circle cx="159" cy="930" r="2.5" />
          </g>
        </svg>
      )}
      <div className="relative z-10 mx-auto flex max-w-2xl flex-col gap-6 lg:max-w-4xl">
        {children}
      </div>
    </main>
  );
}

export function PageTitle({
  children,
  eyebrow,
}: {
  children: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header>
      {eyebrow && <p className="text-sm font-semibold text-link">{eyebrow}</p>}
      <h1 className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">
        {children}
      </h1>
    </header>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-outline-variant bg-surface p-5 shadow-card lg:p-6 dark:bg-surface-variant ${className}`}
    >
      {children}
    </section>
  );
}

// Small label for kinds and states.
export function Chip({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

export const buttonStyles = {
  // Solid teal: the main action on a screen.
  primary:
    "rounded-full bg-primary px-4 py-3 font-semibold text-on-primary transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50",
  // Thin outline with a tinted fill on hover.
  secondary:
    "rounded-full border border-outline bg-transparent px-4 py-3 font-semibold text-on-surface transition hover:border-on-surface-variant hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-surface-container",
  danger:
    "rounded-full border border-danger/60 bg-transparent px-4 py-3 font-semibold text-danger transition hover:border-danger hover:bg-danger-surface disabled:cursor-not-allowed disabled:opacity-50",
};

export const inputStyles =
  "mt-1 block w-full rounded-xl border border-outline-variant bg-surface px-3.5 py-2.5 text-base text-on-surface outline-none transition placeholder:text-muted hover:border-outline focus:border-on-surface-variant focus:ring-2 focus:ring-primary dark:bg-surface-variant";
