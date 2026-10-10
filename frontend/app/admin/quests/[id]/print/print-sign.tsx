"use client";

import { MaintainerOnly } from "@/src/components/admin/maintainer-only";
import { buttonStyles } from "@/src/components/page";
import { ErrorState, LoadingState } from "@/src/components/states";
import { apiErrorMessage } from "@/src/lib/api-error";
import { useAdminGetQuest } from "@/src/lib/api/admin";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useSyncExternalStore } from "react";

const subscribeOrigin = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => "";

function Sign({ questId }: { questId: string }) {
  const { data, isLoading, isError } = useAdminGetQuest(questId);
  const origin = useSyncExternalStore(
    subscribeOrigin,
    getOrigin,
    getServerOrigin,
  );

  if (isLoading) return <LoadingState label="Loading QR sign..." />;
  const quest = data?.status === 200 ? data.data : undefined;
  if (isError || !quest) {
    return (
      <ErrorState
        message={apiErrorMessage(data) ?? "Could not load this quest."}
      />
    );
  }
  if (!quest.requires_code) {
    return (
      <ErrorState message="Enable printed code or QR verification for this quest first." />
    );
  }

  const redeemUrl = `${origin}/quests/${quest.id}?code=${encodeURIComponent(quest.verification_code)}`;

  return (
    <main className="quest-code-print mx-auto flex min-h-screen max-w-2xl flex-col gap-5 bg-white p-6 text-black sm:p-10">
      <div className="flex flex-wrap gap-3 print:hidden">
        <Link
          className="rounded-sm border-2 border-black bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-gray-100"
          href={`/admin/quests/${quest.id}`}
        >
          Back to editor
        </Link>
        <button
          className={`${buttonStyles.primary} py-2 text-sm`}
          disabled={!origin}
          onClick={() => window.print()}
          type="button"
        >
          Print sign
        </button>
      </div>
      <article className="flex flex-col items-center gap-5 rounded-lg border-2 border-black p-8 text-center print:border-0">
        <p className="text-sm font-bold uppercase tracking-widest">
          Campus Voyager quest
        </p>
        <h1 className="text-3xl font-bold">{quest.title}</h1>
        {quest.location && <p>{quest.location}</p>}
        <p className="max-w-md">
          {quest.kind === "meetup"
            ? "You made it! Scan this QR code with your phone camera or enter the code on the quest page to check in."
            : "Complete the activity, then scan this QR code with your phone camera or enter the code on the quest page."}
        </p>
        {origin && (
          <QRCodeSVG
            aria-label={`QR code for ${quest.title}`}
            bgColor="#FFFFFF"
            fgColor="#000000"
            level="M"
            marginSize={4}
            size={256}
            value={redeemUrl}
          />
        )}
        <code className="text-2xl font-bold tracking-widest">
          {quest.verification_code}
        </code>
        <p className="text-sm">
          {origin ? `${origin}/quests/${quest.id}` : ""}
        </p>
        <p className="text-sm">
          Each player can earn the {quest.points} points once.
        </p>
      </article>
    </main>
  );
}

export function PrintSign() {
  const { id } = useParams<{ id: string }>();
  const validQuestId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return (
    <MaintainerOnly>
      {validQuestId ? (
        <Sign questId={id} />
      ) : (
        <ErrorState message="Quest not found." />
      )}
    </MaintainerOnly>
  );
}
