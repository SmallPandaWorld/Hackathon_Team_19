import Link from "next/link";

export function LoadingState({ label }: { label: string }) {
  return (
    <p className="animate-pulse py-8 text-center text-slate-500" role="status">
      {label}
    </p>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="rounded-2xl bg-red-50 p-5 text-red-700 ring-1 ring-red-200"
      role="alert"
    >
      <p>{message}</p>
      {onRetry && (
        <button
          className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
          onClick={onRetry}
          type="button"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function BackLink() {
  return (
    <Link
      className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-500"
      href="/"
    >
      ← All quests
    </Link>
  );
}
