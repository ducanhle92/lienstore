"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, newOpId } from "./scan-client";
import type { ScanHandler } from "./DocPanel";

/**
 * Đóng hàng JP on the phone: pick / create an open packing run, then supermarket-scan JAN (+1 each time),
 * or type a product name / qty. Writes go live (not a draft doc) — FEFO via packProduct on the server.
 */

interface PackLine {
  productId: number;
  name: string;
  sku: string | null;
  thumb: string;
  qty: number;
  shelfQty: number;
}

interface PackView {
  id: number;
  code: string;
  label: string;
  status: string;
  editable: boolean;
  units: number;
  lines: PackLine[];
  updatedAt: string;
}

interface OpenRun {
  id: number;
  code: string;
  label: string;
  status: string;
  title: string;
}

const btn = "min-h-11 rounded-lg px-3 text-[14px] font-semibold disabled:opacity-40";

export function PackDraftList({ onOpen }: { onOpen: (id: number) => void }) {
  const [runs, setRuns] = useState<OpenRun[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");

  const load = useCallback(async () => {
    const r = await api<OpenRun[]>("GET", "shipments", { query: { editable: "1" } });
    if (r.ok) setRuns(r.data);
    else setMsg(r.error.message);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    setMsg("");
    const r = await api<PackView>("POST", "shipments", { body: { label }, idempotencyKey: `ship-create-${newOpId()}` });
    setBusy(false);
    if (r.ok) onOpen(r.data.id);
    else setMsg(r.error.message);
  };

  return (
    <div className="space-y-3" data-testid="pack-draft-list">
      <div className="rounded-lg border border-[#e5e7eb] bg-white p-3">
        <div className="mb-2 font-semibold">Tạo chuyến đóng hàng (Kho Nhật)</div>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nhãn (tuỳ chọn)" className="mb-2 min-h-11 w-full rounded-md border border-[#d1d5db] px-2 text-[14px]" />
        <button type="button" className={`${btn} bg-lien-blue text-white`} disabled={busy} onClick={() => void create()} data-testid="new-pack">
          Tạo chuyến mới
        </button>
      </div>
      {msg ? <p className="text-[13px] text-red-700">{msg}</p> : null}
      <div className="rounded-lg border border-[#e5e7eb] bg-white p-3">
        <div className="mb-2 font-semibold">Chuyến đang đóng</div>
        {runs === null ? <p className="text-[13px] text-lien-muted">Đang tải…</p> : null}
        {runs && !runs.length ? <p className="text-[13px] text-lien-muted">Chưa có chuyến mở — tạo mới ở trên.</p> : null}
        <ul className="divide-y">
          {runs?.map((d) => (
            <li key={d.id}>
              <button type="button" className="min-h-12 w-full py-2 text-left" onClick={() => onOpen(d.id)} data-testid="open-pack">
                <div className="text-[14px] font-semibold">{d.title}</div>
                <div className="text-[12px] text-lien-muted">{d.status}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PackPanel({ shipmentId, onClose, registerScanHandler, online }: { shipmentId: number; onClose: () => void; registerScanHandler: (h: ScanHandler | null) => void; online: boolean }) {
  const [doc, setDoc] = useState<PackView | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mult, setMult] = useState(1);
  const multRef = useRef(1);
  useEffect(() => {
    multRef.current = mult;
  }, [mult]);

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Array<{ id: number; name: string; sku: string | null }>>([]);
  const [manualQty, setManualQty] = useState(1);

  const load = useCallback(async () => {
    const r = await api<PackView>("GET", `shipments/${shipmentId}`);
    if (r.ok) {
      setDoc(r.data);
      setErr("");
    } else setErr(r.error.message);
    return r;
  }, [shipmentId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
    const onVis = () => {
      if (!document.hidden) void load(); // another phone may have scanned meanwhile
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  const sendPack = useCallback(
    async (raw: string, qty: number) => {
      const r = await api<{ message: string; units: number; shipment: PackView }>("POST", `shipments/${shipmentId}/pack`, {
        body: { code: raw, qty },
        idempotencyKey: `pack-${newOpId()}`,
      });
      if (r.ok) {
        setDoc(r.data.shipment);
        setErr("");
        return { ok: true, message: r.data.message, stage: "saved" as const };
      }
      if (r.network) return { ok: false, message: "Mất kết nối — quét lại khi có mạng (không cộng trùng nếu đã lên máy chủ).", stage: "error" as const };
      return { ok: false, message: r.error.message, stage: r.error.code === "UNKNOWN_CODE" || r.error.code === "CODE_CONFLICT" ? ("unknown" as const) : ("error" as const), errorCode: r.error.code };
    },
    [shipmentId],
  );

  useEffect(() => {
    registerScanHandler((raw) => sendPack(raw, multRef.current));
    return () => registerScanHandler(null);
  }, [registerScanHandler, sendPack]);

  const unpack = async (productId: number, qty: number) => {
    setBusy(true);
    const r = await api<{ message: string; shipment: PackView }>("POST", `shipments/${shipmentId}/unpack`, {
      body: { productId, qty },
      idempotencyKey: `unpack-${newOpId()}`,
    });
    setBusy(false);
    if (r.ok) {
      setDoc(r.data.shipment);
      setErr("");
    } else setErr(r.error.message);
  };

  const packProduct = async (productId: number, qty: number) => {
    setBusy(true);
    const r = await api<{ message: string; shipment: PackView }>("POST", `shipments/${shipmentId}/pack`, {
      body: { productId, qty },
      idempotencyKey: `pack-${newOpId()}`,
    });
    setBusy(false);
    if (r.ok) {
      setDoc(r.data.shipment);
      setErr("");
      setHits([]);
      setQ("");
    } else setErr(r.error.message);
  };

  const searchProducts = async () => {
    const r = await api<Array<{ id: number; name: string; sku: string | null }>>("GET", "products", { query: { search: q, fields: "id,name,sku", perPage: 10 } });
    if (r.ok) setHits(r.data);
  };

  if (!doc) return <p className="text-[14px] text-lien-muted">{err || "Đang tải chuyến…"}</p>;
  const editable = doc.editable && online && !busy;

  return (
    <div className="space-y-3" data-testid="pack-panel">
      <div className="rounded-lg border border-[#e5e7eb] bg-white p-3 text-[14px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{doc.code}</span>
          {doc.label ? <span className="text-lien-muted">{doc.label}</span> : null}
          <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${doc.editable ? "bg-amber-100 text-amber-900" : "bg-gray-300"}`}>{doc.status}</span>
          <button type="button" className="ml-auto text-[13px] text-lien-blue underline" onClick={() => void load()}>
            Tải lại
          </button>
          <button type="button" className="text-[13px] text-lien-muted underline" onClick={onClose}>
            Đóng
          </button>
        </div>
        <div className="mt-1 text-[13px] text-lien-muted">
          {doc.units} cái trong chuyến · quét JAN = +{mult} cái mỗi lần (kiểu siêu thị)
        </div>
        {doc.editable ? (
          <div className="mt-2 flex items-center gap-2 text-[13px]">
            <label htmlFor="pack-mult">Mỗi lần quét =</label>
            <input id="pack-mult" type="number" min={1} max={9999} value={mult} onChange={(e) => setMult(Math.max(1, Math.min(9999, Number.parseInt(e.target.value, 10) || 1)))} className="min-h-11 w-20 rounded-md border border-[#d1d5db] px-2" inputMode="numeric" data-testid="scan-mult" />
            <span>cái</span>
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-amber-800">Chuyến đã khoá / đã giao ĐVVC — mở khoá trên máy tính để sửa.</p>
        )}
      </div>

      {err ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[14px] font-semibold text-red-700" role="alert">
          {err}
        </p>
      ) : null}

      <ul className="space-y-2" data-testid="pack-lines">
        {doc.lines.map((l) => (
          <li key={l.productId} className="rounded-lg border border-[#e5e7eb] bg-white p-2" data-testid="pack-line">
            <div className="flex items-start gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.thumb || "/sites/lienstore/brand/no-image.png"} alt="" className="h-12 w-12 shrink-0 rounded object-contain" />
              <div className="min-w-0 flex-1 text-[13px] leading-5">
                <div className="font-semibold">{l.name}</div>
                <div className="text-lien-muted">
                  #{l.productId}
                  {l.sku ? ` · ${l.sku}` : ""} · còn kệ {l.shelfQty}
                </div>
              </div>
              <div className="text-[22px] font-bold leading-6" data-testid="line-qty">
                {l.qty}
              </div>
            </div>
            {doc.editable ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className={`${btn} bg-gray-100`} disabled={!editable || l.qty <= 0} onClick={() => void unpack(l.productId, 1)} aria-label="Bớt 1">
                  −
                </button>
                <button type="button" className={`${btn} bg-gray-100`} disabled={!editable || l.shelfQty <= 0} onClick={() => void packProduct(l.productId, 1)} aria-label="Thêm 1">
                  +
                </button>
                <button type="button" className="ml-auto text-[13px] text-red-700 underline" disabled={!editable} onClick={() => void unpack(l.productId, l.qty)}>
                  Rút hết
                </button>
              </div>
            ) : null}
          </li>
        ))}
        {!doc.lines.length ? <li className="text-[13px] text-lien-muted">Chưa đóng cái nào — quét JAN hoặc tìm tên bên dưới.</li> : null}
      </ul>

      {doc.editable ? (
        <details className="rounded-lg border border-[#e5e7eb] bg-white p-3 text-[14px]" open>
          <summary className="font-semibold">Thêm theo tên / số lượng</summary>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void searchProducts();
            }}
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên / SKU" className="min-h-11 min-w-0 flex-1 rounded-md border border-[#d1d5db] px-2" data-testid="pack-search" />
            <button type="submit" className={`${btn} bg-gray-200`}>
              Tìm
            </button>
          </form>
          <div className="mt-2 flex items-center gap-2 text-[13px]">
            <label htmlFor="pack-manual-qty">Số lượng</label>
            <input id="pack-manual-qty" type="number" min={1} max={9999} value={manualQty} onChange={(e) => setManualQty(Math.max(1, Math.min(9999, Number.parseInt(e.target.value, 10) || 1)))} className="min-h-11 w-20 rounded-md border border-[#d1d5db] px-2" inputMode="numeric" />
          </div>
          <ul className="mt-2 divide-y">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" className="min-h-11 w-full text-left text-[13px]" disabled={!editable} onClick={() => void packProduct(h.id, manualQty)}>
                  #{h.id} {h.name} {h.sku ? `· ${h.sku}` : ""} → +{manualQty}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="text-[12px] text-lien-muted">Khoá chuyến / giao ĐVVC vẫn làm trên máy tính (④ Đóng hàng JP).</p>
    </div>
  );
}
