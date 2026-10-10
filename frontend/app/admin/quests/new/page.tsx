"use client";

import { MaintainerOnly } from "@/src/components/admin/maintainer-only";
import { QuestEditor } from "@/src/components/admin/quest-editor";
import { Page, PageTitle } from "@/src/components/page";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NewQuestPage() {
  return (
    <Page>
      <Link
        className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline"
        href="/admin"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" /> Quest admin
      </Link>
      <PageTitle eyebrow="Maintainers">New quest</PageTitle>
      <MaintainerOnly>
        <QuestEditor />
      </MaintainerOnly>
    </Page>
  );
}
