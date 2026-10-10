"use client";

import { QuestEditor } from "@/src/components/admin/quest-editor";
import { Page, PageTitle } from "@/src/components/page";
import { BackLink } from "@/src/components/states";

export default function CreateQuestPage() {
  return (
    <Page>
      <BackLink />
      <PageTitle eyebrow="Your quest">Create a quest</PageTitle>
      <p className="text-sm text-muted">
        Your quest appears for everyone as soon as you publish it. Each player
        earns 10 points for completing it.
      </p>
      <QuestEditor playerCreate />
    </Page>
  );
}
