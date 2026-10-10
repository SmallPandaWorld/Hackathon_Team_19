"use client";

import { CampusMap } from "@/src/components/campus-map";
import { MeetupPhotoManager } from "@/src/components/admin/meetup-photo-manager";
import { buttonStyles, Card, Chip, inputStyles } from "@/src/components/page";
import { ErrorState } from "@/src/components/states";
import { useAdminCreateQuest, useAdminUpdateQuest } from "@/src/lib/api/admin";
import type {
  AdminQuestIn,
  AdminQuestInKind,
  AdminQuestOut,
  AdminQuestPatch,
  QuizQuestionIn,
  StepIn,
} from "@/src/lib/api/hackathon.schemas";
import {
  formatZurich,
  KIND_LABELS,
  STATUS_LABELS,
} from "@/src/lib/quest-display";
import { useAction } from "@/src/lib/use-action";
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent } from "react";

type StatusChange = NonNullable<AdminQuestPatch["status"]>;

// <input type="datetime-local"> works in the browser's local time.
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

const KIND_HELP: Record<AdminQuestInKind, string> = {
  solo: "One player does it alone and confirms it (optionally reviewed by a maintainer).",
  pair: "Needs two players: one shows a code, the other enters it. Both get the points.",
  quiz: "Multiple-choice questions; all answers must be correct.",
  multi_step: "Ordered steps; points when the last step is done.",
  meetup: "A time and place; players check in while it's on.",
};

const STATUS_ACTIONS: Record<
  string,
  { status: StatusChange; label: string; style: string }[]
> = {
  draft: [
    { status: "published", label: "Publish", style: buttonStyles.primary },
  ],
  pending_review: [
    { status: "published", label: "Publish", style: buttonStyles.primary },
    { status: "rejected", label: "Reject", style: buttonStyles.danger },
  ],
  published: [
    { status: "draft", label: "Unpublish", style: buttonStyles.secondary },
    { status: "retired", label: "Retire", style: buttonStyles.danger },
  ],
  rejected: [
    { status: "draft", label: "Move to drafts", style: buttonStyles.secondary },
  ],
  retired: [
    {
      status: "published",
      label: "Publish again",
      style: buttonStyles.primary,
    },
  ],
};

export function QuestEditor({ quest }: { quest?: AdminQuestOut }) {
  const router = useRouter();
  const createQuest = useAdminCreateQuest();
  const updateQuest = useAdminUpdateQuest();
  const { error, run, refreshAll } = useAction();
  const [saved, setSaved] = useState(false);

  const [title, setTitle] = useState(quest?.title ?? "");
  const [description, setDescription] = useState(quest?.description ?? "");
  const [location, setLocation] = useState(quest?.location ?? "");
  const [points, setPoints] = useState(String(quest?.points ?? 10));
  const [kind, setKind] = useState<AdminQuestInKind>(quest?.kind ?? "solo");
  const [requiresApproval, setRequiresApproval] = useState(
    quest?.requires_approval ?? false,
  );
  const [requiresCode, setRequiresCode] = useState(
    quest?.requires_code ?? false,
  );
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    quest?.latitude != null && quest?.longitude != null
      ? { lat: quest.latitude, lng: quest.longitude }
      : null,
  );
  const [startsAt, setStartsAt] = useState(toLocalInput(quest?.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(quest?.ends_at));
  const [cancelled, setCancelled] = useState(quest?.cancelled ?? false);
  const [steps, setSteps] = useState<StepIn[]>(
    quest?.steps?.length
      ? quest.steps
      : [
          { title: "", description: "" },
          { title: "", description: "" },
        ],
  );
  const [questions, setQuestions] = useState<QuizQuestionIn[]>(
    quest?.questions?.length
      ? quest.questions.map(({ prompt, choices, correct_index }) => ({
          prompt,
          choices,
          correct_index,
        }))
      : [{ prompt: "", choices: ["", ""], correct_index: 0 }],
  );

  function edited<T>(setter: (value: T) => void) {
    return (value: T) => {
      setSaved(false);
      setter(value);
    };
  }

  function buildInput(): AdminQuestIn {
    return {
      title: title.trim(),
      description: description.trim(),
      location: location.trim() || null,
      points: Number(points) || 0,
      kind,
      requires_approval: kind === "solo" && requiresApproval,
      requires_code: (kind === "solo" || kind === "meetup") && requiresCode,
      latitude: pin?.lat ?? null,
      longitude: pin?.lng ?? null,
      starts_at: kind === "meetup" ? fromLocalInput(startsAt) : null,
      ends_at: kind === "meetup" ? fromLocalInput(endsAt) : null,
      cancelled: kind === "meetup" && cancelled,
      steps: kind === "multi_step" ? steps : [],
      questions: kind === "quiz" ? questions : [],
    };
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (quest) {
      if (
        await run(() =>
          updateQuest.mutateAsync({ questId: quest.id, data: buildInput() }),
        )
      ) {
        setSaved(true);
        await refreshAll();
      }
    } else {
      const response = await run(() =>
        createQuest.mutateAsync({ data: buildInput() }),
      );
      if (response?.status === 201) {
        await refreshAll();
        router.replace(`/admin/quests/${response.data.id}`);
      }
    }
  }

  async function changeStatus(status: StatusChange) {
    if (!quest) return;
    const data: AdminQuestPatch = { status };
    if (status === "rejected") {
      data.review_note =
        window.prompt("Why is this idea rejected? (shown to the author)") ??
        null;
    }
    if (
      status === "retired" &&
      !window.confirm(
        "Retire this quest? Players keep their points, but nobody can play it anymore.",
      )
    ) {
      return;
    }
    if (await run(() => updateQuest.mutateAsync({ questId: quest.id, data }))) {
      await refreshAll();
    }
  }

  const saving = createQuest.isPending || updateQuest.isPending;

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSave}>
      {quest && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Chip className={STATUS_LABELS[quest.status].className}>
              {STATUS_LABELS[quest.status].label}
            </Chip>
            <span className="text-sm text-muted">
              {quest.completion_count} completed · {quest.open_reports} open
              reports
            </span>
          </div>
          {quest.author_name && (
            <p className="mt-2 text-sm text-muted">
              Suggested by {quest.author_name}
            </p>
          )}
          {quest.publish_problems.length > 0 && (
            <ul className="mt-3 list-disc rounded-xl bg-warning-surface py-2 pl-8 pr-3 text-sm text-warning">
              {quest.publish_problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUS_ACTIONS[quest.status].map((action) => (
              <button
                className={`${action.style} py-2 text-sm`}
                disabled={
                  updateQuest.isPending ||
                  (action.status === "published" &&
                    quest.publish_problems.length > 0)
                }
                key={action.status}
                onClick={() => changeStatus(action.status)}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Save your edits before publishing.
          </p>
        </Card>
      )}

      {quest?.requires_code && (
        <Card className="flex flex-col gap-2">
          <h2 className="font-semibold">Printed verification</h2>
          <p className="text-sm text-muted">
            This code stays the same when you edit or restart the quest.
          </p>
          <code className="text-xl font-bold tracking-widest">
            {quest.verification_code}
          </code>
          <Link
            className="font-semibold text-link hover:underline"
            href={`/admin/quests/${quest.id}/print`}
          >
            Open printable QR sign
          </Link>
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <label className="text-sm font-medium text-on-surface-variant">
          Type
          <select
            className={inputStyles}
            disabled={(quest?.completion_count ?? 0) > 0}
            onChange={(e) =>
              edited(setKind)(e.target.value as AdminQuestInKind)
            }
            value={kind}
          >
            {(Object.keys(KIND_LABELS) as AdminQuestInKind[]).map((key) => (
              <option key={key} value={key}>
                {KIND_LABELS[key].label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs font-normal text-muted">
            {KIND_HELP[kind]}
          </span>
        </label>
        <label className="text-sm font-medium text-on-surface-variant">
          Title
          <input
            className={inputStyles}
            maxLength={120}
            onChange={(e) => edited(setTitle)(e.target.value)}
            required
            value={title}
          />
        </label>
        <label className="text-sm font-medium text-on-surface-variant">
          Instructions
          <textarea
            className={inputStyles}
            maxLength={2000}
            onChange={(e) => edited(setDescription)(e.target.value)}
            required
            rows={5}
            value={description}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <label className="text-sm font-medium text-on-surface-variant">
            Location <span className="font-normal text-muted">(optional)</span>
            <input
              className={inputStyles}
              maxLength={255}
              onChange={(e) => edited(setLocation)(e.target.value)}
              value={location}
            />
          </label>
          <label className="text-sm font-medium text-on-surface-variant">
            Points
            <input
              className={inputStyles}
              max={1000}
              min={0}
              onChange={(e) => edited(setPoints)(e.target.value)}
              required
              type="number"
              value={points}
            />
          </label>
        </div>
        {quest && quest.completion_count > 0 && (
          <p className="text-xs text-muted">
            Changing points only affects future completions.
          </p>
        )}
        {kind === "meetup" && (
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="font-semibold">Check-in method</legend>
            <label className="flex items-center gap-2">
              <input
                checked={!requiresCode}
                onChange={() => edited(setRequiresCode)(false)}
                name="check-in-method"
                type="radio"
              />
              Players tap “I’m here” while the meetup is live
            </label>
            <label className="flex items-center gap-2">
              <input
                checked={requiresCode}
                onChange={() => edited(setRequiresCode)(true)}
                name="check-in-method"
                type="radio"
              />
              Players scan the organiser’s QR code
            </label>
            <p className="text-xs text-muted">
              Print the QR sign after saving and bring it to the meetup. The
              code only works during the check-in window.
            </p>
          </fieldset>
        )}
        {kind === "solo" && (
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="font-semibold">Completion method</legend>
            <label className="flex items-center gap-2">
              <input
                checked={!requiresApproval && !requiresCode}
                onChange={() => {
                  edited(setRequiresApproval)(false);
                  edited(setRequiresCode)(false);
                }}
                name="completion-method"
                type="radio"
              />
              Player confirms completion
            </label>
            <label className="flex items-center gap-2">
              <input
                checked={requiresCode}
                onChange={() => {
                  edited(setRequiresCode)(true);
                  edited(setRequiresApproval)(false);
                }}
                name="completion-method"
                type="radio"
              />
              Printed code or QR
            </label>
            <label className="flex items-center gap-2">
              <input
                checked={requiresApproval}
                onChange={() => {
                  edited(setRequiresApproval)(true);
                  edited(setRequiresCode)(false);
                }}
                name="completion-method"
                type="radio"
              />
              Maintainer approval
            </label>
            <p className="text-xs text-muted">
              For code quests, print the QR sign after saving. Players can scan
              it with a phone camera or type its code.
            </p>
          </fieldset>
        )}
      </Card>

      {kind === "meetup" && (
        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Time</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-on-surface-variant">
              Starts
              <input
                className={inputStyles}
                onChange={(e) => edited(setStartsAt)(e.target.value)}
                type="datetime-local"
                value={startsAt}
              />
            </label>
            <label className="text-sm font-medium text-on-surface-variant">
              Ends
              <input
                className={inputStyles}
                onChange={(e) => edited(setEndsAt)(e.target.value)}
                type="datetime-local"
                value={endsAt}
              />
            </label>
          </div>
          {startsAt && endsAt && (
            <p className="text-sm text-muted">
              Players see: {formatZurich(new Date(startsAt).toISOString())} –{" "}
              {formatZurich(new Date(endsAt).toISOString())} (Zurich time)
            </p>
          )}
          <label className="flex items-center gap-3 text-sm">
            <input
              checked={cancelled}
              className="h-4 w-4 accent-on-surface"
              onChange={(e) => edited(setCancelled)(e.target.checked)}
              type="checkbox"
            />
            <span className="font-semibold text-danger">
              Meetup is cancelled
            </span>
          </label>
        </Card>
      )}
      {kind === "meetup" && quest?.kind === "meetup" && (
        <MeetupPhotoManager questId={quest.id} />
      )}

      {kind === "multi_step" && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Steps (in order)</h2>
          {quest && quest.completion_count > 0 && (
            <p className="text-xs text-muted">
              Once players have progress you can reword steps, but not add or
              remove them.
            </p>
          )}
          {steps.map((step, index) => (
            <div
              className="rounded-xl bg-surface-variant p-3 dark:bg-surface-container"
              key={index}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Step {index + 1}</span>
                <button
                  className="text-xs font-semibold text-muted hover:text-danger disabled:opacity-40"
                  disabled={steps.length <= 2}
                  onClick={() =>
                    edited(setSteps)(steps.filter((_, i) => i !== index))
                  }
                  type="button"
                >
                  Remove
                </button>
              </div>
              <input
                aria-label={`Step ${index + 1} title`}
                className={inputStyles}
                onChange={(e) =>
                  edited(setSteps)(
                    steps.map((s, i) =>
                      i === index ? { ...s, title: e.target.value } : s,
                    ),
                  )
                }
                placeholder="Title"
                required
                value={step.title}
              />
              <input
                aria-label={`Step ${index + 1} details`}
                className={inputStyles}
                onChange={(e) =>
                  edited(setSteps)(
                    steps.map((s, i) =>
                      i === index ? { ...s, description: e.target.value } : s,
                    ),
                  )
                }
                placeholder="Details (optional)"
                value={step.description ?? ""}
              />
            </div>
          ))}
          <button
            className={`${buttonStyles.secondary} py-2 text-sm`}
            disabled={steps.length >= 20}
            onClick={() =>
              edited(setSteps)([...steps, { title: "", description: "" }])
            }
            type="button"
          >
            + Add step
          </button>
        </Card>
      )}

      {kind === "quiz" && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Questions</h2>
          {questions.map((question, qIndex) => {
            const update = (changes: Partial<QuizQuestionIn>) =>
              edited(setQuestions)(
                questions.map((q, i) =>
                  i === qIndex ? { ...q, ...changes } : q,
                ),
              );
            return (
              <div
                className="rounded-xl bg-surface-variant p-3 dark:bg-surface-container"
                key={qIndex}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    Question {qIndex + 1}
                  </span>
                  <button
                    className="text-xs font-semibold text-muted hover:text-danger disabled:opacity-40"
                    disabled={questions.length <= 1}
                    onClick={() =>
                      edited(setQuestions)(
                        questions.filter((_, i) => i !== qIndex),
                      )
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </div>
                <input
                  aria-label={`Question ${qIndex + 1}`}
                  className={inputStyles}
                  onChange={(e) => update({ prompt: e.target.value })}
                  placeholder="Question"
                  required
                  value={question.prompt}
                />
                <p className="mt-2 text-xs text-muted">
                  Choices: select the correct one.
                </p>
                {question.choices.map((choice, cIndex) => (
                  <div className="mt-1 flex items-center gap-2" key={cIndex}>
                    <input
                      aria-label={`Choice ${cIndex + 1} is correct`}
                      checked={question.correct_index === cIndex}
                      className="h-4 w-4 accent-on-surface"
                      name={`correct-${qIndex}`}
                      onChange={() => update({ correct_index: cIndex })}
                      type="radio"
                    />
                    <input
                      aria-label={`Choice ${cIndex + 1}`}
                      className={`${inputStyles} mt-0`}
                      onChange={(e) =>
                        update({
                          choices: question.choices.map((c, i) =>
                            i === cIndex ? e.target.value : c,
                          ),
                        })
                      }
                      required
                      value={choice}
                    />
                    <button
                      aria-label={`Remove choice ${cIndex + 1}`}
                      className="px-1 text-muted hover:text-danger disabled:opacity-30"
                      disabled={question.choices.length <= 2}
                      onClick={() =>
                        update({
                          choices: question.choices.filter(
                            (_, i) => i !== cIndex,
                          ),
                          correct_index:
                            question.correct_index === cIndex
                              ? 0
                              : question.correct_index > cIndex
                                ? question.correct_index - 1
                                : question.correct_index,
                        })
                      }
                      type="button"
                    >
                      <X aria-hidden className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {question.choices.length < 8 && (
                  <button
                    className="mt-2 text-xs font-semibold text-link"
                    onClick={() =>
                      update({ choices: [...question.choices, ""] })
                    }
                    type="button"
                  >
                    + Add choice
                  </button>
                )}
              </div>
            );
          })}
          <button
            className={`${buttonStyles.secondary} py-2 text-sm`}
            disabled={questions.length >= 20}
            onClick={() =>
              edited(setQuestions)([
                ...questions,
                { prompt: "", choices: ["", ""], correct_index: 0 },
              ])
            }
            type="button"
          >
            + Add question
          </button>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Map pin</h2>
          {pin && (
            <button
              className="text-xs font-semibold text-muted hover:text-danger"
              onClick={() => edited(setPin)(null)}
              type="button"
            >
              Remove pin
            </button>
          )}
        </div>
        <p className="text-sm text-muted">
          Tap the map where the quest takes place. Leave it empty for “anywhere”
          quests.
        </p>
        <CampusMap
          className="h-80"
          onPick={(lat, lng) => edited(setPin)({ lat, lng })}
          pins={
            pin
              ? [
                  {
                    id: "new",
                    lat: pin.lat,
                    lng: pin.lng,
                    label: title || "Quest location",
                  },
                ]
              : []
          }
        />
        {pin && (
          <p className="text-xs text-muted">
            {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
          </p>
        )}
      </Card>

      {/* In the flow (not floating), so it never covers form fields. */}
      <div className="flex flex-col gap-2">
        <button
          className={`${buttonStyles.primary} py-4 text-lg`}
          disabled={saving}
          type="submit"
        >
          {saving ? "Saving..." : quest ? "Save changes" : "Create draft"}
        </button>
        {saved && (
          <p
            className="flex items-center justify-center gap-1 rounded-xl bg-success-surface p-2 text-sm text-success"
            role="status"
          >
            <Check aria-hidden className="h-4 w-4" /> Saved
          </p>
        )}
        {error && <ErrorState message={error} />}
      </div>
    </form>
  );
}
