"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

type PhotoPreviewImageProps = {
  alt: string;
  className: string;
  onError?: ComponentProps<typeof Image>["onError"];
  onLoad?: ComponentProps<typeof Image>["onLoad"];
  sizes: string;
  src: string;
};

type PreviewSize = { width: number; height: number };

function fitPreviewSize(image: PreviewSize): PreviewSize {
  const scale = Math.min(
    1,
    (window.innerWidth * 0.9) / image.width,
    (window.innerHeight * 0.9) / image.height,
  );
  return {
    width: Math.round(image.width * scale),
    height: Math.round(image.height * scale),
  };
}

export function PhotoPreviewImage({
  alt,
  className,
  onError,
  onLoad,
  sizes,
  src,
}: PhotoPreviewImageProps) {
  const [open, setOpen] = useState(false);
  const [previewSize, setPreviewSize] = useState<PreviewSize | null>(null);
  const naturalSize = useRef<PreviewSize | null>(null);
  const triggerRef = useRef<HTMLImageElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previewWasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      previewWasOpen.current = true;
      closeButtonRef.current?.focus();

      function fitPreview() {
        const image = naturalSize.current;
        if (image) setPreviewSize(fitPreviewSize(image));
      }

      window.addEventListener("resize", fitPreview);
      return () => window.removeEventListener("resize", fitPreview);
    } else if (previewWasOpen.current) {
      previewWasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  function showPreview(
    event: MouseEvent<HTMLImageElement> | KeyboardEvent<HTMLImageElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const imageSize = {
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    };
    if (imageSize.width <= 0 || imageSize.height <= 0) return;

    naturalSize.current = imageSize;
    setPreviewSize(fitPreviewSize(imageSize));
    setOpen(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLImageElement>) {
    if (event.key === "Enter" || event.key === " ") {
      showPreview(event);
    }
  }

  function closePreview(event?: { stopPropagation(): void }) {
    event?.stopPropagation();
    setOpen(false);
  }

  return (
    <>
      <Image
        alt={alt}
        aria-haspopup="dialog"
        className={`${className} cursor-zoom-in`}
        fill
        onClick={showPreview}
        onError={onError}
        onLoad={onLoad}
        onKeyDown={handleKeyDown}
        role="button"
        sizes={sizes}
        src={src}
        ref={triggerRef}
        tabIndex={0}
        unoptimized
      />
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100]"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (event.target === event.currentTarget) setOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") closePreview(event);
            }}
            role="presentation"
          >
            <section
              aria-label={`Preview: ${alt}`}
              aria-modal="true"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              style={previewSize ?? undefined}
            >
              <button
                aria-label="Close image preview"
                className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] hover:bg-black/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                onClick={closePreview}
                ref={closeButtonRef}
                type="button"
              >
                <X aria-hidden className="h-5 w-5" />
              </button>
              <Image
                alt={alt}
                className="object-contain"
                fill
                sizes="90vw"
                src={src}
                unoptimized
              />
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
