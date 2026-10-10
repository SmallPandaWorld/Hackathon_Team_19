import { Page } from "@/src/components/page";
import { LoadingState } from "@/src/components/states";
import { Suspense } from "react";
import { QuestDetail } from "./quest-detail";

// The quest ID is only known at request time, so useParams() in QuestDetail
// needs a Suspense boundary when cacheComponents is enabled.
export default function QuestPage() {
  return (
    <Page>
      <Suspense fallback={<LoadingState label="Loading quest..." />}>
        <QuestDetail />
      </Suspense>
    </Page>
  );
}
