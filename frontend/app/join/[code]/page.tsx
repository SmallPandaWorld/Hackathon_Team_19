import { Page } from "@/src/components/page";
import { LoadingState } from "@/src/components/states";
import { Suspense } from "react";
import { JoinView } from "./join-view";

// The code is only known at request time: useParams() needs Suspense.
export default function JoinPage() {
  return (
    <Page>
      <Suspense fallback={<LoadingState label="Checking code..." />}>
        <JoinView />
      </Suspense>
    </Page>
  );
}
