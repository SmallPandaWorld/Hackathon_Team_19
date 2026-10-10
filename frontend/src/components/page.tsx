import type { ReactNode } from "react";

// Shared building blocks in the VIS style: flat surfaces with thin
// outlines, near-square corners, yellow primary actions.

// Page shell. Bottom padding leaves room for the tab bar.
export function Page({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-surface px-4 pb-28 pt-8 text-on-surface sm:px-6 sm:pt-12">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">{children}</div>
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
      {eyebrow && <p className="text-sm font-medium text-muted">{eyebrow}</p>}
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
      className={`rounded-lg border border-outline-variant bg-surface p-5 dark:bg-surface-variant ${className}`}
    >
      {children}
    </section>
  );
}

// Small label, like the category tags on VIS event cards.
export function Chip({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

export const buttonStyles = {
  // Solid yellow, like "More info" / "Login" on vis.ethz.ch.
  primary:
    "rounded-sm bg-primary px-4 py-3 font-semibold text-on-primary transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50",
  // Outlined, like the "Events" button next to it.
  secondary:
    "rounded-sm border-2 border-on-surface bg-transparent px-4 py-3 font-semibold text-on-surface transition hover:bg-on-surface/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-primary dark:hover:bg-primary/10",
  danger:
    "rounded-sm border-2 border-danger bg-transparent px-4 py-3 font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50",
};

export const inputStyles =
  "mt-1 block w-full rounded-sm border border-outline-variant bg-surface px-3 py-2 text-base text-on-surface outline-none transition placeholder:text-muted focus:border-on-surface focus:ring-2 focus:ring-primary dark:bg-surface-variant";
