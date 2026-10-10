import type { ReactNode } from "react";

// Shared page shell. Bottom padding leaves room for the tab bar.
export function Page({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-28 pt-8 text-slate-900 sm:px-6 sm:pt-12">
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
      {eyebrow && (
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
          {eyebrow}
        </p>
      )}
      <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
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
      className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${className}`}
    >
      {children}
    </section>
  );
}

export function Chip({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

export const buttonStyles = {
  primary:
    "rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60",
  secondary:
    "rounded-xl bg-white px-4 py-3 font-semibold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60",
  danger:
    "rounded-xl bg-white px-4 py-3 font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60",
};

export const inputStyles =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
