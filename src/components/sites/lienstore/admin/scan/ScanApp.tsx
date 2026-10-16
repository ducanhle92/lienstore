"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseScannedCode } from "@/lib/barcodes";
import { isTypingTarget, WedgeBuffer } from "@/lib/scan-input";
import { CameraView } from "./CameraView";
import { DocPanel, type DocKind, DraftList, type ScanHandler } from "./DocPanel";
import { signal, unlockAudio } from "./feedback";
import { LinkCodePanel } from "./LinkCodePanel";
import { PackDraftList, PackPanel } from "./PackPanel";
import { ProductHeader, ProductStockCard, type ProductBriefView, type StockView, UnitInfo, type UnitBriefView } from "./ProductStockCard";
import { api } from "./scan-client";

/**
 * Phone scan screen (Admin › Vận hành › Quét mã). Camera, typed codes and keyboard-wedge scanners all go through
 * `handleCode`: validate on the device → resolve on the server → hand to the current mode (lookup / document / pack).
 * The status line separates: đã đọc mã → đã nhận diện → đã lưu nháp (server confirmed) → đã chốt.
 *
 * Home modes: Tra cứu · Nhập hàng JP · Đóng hàng JP · Kiểm kho JP · Xuất hàng VN.
 * Tra cứu: giá bán nếu see_prices; bảng giá vốn chỉ nếu see_cost (admin kho VN thường không có).
 */
export type Mode = "home" | "lookup" | "pack" | DocKind;

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
  saving: "Đang lưu…",
  saved: "Đã lưu",
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

const MODE_TITLE: Record<Exclude<Mode, "home">, string> = {
  lookup: "Tra cứu",
  receive: "Nhập hàng JP",
  pack: "Đóng hàng JP",
  count: "Kiểm kho JP",
  pick: "Xuất hàng VN",
};

const STATE_KEY = "lienstore:scan:state";

export interface ScanAppProps {
  warehouses: Array<"vn" | "jp">;
  canPick: boolean;
  /** ④ Đóng hàng JP */
  canPack: boolean;
  canLink: boolean;
  /** "Xem giá vốn": bảng so giá nguồn trên Tra cứu; giá ¥ trên phiếu nhập. */
  seeCost?: boolean;
  userLabel: string;
}

export function ScanApp({ warehouses, canPick, canPack, canLink, seeCost = false, userLabel }: ScanAppProps) {
  const [mode, setMode] = useState<Mode>("home");
  // JP modes lock warehouse to jp; pick needs none; legacy restore may still set it
  const [warehouse, setWarehouse] = useState<"vn" | "jp" | "">(warehouses.includes("jp") ? "jp" : warehouses[0] ?? "");
  const [docId, setDocId] = useState<number | null>(null);
  const [camera, setCamera] = useState(false);
  const [manual, setManual] = useState("");
  const [last, setLast] = useState<LastScan | null>(null);
  const [stock, setStock] = useState<StockView | null>(null);
  const [linking, setLinking] = useState<{ raw: string; resolution: Resolution } | null>(null);
  const [online, setOnline] = useState(true);
  const [sound, setSound] = useState(true);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const docHandler = useRef<ScanHandler | null>(null);
  const trackingSetter = useRef<((code: string) => void) | null>(null);
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
      if (s.mode === "receive" || s.mode === "count") setWarehouse("jp");
      else if (s.warehouse && warehouses.includes(s.warehouse)) setWarehouse(s.warehouse);
      if (s.mode && s.mode !== "home") {
        if (s.mode === "pack" && !canPack) return;
        if (s.mode === "pick" && !canPick) return;
        if ((s.mode === "receive" || s.mode === "count") && !warehouses.includes("jp")) return;
        setMode(s.mode);
        setDocId(s.docId ?? null);
      }
    } catch {
      /* ignore */
    }
  }, [warehouses, canPack, canPick]);
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
      // a document / pack run is open: one round trip — the server resolves and records; unknown / conflict opens link panel
      if (m !== "lookup" && docHandler.current) {
        setLast({ raw, stage: "saving", message: "", at: now });
        const out = await docHandler.current(raw);
        if (out.ok || (out.errorCode !== "UNKNOWN_CODE" && out.errorCode !== "CODE_CONFLICT")) {
          setLast({ raw, stage: out.stage ?? (out.ok ? "saved" : "error"), message: out.message, at: now });
          signal(out.ok ? "ok" : "error", sound);
          return;
        }
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
        const out = await docHandler.current(raw);
        setLast({ raw, stage: out.stage ?? (out.ok ? "saved" : "error"), message: out.message, at: now, resolution: res });
        signal(out.ok ? "ok" : "error", sound);
        return;
      }
      setLast({ raw, stage: "error", message: m === "pack" ? "Chưa mở chuyến — chọn hoặc tạo chuyến trước khi quét." : "Chưa mở phiếu — chọn hoặc tạo phiếu trước khi quét.", at: now, resolution: res });
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

  // Bluetooth / USB scanners type the code + Enter. Capture phase: ≥ 4 chars when idle, ≥ 8 inside another field.
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
    if (m === "receive" || m === "count" || m === "pack") setWarehouse("jp");
  };

  const canReceiveJp = warehouses.includes("jp");
  const modes: Array<{ key: Mode; label: string; hint: string; show: boolean }> = [
    { key: "lookup", label: "Tra cứu", hint: "Tồn 2 kho, hạn dùng; giá bán / giá vốn theo quyền — không ghi gì", show: true },
    { key: "receive", label: "Nhập hàng JP", hint: "Phiếu nhập Kho Nhật: hàng mới (tạo mã từng cái khi xác nhận)", show: canReceiveJp },
    { key: "pack", label: "Đóng hàng JP", hint: "Quét JAN vào chuyến đang đóng — mỗi lần quét +1 cái", show: canPack },
    { key: "count", label: "Kiểm kho JP", hint: "Phiên kiểm kê Kho Nhật: đếm, xem chênh lệch, chốt", show: canReceiveJp },
    { key: "pick", label: "Xuất hàng VN", hint: "Soạn đơn Kho VN: đối chiếu, hoàn tất bắt đầu giao", show: canPick },
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
        <h1 className="font-oswald text-[22px] text-lien-heading">{mode === "home" ? "Quét mã" : MODE_TITLE[mode]}</h1>
        <label className="ml-auto flex items-center gap-1 text-[12px] text-lien-muted">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Âm/rung
        </label>
      </div>

      {mode === "home" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {modes
              .filter((m) => m.show)
              .map((m) => (
                <button key={m.key} type="button" className="min-h-24 rounded-xl border-2 border-[#d1d5db] bg-white p-3 text-left active:bg-sky-50" onClick={() => enterMode(m.key)} data-testid={`mode-${m.key}`}>
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

          {linking && mode === "pick" && docId ? (
            <button
              type="button"
              className="min-h-12 w-full rounded-lg border-2 border-sky-600 bg-sky-50 px-3 font-semibold text-sky-900"
              onClick={() => {
                trackingSetter.current?.("code" in linking.resolution ? linking.resolution.code : linking.raw);
                setLinking(null);
                setLast((l) => (l ? { ...l, stage: "identified", message: "Đã điền làm mã vận đơn (lưu khi bấm Hoàn tất)." } : l));
              }}
              data-testid="use-as-tracking"
            >
              Dùng mã này làm mã vận đơn
            </button>
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
                handleCode(raw);
              }}
            />
          ) : null}

          {mode === "lookup" && stock ? (
            <div className="rounded-lg border border-[#e5e7eb] bg-white p-3">
              <ProductStockCard stock={stock} />
            </div>
          ) : null}

          {mode === "pack" ? (
            docId ? (
              <PackPanel shipmentId={docId} onClose={() => setDocId(null)} registerScanHandler={(h) => (docHandler.current = h)} online={online} />
            ) : (
              <PackDraftList onOpen={(id) => setDocId(id)} />
            )
          ) : null}

          {mode === "receive" || mode === "count" || mode === "pick" ? (
            docId ? (
              <DocPanel kind={mode} docId={docId} onClose={() => setDocId(null)} registerScanHandler={(h) => (docHandler.current = h)} registerTrackingSetter={(f) => (trackingSetter.current = f)} seeCost={seeCost} online={online} />
            ) : (
              <DraftList kind={mode} warehouse={mode === "pick" ? null : "jp"} onOpen={(id) => setDocId(id)} />
            )
          ) : null}
        </>
      )}
    </div>
  );
}
