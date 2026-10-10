"use client";

import { MaintainerOnly } from "@/src/components/admin/maintainer-only";
import { QuestEditor } from "@/src/components/admin/quest-editor";
import { PageTitle } from "@/src/components/page";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import { useAdminGetQuest } from "@/src/lib/api/admin";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

function Editor({ questId }: { questId: string }) {
  const { data, isLoading, isError } = useAdminGetQuest(questId);
  const quest = data?.status === 200 ? data.data : undefined;

  if (isLoading) return <LoadingState label="Loading quest..." />;
  if (isError || !quest) {
    return (
      <ErrorState
        message={apiErrorMessage(data) ?? "Could not load this quest."}
      />
    );
  }
  // Re-mount the form on status changes; plain saves keep the form as typed.
  return <QuestEditor key={`${quest.id}-${quest.status}`} quest={quest} />;
}

export function EditQuest() {
  const { id } = useParams<{ id: string }>();
  const questId = id;
  const validQuestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  return (
    <>
      <Link
        className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline"
        href="/admin"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" /> Quest admin
      </Link>
      <PageTitle eyebrow="Maintainers">Edit quest</PageTitle>
      <MaintainerOnly>
        {validQuestId ? (
          <Editor questId={questId} />
        ) : (
          <ErrorState message="Quest not found." />
        )}
      </MaintainerOnly>
    </>
  );
}
