import Link from "next/link";

export function LoadingState({ label }: { label: string }) {
  return (
    <p className="animate-pulse py-8 text-center text-muted" role="status">
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
      className="rounded-lg bg-danger-surface p-5 text-danger ring-1 ring-danger/40"
      role="alert"
    >
      <p>{message}</p>
      {onRetry && (
        <button
          className="mt-3 rounded-sm border-2 border-danger px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10"
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
      className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline"
      href="/"
    >
      ← All quests
    </Link>
  );
}
