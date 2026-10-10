import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonStyles } from "@/src/components/page";

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
      className="rounded-2xl bg-danger-surface p-5 text-danger border border-danger/30"
      role="alert"
    >
      <p>{message}</p>
      {onRetry && (
        <button
          className={`${buttonStyles.danger} mt-3 py-2 text-sm`}
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
      className={`${buttonStyles.secondary} inline-flex min-h-11 w-fit items-center gap-2 py-2 text-sm`}
      href="/"
    >
      <ArrowLeft aria-hidden className="h-4 w-4" /> All quests
    </Link>
  );
}
