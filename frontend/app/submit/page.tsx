"use client";

import {
  buttonStyles,
  Card,
  inputStyles,
  Page,
  PageTitle,
} from "@/src/components/page";
import { BackLink, ErrorState } from "@/src/components/states";
import type { SubmissionOut } from "@/src/lib/api/hackathon.schemas";
import { useSubmitQuest } from "@/src/lib/api/quests";
import { useAction } from "@/src/lib/use-action";
import Link from "next/link";
import { useState, type FormEvent } from "react";

const RULES = [
  "Safe, legal and friendly: nothing dangerous, mean or embarrassing for others.",
  "Doable on campus by one person, without buying anything.",
  "Clear instructions, so everyone knows when it's done.",
];

export default function SubmitPage() {
  const submitQuest = useSubmitQuest();
  const { error, run, refreshAll } = useAction();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [submitted, setSubmitted] = useState<SubmissionOut | null>(null);
  const valid = title.trim().length >= 3 && description.trim().length >= 10;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await run(() =>
      submitQuest.mutateAsync({
        data: {
          title: title.trim(),
          description: description.trim(),
          location: location.trim() || null,
        },
      }),
    );
    if (response?.status === 201) {
      setSubmitted(response.data);
      await refreshAll();
    }
  }

  return (
    <Page>
      <BackLink />
      <PageTitle eyebrow="Your idea">Suggest a quest</PageTitle>

      {submitted ? (
        <Card className="text-center">
          <p className="text-lg font-bold">
            Thanks! “{submitted.title}” was sent for review. 💡
          </p>
          <p className="mt-1 text-sm text-muted">
            A maintainer checks every idea before it appears in the app. Follow
            its status on your profile.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link
              className={`${buttonStyles.primary} py-2 text-sm`}
              href="/profile"
            >
              My ideas
            </Link>
            <button
              className={`${buttonStyles.secondary} py-2 text-sm`}
              onClick={() => {
                setSubmitted(null);
                setTitle("");
                setDescription("");
                setLocation("");
              }}
              type="button"
            >
              Suggest another
            </button>
          </div>
        </Card>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Card>
            <h2 className="font-semibold">Quest rules</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              {RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </Card>
          <Card className="flex flex-col gap-4">
            <label className="text-sm font-medium text-on-surface-variant">
              Title
              <input
                className={inputStyles}
                maxLength={120}
                minLength={3}
                onChange={(e) => setTitle(e.target.value)}
                required
                value={title}
              />
            </label>
            <label className="text-sm font-medium text-on-surface-variant">
              Instructions
              <textarea
                className={inputStyles}
                maxLength={2000}
                minLength={10}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What should players do, and how do they know they're done?"
                required
                rows={5}
                value={description}
              />
            </label>
            <label className="text-sm font-medium text-on-surface-variant">
              Location{" "}
              <span className="font-normal text-muted">(optional)</span>
              <input
                className={inputStyles}
                maxLength={255}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. HG main hall"
                value={location}
              />
            </label>
          </Card>
          <button
            className={`${buttonStyles.primary} py-4 text-lg`}
            disabled={!valid || submitQuest.isPending}
            type="submit"
          >
            {submitQuest.isPending ? "Sending..." : "Send for review"}
          </button>
          {error && <ErrorState message={error} />}
        </form>
      )}
    </Page>
  );
}
