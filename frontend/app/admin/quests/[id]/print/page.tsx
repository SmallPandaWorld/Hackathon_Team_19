import { LoadingState } from "@/src/components/states";
import { Suspense } from "react";
import { PrintSign } from "./print-sign";

export default function PrintQuestCodePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading QR sign..." />}>
      <PrintSign />
    </Suspense>
  );
}
