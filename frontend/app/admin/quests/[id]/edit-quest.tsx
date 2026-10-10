"use client";

import { MaintainerOnly } from "@/src/components/admin/maintainer-only";
import { QuestEditor } from "@/src/components/admin/quest-editor";
import { PageTitle } from "@/src/components/page";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import { useAdminGetQuest } from "@/src/lib/api/admin";
import Link from "next/link";
import { useParams } from "next/navigation";

function Editor({ questId }: { questId: number }) {
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
  const questId = Number(id);

  return (
    <>
      <Link
        className="text-sm font-semibold text-link hover:underline"
        href="/admin"
      >
        ← Quest admin
      </Link>
      <PageTitle eyebrow="Maintainers">Edit quest</PageTitle>
      <MaintainerOnly>
        {Number.isInteger(questId) && questId > 0 ? (
          <Editor questId={questId} />
        ) : (
          <ErrorState message="Quest not found." />
        )}
      </MaintainerOnly>
    </>
  );
}
