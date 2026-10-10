"use client";

import { buttonStyles, Chip, inputStyles } from "@/src/components/page";
import { MeetupAction } from "@/src/components/quest-actions/meetup-action";
import { MeetupPhotoGallery } from "@/src/components/meetup-photo-gallery";
import { QuestPhotoGallery } from "@/src/components/quest-photo-gallery";
import { CodeAction } from "@/src/components/quest-actions/code-action";
import { PairAction } from "@/src/components/quest-actions/pair-action";
import { QuizAction } from "@/src/components/quest-actions/quiz-action";
import { QuestVotes } from "@/src/components/quest-votes";
import { SoloAction } from "@/src/components/quest-actions/solo-action";
import { StepsAction } from "@/src/components/quest-actions/steps-action";
import { BackLink, ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import type { QuestOut } from "@/src/lib/api/hackathon.schemas";
import { useGetQuest } from "@/src/lib/api/quests";
import { KIND_LABELS, STATUS_LABELS } from "@/src/lib/quest-display";
import { useQuestAction } from "@/src/lib/use-quest-action";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { KindIcon } from "@/src/components/icons";
import { MapPin } from "lucide-react";

// While the player hosts a pair session, poll the quest so the screen
// notices when the partner joins.
const PAIR_POLL_MS = 3000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function QuestAction({ quest }: { quest: QuestOut }) {
  if (quest.status !== "published") {
    return (
      <p className="rounded-2xl bg-surface-variant p-4 text-center text-sm text-muted">
        {quest.status === "retired"
          ? "This quest is no longer available. Your progress and points are kept."
          : "This quest isn't published, so it can't be played yet."}
      </p>
    );
  }
  switch (quest.kind) {
    case "pair":
      return <PairAction quest={quest} />;
    case "quiz":
      return <QuizAction quest={quest} />;
    case "multi_step":
      return <StepsAction quest={quest} />;
    case "meetup":
      return <MeetupAction quest={quest} />;
    case "solo":
      return quest.requires_code || quest.requires_password ? (
        <CodeAction quest={quest} />
      ) : (
        <SoloAction quest={quest} />
      );
    default:
      return <SoloAction quest={quest} />;
  }
}

function ReportQuest({ quest }: { quest: QuestOut }) {
  const { perform, pending, error } = useQuestAction(quest.id);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await perform({ type: "report", reason: reason.trim() })) {
      setOpen(false);
    }
  }

  if (quest.reported) {
    return (
      <p className="text-center text-xs text-muted">
        You reported this quest. Thanks, the maintainers will look at it.
      </p>
    );
  }
  if (!open) {
    return (
      <button
        className="self-center text-xs font-semibold text-muted hover:text-danger"
        onClick={() => setOpen(true)}
        type="button"
      >
        Report this quest
      </button>
    );
  }
  return (
    <form
      className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-card dark:bg-surface-variant"
      onSubmit={handleSubmit}
    >
      <label
        className="text-sm font-medium text-on-surface-variant"
        htmlFor="report-reason"
      >
        What&apos;s wrong with this quest?
        <textarea
          className={inputStyles}
          id="report-reason"
          maxLength={500}
          minLength={5}
          onChange={(event) => setReason(event.target.value)}
          required
          rows={3}
          value={reason}
        />
      </label>
      <div className="mt-3 flex gap-2">
        <button
          className={`${buttonStyles.danger} flex-1 py-2`}
          disabled={pending !== null || reason.trim().length < 5}
          type="submit"
        >
          Send report
        </button>
        <button
          className={`${buttonStyles.secondary} py-2`}
          onClick={() => setOpen(false)}
          type="button"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </form>
  );
}

export function QuestDetail() {
  const { id } = useParams<{ id: string }>();
  const validId = UUID_PATTERN.test(id);

  const { data, isLoading, isError, refetch } = useGetQuest(id, {
    query: {
      enabled: validId,
      refetchInterval: (query) => {
        const response = query.state.data;
        const session =
          response?.status === 200 ? response.data.pair_session : null;
        return session?.is_host && session.state === "waiting"
          ? PAIR_POLL_MS
          : false;
      },
    },
  });

  const quest = data?.status === 200 ? data.data : undefined;
  const questId = quest?.id;
  useEffect(() => {
    if (!questId || window.location.hash !== "#quest-photos") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("quest-photos")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [questId]);
  const loadError = !validId
    ? "Quest not found."
    : isError
      ? "Could not load this quest. Check your connection."
      : apiErrorMessage(data);

  if (validId && isLoading) {
    return <LoadingState label="Loading quest..." />;
  }

  if (loadError || !quest) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ErrorState
          message={loadError ?? "Could not load this quest."}
          onRetry={
            validId && data?.status !== 404 ? () => refetch() : undefined
          }
        />
      </div>
    );
  }

  const kind = KIND_LABELS[quest.kind];
  const hasPin = quest.latitude != null && quest.longitude != null;

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <article className="rounded-2xl border border-outline-variant bg-surface p-6 shadow-card dark:bg-surface-variant">
        <div className="flex flex-wrap items-center gap-2">
          <Chip className="border border-outline-variant text-on-surface-variant">
            <KindIcon className="mr-1 h-3.5 w-3.5" kind={quest.kind} />
            {kind.label}
          </Chip>
          {quest.status !== "published" && (
            <Chip className={STATUS_LABELS[quest.status].className}>
              {STATUS_LABELS[quest.status].label}
            </Chip>
          )}
        </div>
        <div className="mt-3 flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">{quest.title}</h1>
          <span className="shrink-0 rounded-lg bg-accent px-3 py-1 text-sm font-bold text-on-accent">
            +{quest.points}
          </span>
        </div>
        {quest.location && (
          <p className="mt-2 flex items-center gap-1 text-sm text-muted">
            <MapPin aria-hidden className="h-4 w-4 shrink-0" />
            {quest.location}
          </p>
        )}
        {hasPin && (
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link
              className="font-semibold text-link hover:underline"
              href={`/map#quest-${quest.id}`}
            >
              Show on map
            </Link>
            <a
              className="font-semibold text-link hover:underline"
              href={`https://www.google.com/maps/dir/?api=1&destination=${quest.latitude},${quest.longitude}&travelmode=walking`}
              rel="noreferrer"
              target="_blank"
            >
              Walking directions
            </a>
          </p>
        )}
        {quest.author_name && (
          <p className="mt-1 text-xs text-muted">
            Created by {quest.author_name}
          </p>
        )}
        <QuestVotes quest={quest} />
        {quest.description && (
          <>
            <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">
              Instructions
            </h2>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-on-surface-variant">
              {quest.description}
            </p>
          </>
        )}
      </article>

      <QuestAction quest={quest} />

      {quest.kind === "meetup" && <MeetupPhotoGallery questId={quest.id} />}
      {["meetup", "pair", "multi_step"].includes(quest.kind) && (
        <div className="scroll-mt-6" id="quest-photos">
          <QuestPhotoGallery questId={quest.id} />
        </div>
      )}

      {quest.status === "published" && <ReportQuest quest={quest} />}
    </div>
  );
}
