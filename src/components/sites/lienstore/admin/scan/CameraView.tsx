"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PresenceGate } from "@/lib/scan-input";
import { type CodeDetector, getDetector } from "./detector";

/**
 * Rear camera + on-device barcode detection. The camera starts only from a tap, stops when the page is hidden or the
 * component unmounts, and never uploads frames. Detection runs a few times per second (not every frame) to keep the
 * phone cool; each code is reported once when it appears (PresenceGate) — "Quét lại" accepts it again.
 */
type CamState = "off" | "starting" | "on" | "error";

const CAMERA_PREF = "lienstore:scan:camera";

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Trình duyệt đang chặn camera. Mở cài đặt trang (biểu tượng ổ khoá / aA trên thanh địa chỉ) → cho phép Camera, rồi bấm Bật camera lại. Vẫn nhập mã tay hoặc dùng máy quét được.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Không tìm thấy camera trên thiết bị này — nhập mã tay hoặc dùng máy quét.";
  if (name === "NotReadableError" || name === "AbortError") return "Camera đang bị ứng dụng khác dùng. Đóng ứng dụng đó rồi thử lại.";
  return `Không mở được camera (${name || (e instanceof Error ? e.message : "lỗi không rõ")}).`;
}

export function CameraView({ onCode }: { onCode: (raw: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const detector = useRef<CodeDetector | null>(null);
  const gate = useRef(new PresenceGate(1200));
  const timer = useRef<number | null>(null);
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);
  const [state, setState] = useState<CamState>("off");
  const [error, setError] = useState("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [torch, setTorch] = useState<boolean | null>(null);
  const [engine, setEngine] = useState("");
  const [pausedByPage, setPausedByPage] = useState(false);

  const stop = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setTorch(null);
    setState((s) => (s === "error" ? s : "off"));
  }, []);

  const loop = useCallback(() => {
    const step = () => {
      const v = video.current;
      const d = detector.current;
      if (!v || !d || !stream.current) return;
      const next = () => {
        timer.current = window.setTimeout(step, d.kind === "native" ? 150 : 250);
      };
      if (document.hidden || v.readyState < 2) return next();
      d.detect(v)
        .then((found) => {
          const fresh = gate.current.observe(
            found.map((f) => f.rawValue).filter(Boolean),
            performance.now(),
          );
          for (const c of fresh) onCodeRef.current(c);
        })
        .catch(() => {
          /* a frame that could not be read */
        })
        .finally(next);
    };
    step();
  }, []);

  const start = useCallback(
    async (wanted?: string) => {
      setError("");
      if (!window.isSecureContext) {
        setState("error");
        setError("Camera chỉ chạy trên HTTPS (hoặc localhost). Mở trang bằng https://… — trong lúc đó vẫn nhập mã tay hoặc dùng máy quét.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("error");
        setError("Trình duyệt này không hỗ trợ camera trên web — dùng Safari (iOS) hoặc Chrome (Android) bản mới.");
        return;
      }
      stop();
      setState("starting");
      try {
        const id = wanted || deviceId || localStorage.getItem(CAMERA_PREF) || "";
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: id ? { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } } : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        stream.current = s;
        const v = video.current!;
        v.srcObject = s;
        v.setAttribute("playsinline", "true");
        v.muted = true;
        await v.play();
        const track = s.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorch(caps.torch ? false : null);
        const settingsId = track.getSettings().deviceId ?? "";
        if (settingsId) setDeviceId(settingsId);
        const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
        setCameras(list);
        detector.current = await getDetector();
        setEngine(detector.current.kind === "native" ? "bộ đọc của trình duyệt" : "bộ đọc ZXing (WASM)");
        setState("on");
        setPausedByPage(false);
        loop();
      } catch (e) {
        stop();
        setState("error");
        setError(e instanceof Error && !(e instanceof DOMException) ? `Không tải được bộ đọc mã: ${e.message}` : cameraError(e));
      }
    },
    [deviceId, loop, stop],
  );

  // leaving the page / app switch: release the camera; the user taps to resume
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && stream.current) {
        stop();
        setPausedByPage(true);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [stop]);

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  const on = state === "on" || state === "starting";
  return (
    <div className="overflow-hidden rounded-lg border border-[#d1d5db] bg-black" data-testid="camera">
      <div className="relative aspect-[4/3] w-full max-h-[42vh]">
        <video ref={video} className={on ? "h-full w-full object-cover" : "hidden"} muted playsInline />
        {on ? <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[30%] -translate-y-1/2 rounded-md border-2 border-white/80" /> : null}
        {!on ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center text-[14px] text-white/90">
            {error ? <p className="text-[13px] leading-5 text-amber-200" data-testid="camera-error">{error}</p> : <p>{pausedByPage ? "Camera đã tắt khi rời màn hình." : "Camera đang tắt."}</p>}
            <button type="button" className="min-h-12 rounded-lg bg-white px-5 text-[16px] font-semibold text-black" onClick={() => void start()} data-testid="camera-start">
              {pausedByPage || error ? "Bật lại camera" : "Bật camera"}
            </button>
          </div>
        ) : null}
        {state === "starting" ? <div className="absolute inset-0 flex items-center justify-center text-white">Đang mở camera…</div> : null}
      </div>
      {on ? (
        <div className="flex flex-wrap items-center gap-2 bg-[#111] p-2 text-[13px] text-white">
          <button type="button" className="min-h-11 rounded-md bg-white/15 px-3" onClick={stop} data-testid="camera-stop">
            Tắt camera
          </button>
          <button type="button" className="min-h-11 rounded-md bg-white/15 px-3" onClick={() => gate.current.forget()} title="Nhận lại mã đang ở trước camera">
            Quét lại
          </button>
          {torch !== null ? (
            <button type="button" className="min-h-11 rounded-md bg-white/15 px-3" onClick={() => void toggleTorch()}>
              {torch ? "Tắt đèn" : "Bật đèn"}
            </button>
          ) : null}
          {cameras.length > 1 ? (
            <select
              className="min-h-11 max-w-[11rem] rounded-md bg-white/15 px-2"
              value={deviceId}
              onChange={(e) => {
                setDeviceId(e.target.value);
                localStorage.setItem(CAMERA_PREF, e.target.value);
                void start(e.target.value);
              }}
              aria-label="Chọn camera"
            >
              {cameras.map((c, i) => (
                <option key={c.deviceId || i} value={c.deviceId} className="text-black">
                  {c.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          ) : null}
          <span className="ml-auto text-[11px] text-white/60">{engine}</span>
        </div>
      ) : null}
    </div>
  );
}
