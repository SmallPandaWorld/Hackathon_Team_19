"use client";

import { MaintainerOnly } from "@/src/components/admin/maintainer-only";
import {
  buttonStyles,
  Card,
  Chip,
  inputStyles,
  Page,
  PageTitle,
} from "@/src/components/page";
import { BackLink, ErrorState, LoadingState } from "@/src/components/states";
import {
  useAdminListCompletions,
  useAdminListQuests,
  useAdminListReports,
  useAdminResolveReport,
  useAdminReviewCompletion,
  useAdminUpdateQuest,
} from "@/src/lib/api/admin";
import type { AdminQuestOut } from "@/src/lib/api/hackathon.schemas";
import { STATUS_LABELS, formatZurich } from "@/src/lib/quest-display";
import { useAction } from "@/src/lib/use-action";
import Link from "next/link";
import { useState } from "react";
import { KindIcon } from "@/src/components/icons";
import { MapPin } from "lucide-react";

type Tab = "quests" | "ideas" | "reviews" | "reports";

function QuestsTab() {
  const { data, isLoading } = useAdminListQuests();
  const quests = data?.status === 200 ? data.data : [];
  if (isLoading) return <LoadingState label="Loading quests..." />;

  return (
    <div className="flex flex-col gap-3">
      <Link
        className={`${buttonStyles.primary} text-center`}
        href="/admin/quests/new"
      >
        + New quest
      </Link>
      {quests.map((quest) => (
        <Link
          className="flex items-center gap-3 rounded-lg bg-surface dark:bg-surface-variant p-4 ring-1 ring-outline-variant hover:ring-outline"
          href={`/admin/quests/${quest.id}`}
          key={quest.id}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-surface-variant dark:bg-surface-container">
            <KindIcon kind={quest.kind} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{quest.title}</span>
            <span className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">
              <Chip className={STATUS_LABELS[quest.status].className}>
                {STATUS_LABELS[quest.status].label}
              </Chip>
              <span>{quest.completion_count} completed</span>
              {quest.open_reports > 0 && (
                <Chip className="border border-danger text-danger">
                  {quest.open_reports} reports
                </Chip>
              )}
            </span>
          </span>
          <span className="shrink-0 rounded-sm bg-primary px-2 py-0.5 text-sm font-bold text-on-primary">
            +{quest.points}
          </span>
        </Link>
      ))}
    </div>
  );
}

function IdeaCard({ quest }: { quest: AdminQuestOut }) {
  const updateQuest = useAdminUpdateQuest();
  const { error, run, refreshAll } = useAction();
  const [note, setNote] = useState("");
  const blocked = quest.publish_problems.length > 0;

  async function decide(status: "published" | "rejected") {
    const call = () =>
      updateQuest.mutateAsync({
        questId: quest.id,
        data:
          status === "rejected"
            ? { status, review_note: note.trim() || null }
            : { status },
      });
    if (await run(call)) await refreshAll();
  }

  return (
    <Card>
      <p className="text-xs text-muted">
        Suggested by {quest.author_name ?? "unknown"}
      </p>
      <h3 className="mt-1 font-semibold">{quest.title}</h3>
      {quest.location && (
        <p className="flex items-center gap-1 text-sm text-muted">
          <MapPin aria-hidden className="h-4 w-4 shrink-0" />
          {quest.location}
        </p>
      )}
      <p className="mt-2 whitespace-pre-line text-sm text-on-surface-variant">
        {quest.description}
      </p>
      <p className="mt-2 text-sm text-muted">Reward: {quest.points} points</p>
      <label className="mt-3 block text-sm font-medium text-on-surface-variant">
        Note for the author{" "}
        <span className="font-normal text-muted">(shown if rejected)</span>
        <input
          className={inputStyles}
          onChange={(e) => setNote(e.target.value)}
          value={note}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={`${buttonStyles.primary} py-2 text-sm`}
          disabled={blocked || updateQuest.isPending}
          onClick={() => decide("published")}
          type="button"
        >
          Publish
        </button>
        <button
          className={`${buttonStyles.danger} py-2 text-sm`}
          disabled={updateQuest.isPending}
          onClick={() => decide("rejected")}
          type="button"
        >
          Reject
        </button>
        <Link
          className={`${buttonStyles.secondary} py-2 text-sm`}
          href={`/admin/quests/${quest.id}`}
        >
          Edit first
        </Link>
      </div>
      {blocked && (
        <p className="mt-2 text-sm text-warning">
          {quest.publish_problems.join(" ")}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}

function IdeasTab() {
  const { data, isLoading } = useAdminListQuests({
    status: "pending_review",
  });
  const ideas = data?.status === 200 ? data.data : [];
  if (isLoading) return <LoadingState label="Loading ideas..." />;
  if (ideas.length === 0)
    return (
      <p className="py-6 text-center text-muted">
        No quest ideas waiting for review.
      </p>
    );
  return (
    <div className="flex flex-col gap-3">
      {ideas.map((quest) => (
        <IdeaCard key={quest.id} quest={quest} />
      ))}
    </div>
  );
}

function ReviewsTab() {
  const { data, isLoading } = useAdminListCompletions();
  const review = useAdminReviewCompletion();
  const { error, run, refreshAll } = useAction();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const completions = data?.status === 200 ? data.data : [];

  async function decide(completionId: string, approve: boolean) {
    const note = notes[completionId]?.trim() || null;
    if (
      await run(() =>
        review.mutateAsync({ completionId, data: { approve, note } }),
      )
    )
      await refreshAll();
  }

  if (isLoading) return <LoadingState label="Loading completions..." />;
  if (completions.length === 0)
    return (
      <p className="py-6 text-center text-muted">Nothing waiting for review.</p>
    );

  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorState message={error} />}
      {completions.map((completion) => (
        <Card key={completion.id}>
          <p className="text-xs text-muted">
            {formatZurich(completion.completed_at)}
          </p>
          <h3 className="mt-1 font-semibold">
            {completion.player_name} · {completion.quest_title}
          </h3>
          <p className="mt-2 rounded bg-surface-variant p-3 text-sm text-on-surface-variant">
            {completion.note ? `“${completion.note}”` : "No description given."}
          </p>
          <label className="mt-3 block text-sm font-medium text-on-surface-variant">
            Reason{" "}
            <span className="font-normal text-muted">
              (shown to the player if rejected)
            </span>
            <input
              className={inputStyles}
              onChange={(e) =>
                setNotes((current) => ({
                  ...current,
                  [completion.id]: e.target.value,
                }))
              }
              value={notes[completion.id] ?? ""}
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              className={`${buttonStyles.primary} flex-1 py-2 text-sm`}
              disabled={review.isPending}
              onClick={() => decide(completion.id, true)}
              type="button"
            >
              Approve
            </button>
            <button
              className={`${buttonStyles.danger} flex-1 py-2 text-sm`}
              disabled={review.isPending}
              onClick={() => decide(completion.id, false)}
              type="button"
            >
              Reject
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ReportsTab() {
  const { data, isLoading } = useAdminListReports();
  const resolve = useAdminResolveReport();
  const { error, run, refreshAll } = useAction();
  const reports = data?.status === 200 ? data.data : [];

<<<<<<< HEAD
  async function decide(reportId: string, retireQuest: boolean) {
=======
  async function dismiss(reportId: number) {
>>>>>>> c29d76759120a245ef4eafc66eca2802f1120de5
    if (
      await run(() =>
        resolve.mutateAsync({ reportId, data: { retire_quest: false } }),
      )
    )
      await refreshAll();
  }

  if (isLoading) return <LoadingState label="Loading reports..." />;
  if (reports.length === 0)
    return <p className="py-6 text-center text-muted">No open reports.</p>;

  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorState message={error} />}
      {reports.map((report) => (
        <Card key={report.id}>
          <div className="flex items-start justify-between gap-2">
            <Link
              className="font-semibold text-link hover:underline"
              href={`/admin/quests/${report.quest_id}`}
            >
              {report.quest_title}
            </Link>
            <Chip className={STATUS_LABELS[report.quest_status].className}>
              {STATUS_LABELS[report.quest_status].label}
            </Chip>
          </div>
          <p className="mt-1 text-xs text-muted">
            Reported by {report.reporter_name} ·{" "}
            {formatZurich(report.created_at)}
          </p>
          <p className="mt-2 rounded bg-surface-variant p-3 text-sm text-on-surface-variant">
            “{report.reason}”
          </p>
          <div className="mt-3 flex gap-2">
            <Link
              className={`${buttonStyles.secondary} flex-1 py-2 text-center text-sm`}
              href={`/admin/quests/${report.quest_id}`}
            >
              Edit quest
            </Link>
            <button
              className={`${buttonStyles.danger} flex-1 py-2 text-sm`}
              disabled={resolve.isPending}
              onClick={() => dismiss(report.id)}
              type="button"
            >
              Dismiss report
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Dashboard() {
  const [tab, setTab] = useState<Tab>("quests");
  const ideas = useAdminListQuests({ status: "pending_review" });
  const completions = useAdminListCompletions();
  const reports = useAdminListReports();
  const counts: Record<Tab, number> = {
    quests: 0,
    ideas: ideas.data?.status === 200 ? ideas.data.data.length : 0,
    reviews:
      completions.data?.status === 200 ? completions.data.data.length : 0,
    reports: reports.data?.status === 200 ? reports.data.data.length : 0,
  };
  const tabs: { key: Tab; label: string }[] = [
    { key: "quests", label: "Quests" },
    { key: "ideas", label: "Ideas" },
    { key: "reviews", label: "Reviews" },
    { key: "reports", label: "Reports" },
  ];

  return (
    <>
      <div
        className="grid grid-cols-4 gap-1 rounded-md bg-surface-container p-1"
        role="tablist"
      >
        {tabs.map(({ key, label }) => (
          <button
            aria-selected={tab === key}
            className={`rounded px-2 py-2 text-sm font-semibold ${tab === key ? "bg-surface dark:bg-surface-variant text-link " : "text-muted"}`}
            key={key}
            onClick={() => setTab(key)}
            role="tab"
            type="button"
          >
            {label}
            {counts[key] > 0 && (
              <span className="ml-1 rounded-full bg-on-surface px-1.5 text-xs text-surface">
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>
      {tab === "quests" && <QuestsTab />}
      {tab === "ideas" && <IdeasTab />}
      {tab === "reviews" && <ReviewsTab />}
      {tab === "reports" && <ReportsTab />}
    </>
  );
}

export default function AdminPage() {
  return (
    <Page>
      <BackLink />
      <PageTitle eyebrow="Maintainers">Quest admin</PageTitle>
      <MaintainerOnly>
        <Dashboard />
      </MaintainerOnly>
    </Page>
  );
}
