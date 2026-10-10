import { Page, PageTitle } from "@/src/components/page";
import { notFound } from "next/navigation";
import { QrScannerTester } from "./qr-scanner-tester";

export default function QrScannerTestPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <Page>
      <PageTitle eyebrow="Developer tools">QR scanner tester</PageTitle>
      <p className="-mt-3 text-on-surface-variant">
        Check that your camera can read a QR, then open a printed quest link on
        this local app.
      </p>
      <QrScannerTester />
    </Page>
  );
}
