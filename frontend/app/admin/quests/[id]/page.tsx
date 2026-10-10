import { Page } from "@/src/components/page";
import { LoadingState } from "@/src/components/states";
import { Suspense } from "react";
import { EditQuest } from "./edit-quest";

// The quest ID is only known at request time: useParams() needs Suspense.
export default function EditQuestPage() {
  return (
    <Page>
      <Suspense fallback={<LoadingState label="Loading quest..." />}>
        <EditQuest />
      </Suspense>
    </Page>
  );
}
