"use client";

import { QuestEditor } from "@/src/components/admin/quest-editor";
import { Page, PageTitle } from "@/src/components/page";
import { BackLink, LoadingState } from "@/src/components/states";
import { useGetMe } from "@/src/lib/api/players";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Maintainers get the full editor (all quest kinds, points, publishing)
// instead of the fixed-reward player form.
const MAINTAINER_EDITOR = "/admin/quests/new";

export default function CreateQuestPage() {
  const router = useRouter();
  const { data, isLoading } = useGetMe();
  const player = data?.status === 200 ? data.data : undefined;
  const isMaintainer = player?.is_maintainer ?? false;

  useEffect(() => {
    if (isMaintainer) router.replace(MAINTAINER_EDITOR);
  }, [isMaintainer, router]);

  if (isLoading || isMaintainer) {
    return (
      <Page>
        <LoadingState label="Opening the quest editor..." />
      </Page>
    );
  }

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
