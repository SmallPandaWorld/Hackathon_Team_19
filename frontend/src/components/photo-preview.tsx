"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";

type PhotoPreviewProps = {
  src: string;
  alt: string;
  sizes: string;
};

export function PhotoPreview({ src, alt, sizes }: PhotoPreviewProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open]);

  function close() {
    dialogRef.current?.close();
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) close();
  }

  return (
    <>
      <button
        aria-label={`View larger photo: ${alt}`}
        className="absolute inset-0 cursor-zoom-in"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Image
          alt={alt}
          className="object-cover"
          fill
          sizes={sizes}
          src={src}
          unoptimized
        />
      </button>
      {open && (
        <dialog
          aria-label={alt}
          className="m-auto max-h-[90dvh] max-w-[96vw] overflow-visible border-0 bg-transparent p-0 text-on-surface backdrop:bg-black/85"
          onClick={closeFromBackdrop}
          onClose={() => setOpen(false)}
          ref={dialogRef}
        >
          <div className="relative h-[min(85dvh,48rem)] w-[min(90vw,48rem)] overflow-hidden rounded-2xl bg-black shadow-2xl">
            <Image
              alt={alt}
              className="object-contain"
              fill
              sizes="(max-width: 768px) 90vw, 48rem"
              src={src}
              unoptimized
            />
            <button
              aria-label="Close photo"
              autoFocus
              className="absolute right-3 top-3 z-10 rounded-full bg-surface p-2 text-on-surface shadow-card hover:bg-surface-variant focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              onClick={close}
              type="button"
            >
              <X aria-hidden className="h-5 w-5" />
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
