/**
 * Barcode detection on the device (no image ever leaves the phone).
 * Uses the browser's own BarcodeDetector when it supports EAN-13 + QR (Chrome on Android), otherwise lazy-loads the
 * ZXing-C++ WebAssembly ponyfill (`barcode-detector`, works on Safari iOS) with the .wasm file served from our own
 * /sites/… path (no CDN). Formats: EAN-13/JAN, EAN-8, UPC-A, Code 128, ITF, QR.
 */
export interface DetectedCode {
  rawValue: string;
  format: string;
}
export interface CodeDetector {
  kind: "native" | "zxing";
  detect(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<DetectedCode[]>;
}

export const SCAN_FORMATS = ["ean_13", "ean_8", "upc_a", "code_128", "itf", "qr_code"] as const;
export const ZXING_WASM_URL = "/sites/lienstore/scan/zxing_reader-3.1.3.wasm";

interface NativeDetectorCtor {
  new (opts: { formats: string[] }): { detect(s: unknown): Promise<DetectedCode[]> };
  getSupportedFormats(): Promise<string[]>;
}

let cached: Promise<CodeDetector> | null = null;

export function getDetector(): Promise<CodeDetector> {
  cached ??= create().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

async function create(): Promise<CodeDetector> {
  const Native = (globalThis as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      const formats = SCAN_FORMATS.filter((f) => supported.includes(f));
      if (formats.includes("ean_13") && formats.includes("qr_code")) {
        const d = new Native({ formats });
        return { kind: "native", detect: (s) => d.detect(s) };
      }
    } catch {
      /* fall back to the WASM reader */
    }
  }
  const mod = await import("barcode-detector/ponyfill");
  mod.prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? ZXING_WASM_URL : prefix + path) },
  });
  const d = new mod.BarcodeDetector({ formats: [...SCAN_FORMATS] });
  return { kind: "zxing", detect: (s) => d.detect(s) as Promise<DetectedCode[]> };
}
