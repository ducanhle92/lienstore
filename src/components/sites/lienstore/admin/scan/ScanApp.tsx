"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseScannedCode } from "@/lib/barcodes";
import { isTypingTarget, WedgeBuffer } from "@/lib/scan-input";
import { CameraView } from "./CameraView";
import { DocPanel, type DocKind, DOC_LABEL, DraftList } from "./DocPanel";
import { signal, unlockAudio } from "./feedback";
import { LinkCodePanel } from "./LinkCodePanel";
import { ProductHeader, ProductStockCard, type ProductBriefView, type StockView, UnitInfo, type UnitBriefView } from "./ProductStockCard";
import { api } from "./scan-client";

/**
 * Phone scan screen (Admin › Vận hành › Quét mã). Camera, typed codes and keyboard-wedge scanners all go through
 * `handleCode`: validate on the device → resolve on the server → hand to the current mode (lookup or a document).
 * The status line separates: đã đọc mã → đã nhận diện → đã lưu nháp (server confirmed) → đã chốt.
 */
export type Mode = "home" | "lookup" | DocKind;

export type Resolution =
  | { kind: "product"; input: string; code: string; symbology: string; note?: string; via: string; product: ProductBriefView; packQty: number; packLabel: string; warnings: string[] }
  | { kind: "unit"; input: string; code: string; product: ProductBriefView; unit: UnitBriefView; packQty: 1; warnings: string[] }
  | { kind: "conflict"; input: string; code: string; candidates: ProductBriefView[]; message: string }
  | { kind: "unknown"; input: string; code: string; message: string }
  | { kind: "invalid"; input: string; message: string }
  | { kind: "unsupported_qr"; input: string; message: string };

export type Stage = "read" | "resolving" | "identified" | "saving" | "saved" | "unknown" | "error";
export interface LastScan {
  raw: string;
  stage: Stage;
  message: string;
  resolution?: Resolution;
  at: number;
}

const STAGE_LABEL: Record<Stage, string> = {
  read: "Đã đọc mã",
  resolving: "Đang tra mã…",
  identified: "Đã nhận diện",
  saving: "Đang lưu vào phiếu…",
  saved: "Đã lưu nháp",
  unknown: "Chưa liên kết",
  error: "Lỗi",
};
const STAGE_CLS: Record<Stage, string> = {
  read: "bg-gray-200 text-gray-800",
  resolving: "bg-gray-200 text-gray-800",
  identified: "bg-sky-100 text-sky-900",
  saving: "bg-amber-100 text-amber-900",
  saved: "bg-green-600 text-white",
  unknown: "bg-amber-400 text-black",
  error: "bg-red-600 text-white",
};

const STATE_KEY = "lienstore:scan:state";

export interface ScanAppProps {
  warehouses: Array<"vn" | "jp">;
  canPick: boolean;
  canLink: boolean;
  userLabel: string;
}

export function ScanApp({ warehouses, canPick, canLink, userLabel }: ScanAppProps) {
  const [mode, setMode] = useState<Mode>("home");
  const [warehouse, setWarehouse] = useState<"vn" | "jp" | "">(warehouses.length === 1 ? warehouses[0] : "");
  const [docId, setDocId] = useState<number | null>(null);
  const [camera, setCamera] = useState(false);
  const [manual, setManual] = useState("");
  const [last, setLast] = useState<LastScan | null>(null);
  const [stock, setStock] = useState<StockView | null>(null);
  const [linking, setLinking] = useState<{ raw: string; resolution: Resolution } | null>(null);
  const [online, setOnline] = useState(true);
  const [sound, setSound] = useState(true);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const docHandler = useRef<((r: Resolution, raw: string) => Promise<{ ok: boolean; message: string; stage?: Stage }>) | null>(null);
  const modeRef = useRef<Mode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // restore the open document after a refresh (only ids — the server is the source of truth)
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STATE_KEY) ?? "null") as { mode?: Mode; docId?: number | null; warehouse?: "vn" | "jp" } | null;
      if (!s) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage after mount
      if (s.warehouse && warehouses.includes(s.warehouse)) setWarehouse(s.warehouse);
      if (s.mode && s.mode !== "home") {
        setMode(s.mode);
        setDocId(s.docId ?? null);
      }
    } catch {
      /* ignore */
    }
  }, [warehouses]);
  useEffect(() => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ mode, docId, warehouse }));
  }, [mode, docId, warehouse]);

  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);

  const process = useCallback(
    async (raw: string) => {
      const m = modeRef.current;
      const now = Date.now();
      setLast({ raw, stage: "read", message: "", at: now });
      const parsed = parseScannedCode(raw);
      if (parsed.kind === "invalid" || parsed.kind === "unsupported_qr") {
        setLast({ raw, stage: "error", message: parsed.reason, at: now });
        signal("error", sound);
        return;
      }
      if (!navigator.onLine) {
        setLast({ raw, stage: "error", message: "Mất mạng — chưa ghi nhận mã này. Có mạng lại thì quét lại.", at: now });
        signal("error", sound);
        return;
      }
      setLast({ raw, stage: "resolving", message: "", at: now });
      const r = await api<Resolution>("GET", "codes/resolve", { query: { code: raw } });
      if (!r.ok) {
        setLast({ raw, stage: "error", message: r.error.message, at: now });
        signal("error", sound);
        return;
      }
      const res = r.data;
      if (res.kind === "invalid" || res.kind === "unsupported_qr") {
        setLast({ raw, stage: "error", message: res.message, at: now, resolution: res });
        signal("error", sound);
        return;
      }
      if (res.kind === "unknown" || res.kind === "conflict") {
        setLast({ raw, stage: "unknown", message: res.message, at: now, resolution: res });
        setLinking(res.kind === "unknown" && "code" in res && res.code.startsWith("H") ? null : { raw, resolution: res });
        signal("warn", sound);
        return;
      }
      setLast({ raw, stage: "identified", message: "", at: now, resolution: res });
      if (m === "lookup") {
        signal("ok", sound);
        setStock(null);
        const s = await api<StockView>("GET", `products/${res.product.id}/stock`);
        if (s.ok) setStock(s.data);
        else setLast({ raw, stage: "error", message: s.error.message, at: now, resolution: res });
        return;
      }
      if (docHandler.current) {
        setLast({ raw, stage: "saving", message: "", at: now, resolution: res });
        const out = await docHandler.current(res, raw);
        setLast({ raw, stage: out.stage ?? (out.ok ? "saved" : "error"), message: out.message, at: now, resolution: res });
        signal(out.ok ? "ok" : "error", sound);
        return;
      }
      setLast({ raw, stage: "error", message: "Chưa mở phiếu — chọn hoặc tạo phiếu trước khi quét.", at: now, resolution: res });
      signal("error", sound);
    },
    [sound],
  );

  const handleCode = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      queue.current = queue.current.then(() => process(code)).catch(() => undefined);
    },
    [process],
  );

  // Bluetooth / USB scanners type the code + Enter. Listened to in the capture phase everywhere: with no field focused
  // any fast burst of ≥ 4 chars is a scan; inside another field (a quantity box) only a fast burst of ≥ 8 chars is, and
  // that field gets its previous value back. The "Nhập / quét mã" box handles its own Enter.
  useEffect(() => {
    const buf = new WedgeBuffer();
    let snap: { el: HTMLInputElement | HTMLTextAreaElement; value: string } | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.dataset.scanInput === "1") return;
      const typing = isTypingTarget(el);
      if (buf.empty && typing && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) snap = { el, value: el.value };
      if (buf.empty && !typing) snap = null;
      const code = buf.feed(e.key, performance.now(), typing ? 8 : 4);
      if (code) {
        e.preventDefault();
        e.stopPropagation();
        if (typing && snap && snap.el === el) {
          // React-controlled fields: set through the native setter + an input event so their state follows
          const proto = snap.el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(snap.el, snap.value);
          snap.el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        snap = null;
        handleCode(code);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [handleCode]);

  const enterMode = (m: Mode) => {
    unlockAudio();
    setMode(m);
    setDocId(null);
    setLast(null);
    setStock(null);
    setLinking(null);
  };

  const needsWarehouse = (k: DocKind) => k !== "pick";
  const modes: Array<{ key: Mode; label: string; hint: string; show: boolean }> = [
    { key: "lookup", label: "Tra cứu", hint: "Xem sản phẩm, tồn, hạn dùng — không ghi gì", show: true },
    { key: "receive", label: "Nhập hàng", hint: "Phiếu nhập: hàng mới hoặc nhận chuyến về kho", show: warehouses.length > 0 },
    { key: "count", label: "Kiểm kho", hint: "Phiên kiểm kê: đếm, xem chênh lệch, chốt", show: warehouses.length > 0 },
    { key: "pick", label: "Xuất hàng", hint: "Soạn đơn: đối chiếu, hoàn tất bắt đầu giao", show: canPick },
  ];

  return (
    <div className="mx-auto max-w-[640px] space-y-3 pb-24" data-testid="scan-app">
      {!online ? (
        <div className="sticky top-0 z-20 rounded-md bg-red-700 px-3 py-2 text-[14px] font-semibold text-white" role="alert" data-testid="offline">
          Mất kết nối — không ghi được gì lúc này. Mọi dòng đã lưu nháp vẫn còn trên máy chủ.
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {mode !== "home" ? (
          <button type="button" className="min-h-11 rounded-md border border-[#d1d5db] bg-white px-3 text-[14px]" onClick={() => enterMode("home")} data-testid="scan-home">
            ← Chế độ
          </button>
        ) : null}
        <h1 className="font-oswald text-[22px] text-lien-heading">{mode === "home" ? "Quét mã" : mode === "lookup" ? "Tra cứu" : DOC_LABEL[mode]}</h1>
        <label className="ml-auto flex items-center gap-1 text-[12px] text-lien-muted">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Âm/rung
        </label>
      </div>

      {mode === "home" ? (
        <div className="space-y-3">
          {warehouses.length > 1 ? (
            <div className="rounded-md border border-[#e5e7eb] bg-white p-3 text-[14px]">
              <div className="mb-1 font-semibold">Kho thao tác (bắt buộc khi nhập / kiểm kho)</div>
              <div className="flex gap-2">
                {warehouses.map((w) => (
                  <button key={w} type="button" className={`min-h-12 flex-1 rounded-lg border-2 font-semibold ${warehouse === w ? "border-lien-blue bg-sky-50" : "border-[#d1d5db] bg-white"}`} onClick={() => setWarehouse(w)} data-testid={`wh-${w}`}>
                    {w === "vn" ? "Kho Việt Nam" : "Kho Nhật"}
                  </button>
                ))}
              </div>
            </div>
          ) : warehouses.length === 1 ? (
            <p className="text-[13px] text-lien-muted">Kho: {warehouses[0] === "vn" ? "Kho Việt Nam" : "Kho Nhật"} (tài khoản chỉ có một kho)</p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            {modes
              .filter((m) => m.show)
              .map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className="min-h-24 rounded-xl border-2 border-[#d1d5db] bg-white p-3 text-left active:bg-sky-50 disabled:opacity-40"
                  disabled={m.key !== "lookup" && m.key !== "pick" && needsWarehouse(m.key as DocKind) && !warehouse}
                  onClick={() => enterMode(m.key)}
                  data-testid={`mode-${m.key}`}
                >
                  <div className="text-[18px] font-bold text-lien-heading">{m.label}</div>
                  <div className="text-[12px] leading-4 text-lien-muted">{m.hint}</div>
                </button>
              ))}
          </div>
          <p className="text-[12px] text-lien-muted">Đăng nhập: {userLabel}. Máy quét Bluetooth: chỉ cần quét (không cần bấm vào ô nào).</p>
        </div>
      ) : (
        <>
          {camera ? <CameraView onCode={handleCode} /> : null}
          <div className="flex gap-2">
            <button type="button" className={`min-h-12 rounded-lg px-4 font-semibold ${camera ? "bg-gray-200" : "bg-lien-blue text-white"}`} onClick={() => setCamera((c) => !c)} data-testid="toggle-camera">
              {camera ? "Ẩn camera" : "Camera"}
            </button>
            <form
              className="flex min-w-0 flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleCode(manual);
                setManual("");
              }}
            >
              <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Nhập / quét mã" className="min-h-12 min-w-0 flex-1 rounded-lg border border-[#d1d5db] px-3 font-mono text-[16px]" autoCapitalize="characters" autoComplete="off" enterKeyHint="go" data-testid="manual-code" data-scan-input="1" />
              <button type="submit" className="min-h-12 rounded-lg bg-lien-heading px-4 font-semibold text-white" data-testid="manual-submit">
                OK
              </button>
            </form>
          </div>

          {last ? (
            <div className="rounded-lg border border-[#e5e7eb] bg-white p-3" data-testid="last-scan" aria-live="polite">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${STAGE_CLS[last.stage]}`} data-testid="scan-stage">
                  {STAGE_LABEL[last.stage]}
                </span>
                <span className="truncate font-mono text-[13px]">{last.raw}</span>
              </div>
              {last.message ? <p className={`mt-1 text-[14px] ${last.stage === "error" ? "font-semibold text-red-700" : ""}`}>{last.message}</p> : null}
              {last.resolution && (last.resolution.kind === "product" || last.resolution.kind === "unit") ? (
                <div className="mt-2 space-y-2">
                  <ProductHeader product={last.resolution.product} code={last.resolution.code} packQty={last.resolution.packQty} packLabel={last.resolution.kind === "product" ? last.resolution.packLabel : ""} />
                  {last.resolution.kind === "unit" ? <UnitInfo unit={last.resolution.unit} /> : null}
                  {last.resolution.warnings.map((w) => (
                    <p key={w} className="text-[13px] text-amber-800">
                      {w}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {linking ? (
            <LinkCodePanel
              code={"code" in linking.resolution ? linking.resolution.code : linking.raw}
              candidates={linking.resolution.kind === "conflict" ? linking.resolution.candidates : undefined}
              canLink={canLink}
              onCancel={() => setLinking(null)}
              onLinked={() => {
                const raw = linking.raw;
                setLinking(null);
                handleCode(raw); // apply the same scan again, in the same mode / document
              }}
            />
          ) : null}

          {mode === "lookup" && stock ? (
            <div className="rounded-lg border border-[#e5e7eb] bg-white p-3">
              <ProductStockCard stock={stock} />
            </div>
          ) : null}

          {mode !== "lookup" ? (
            docId ? (
              <DocPanel kind={mode} docId={docId} onClose={() => setDocId(null)} registerScanHandler={(h) => (docHandler.current = h)} online={online} />
            ) : (
              <DraftList kind={mode} warehouse={warehouse || null} onOpen={(id) => setDocId(id)} />
            )
          ) : null}
        </>
      )}
    </div>
  );
}
