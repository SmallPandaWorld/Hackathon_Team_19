"use client";

import { MaintainerOnly } from "@/src/components/admin/maintainer-only";
import { QuestEditor } from "@/src/components/admin/quest-editor";
import { Page, PageTitle } from "@/src/components/page";
import Link from "next/link";

export default function NewQuestPage() {
  return (
    <Page>
      <Link
        className="text-sm font-semibold text-indigo-600 hover:text-indigo-500"
        href="/admin"
      >
        ← Quest admin
      </Link>
      <PageTitle eyebrow="Maintainers">New quest</PageTitle>
      <MaintainerOnly>
        <QuestEditor />
      </MaintainerOnly>
    </Page>
  );
}
