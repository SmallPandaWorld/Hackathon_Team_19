"use client";

import { QrScanner } from "@/src/components/quest-actions/qr-scanner";
import { buttonStyles, Card, inputStyles } from "@/src/components/page";
import { ScanQrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { useState } from "react";

const QUEST_PATH =
  /^\/quests\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

function localQuestLink(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    const questId = url.pathname.match(QUEST_PATH)?.[1];
    const code = url.searchParams.get("code")?.trim();
    if (!questId || !code) return null;
    return `/quests/${questId}?code=${encodeURIComponent(code)}`;
  } catch {
    return null;
  }
}

export function QrScannerTester() {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [decodedText, setDecodedText] = useState<string | null>(null);
  const [questHref, setQuestHref] = useState<string | null>(null);
  const [sampleText, setSampleText] = useState("Campus Voyager QR scanner test");

  function handleDecode(value: string) {
    setDecodedText(value);
    setQuestHref(localQuestLink(value));
    setScannerOpen(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Scan a QR code</h2>
          <p className="mt-1 text-sm text-muted">
            Try one of the printed quest signs. The camera needs permission; use
            localhost or an HTTPS address.
          </p>
        </div>
        {!scannerOpen && (
          <button
            aria-expanded={scannerOpen}
            className={`${buttonStyles.primary} flex items-center justify-center gap-2`}
            onClick={() => setScannerOpen(true)}
            type="button"
          >
            <ScanQrCode aria-hidden className="h-4 w-4" />
            Open camera scanner
          </button>
        )}
        {scannerOpen && (
          <QrScanner
            onClose={() => setScannerOpen(false)}
            onDecode={handleDecode}
          />
        )}
      </Card>

      {decodedText && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">QR decoded</h2>
          <code className="block break-all rounded-xl bg-surface-variant p-3 text-sm">
            {decodedText}
          </code>
          {questHref ? (
            <Link className={buttonStyles.secondary} href={questHref}>
              Open this quest on the local app
            </Link>
          ) : (
            <p className="text-sm text-muted">
              The camera worked, but this QR is not a quest redemption link.
            </p>
          )}
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Sample QR</h2>
          <p className="mt-1 text-sm text-muted">
            Edit the payload to generate a QR for a second device or a printout.
          </p>
        </div>
        <label className="text-sm font-medium text-on-surface-variant">
          QR contents
          <input
            className={inputStyles}
            onChange={(event) => setSampleText(event.target.value)}
            value={sampleText}
          />
        </label>
        <div className="flex justify-center rounded-xl bg-white p-4">
          <QRCodeSVG
            aria-label="Sample QR code for testing the scanner"
            size={192}
            value={sampleText || " "}
          />
        </div>
      </Card>
    </div>
  );
}
