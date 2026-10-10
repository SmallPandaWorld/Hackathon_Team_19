"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const ZXING_READER_OVERRIDES = {
  locateFile: (path: string, prefix: string) =>
    path.endsWith(".wasm") ? "/zxing_reader.wasm" : `${prefix}${path}`,
};

type QrScannerProps = {
  onDecode: (value: string) => void;
  onClose: () => void;
};

type NativeQrDetector = {
  detect: (
    source: HTMLVideoElement,
  ) => Promise<Array<{ rawValue: string }>>;
};

type NativeQrDetectorConstructor = {
  new (options: { formats: string[] }): NativeQrDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

type FrameReader = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
) => Promise<string | undefined>;

async function createFrameReader(): Promise<FrameReader> {
  const NativeDetector = (
    window as Window & { BarcodeDetector?: NativeQrDetectorConstructor }
  ).BarcodeDetector;

  if (NativeDetector) {
    try {
      const formats = await NativeDetector.getSupportedFormats?.();
      if (!formats || formats.includes("qr_code")) {
        const detector = new NativeDetector({ formats: ["qr_code"] });
        return async (video) => (await detector.detect(video))[0]?.rawValue;
      }
    } catch {
      // Some browsers expose BarcodeDetector without usable QR support.
    }
  }

  const { prepareZXingModule, readBarcodes } = await import("zxing-wasm/reader");
  await prepareZXingModule({
    overrides: ZXING_READER_OVERRIDES,
    fireImmediately: true,
  });

  return async (video, canvas, context) => {
    if (
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return undefined;
    }

    const scale = Math.min(1, 640 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const [result] = await readBarcodes(
      context.getImageData(0, 0, canvas.width, canvas.height),
      { formats: ["QRCode"], maxNumberOfSymbols: 1, tryHarder: true },
    );
    return result?.text;
  };
}

function scannerErrorMessage(error: unknown) {
  if (error instanceof TypeError) {
    return "Could not load the QR scanner. Check your connection and try again.";
  }
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      if (error.name === "SecurityError") {
        return "Camera access requires HTTPS (or localhost). Open this app using an HTTPS address.";
      }
      return "Camera access was blocked. Allow camera access in your browser and try again.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No camera was found on this device.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "The camera is already in use by another app.";
    }
  }
  return "Could not start the QR scanner. Check camera access and try again.";
}

export function QrScanner({ onDecode, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDecodeRef = useRef(onDecode);
  const [status, setStatus] = useState("Starting camera...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const videoElement = videoRef.current;

    async function startScanner() {
      try {
        if (!window.isSecureContext) {
          setError(
            "Camera access requires HTTPS (or localhost). Open this app using an HTTPS address.",
          );
          return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Camera scanning is unavailable in this browser.");
          return;
        }

        // Use the browser's built-in QR reader when available; otherwise warm
        // up ZXing while the camera starts.
        const readerReady = createFrameReader();
        void readerReady.catch(() => undefined);

        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d", { willReadFrequently: true });
        if (!video || !canvas || !context) {
          stream.getTracks().forEach((track) => track.stop());
          setError("Could not start the camera preview.");
          return;
        }

        video.srcObject = stream;
        await video.play();

        setStatus("Preparing QR scanner...");
        const readFrame = await readerReady;
        if (stopped) return;
        setStatus("Point your camera at the quest QR code.");

        const scanFrame = async () => {
          if (stopped) return;

          try {
            if (
              video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
              video.videoWidth > 0 &&
              video.videoHeight > 0
            ) {
              const value = await readFrame(video, canvas, context);
              if (value) {
                stream?.getTracks().forEach((track) => track.stop());
                onDecodeRef.current(value);
                return;
              }
            }
          } catch {
            if (!stopped) {
              stream?.getTracks().forEach((track) => track.stop());
              video.srcObject = null;
              setError("The QR scanner failed. Close it and try again.");
            }
            return;
          }

          timer = setTimeout(() => void scanFrame(), 250);
        };

        void scanFrame();
      } catch (cause) {
        if (!stopped) {
          stream?.getTracks().forEach((track) => track.stop());
          if (videoElement) videoElement.srcObject = null;
          setError(scannerErrorMessage(cause));
        }
      }
    }

    void startScanner();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoElement) videoElement.srcObject = null;
    };
  }, []);

  return (
    <div
      aria-label="QR code scanner"
      className="relative rounded-2xl border border-outline-variant bg-surface-variant p-3"
      role="group"
    >
      <video
        aria-label="Camera preview for scanning a quest QR code"
        autoPlay
        className="aspect-video w-full rounded-xl bg-black object-cover"
        muted
        playsInline
        ref={videoRef}
      />
      <canvas className="hidden" ref={canvasRef} />
      <button
        aria-label="Close QR scanner"
        className="absolute right-5 top-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/30 bg-black/75 px-4 py-2 font-semibold text-white shadow-lg backdrop-blur"
        onClick={onClose}
        type="button"
      >
        <X aria-hidden className="h-4 w-4" />
        Close scanner
      </button>
      <p
        aria-live="polite"
        className="mt-2 text-center text-sm text-muted"
      >
        {error ?? status}
      </p>
    </div>
  );
}
