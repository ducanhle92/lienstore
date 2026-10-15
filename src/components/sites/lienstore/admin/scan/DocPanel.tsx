"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ApiResult, newOpId } from "./scan-client";
import type { ProductBriefView } from "./ProductStockCard";

/**
 * Scan documents on the phone: phiếu nhập (receive), phiên kiểm kê (count), phiếu soạn hàng (pick).
 * The server is the source of truth: every scan / edit returns the fresh document, nothing is shown as saved before
 * the server confirmed it, and a lost answer is re-sent with the SAME opId / Idempotency-Key (never counted twice).
 */
export type DocKind = "receive" | "count" | "pick";
export const DOC_LABEL: Record<DocKind, string> = { receive: "Nhập hàng", count: "Kiểm kho", pick: "Xuất hàng" };
const FAMILY: Record<DocKind, string> = { receive: "stock-receipts", count: "stock-counts", pick: "picks" };
const CONFIRM_PATH: Record<DocKind, string> = { receive: "confirm", count: "close", pick: "complete" };
const CONFIRM_LABEL: Record<DocKind, string> = { receive: "Xác nhận nhập kho", count: "Chốt kiểm kê", pick: "Hoàn tất & bắt đầu giao" };

interface LineView {
  id: number;
  rev: number;
  product: ProductBriefView;
  qty: number | null;
  expected: number | null;
  current?: number;
  unitCodes: string[];
  expiry: string | null;
  unitCostJpy: number | null;
  billCode: string;
  state: string;
  message: string;
}
export interface DocView {
  id: number;
  code: string;
  kind: DocKind;
  mode: string;
  status: "draft" | "confirmed" | "cancelled";
  warehouse: "vn" | "jp";
  version: number;
  note: string;
  shipment: { id: number; code: string; status: string } | null;
  order: { id: string; number: number; customer: string; shipStage: string; carrier: string; carrierValue: string; tracking: string } | null;
  lines: LineView[];
  totals: { lines: number; qty: number; expected: number | null; uncounted?: number; drift?: number };
  blockers: string[];
  result: Record<string, unknown> | null;
  createdBy: string;
  updatedAt: string;
  confirmedBy: string;
  confirmedAt: string | null;
}
type ScanHandler = (r: { kind: string; product?: { id: number } }, raw: string) => Promise<{ ok: boolean; message: string; stage?: "saved" | "error" | "unknown" }>;

const WH: Record<string, string> = { vn: "Kho Việt Nam", jp: "Kho Nhật" };
const STATE_CLS: Record<string, string> = { ok: "bg-green-100 text-green-900", match: "bg-green-100 text-green-900", diff: "bg-amber-100 text-amber-900", short: "bg-amber-100 text-amber-900", over: "bg-red-100 text-red-800", drift: "bg-red-100 text-red-800", uncounted: "bg-gray-100 text-gray-700", empty: "bg-gray-100 text-gray-700" };
const btn = "min-h-11 rounded-lg px-3 text-[14px] font-semibold disabled:opacity-40";

// ---------------------------------------------------------------------------------------------------------------------

export function DraftList({ kind, warehouse, onOpen }: { kind: DocKind; warehouse: string | null; onOpen: (id: number) => void }) {
  const [drafts, setDrafts] = useState<DocView[] | null>(null);
  const [choices, setChoices] = useState<Array<{ id: string | number; title: string; sub: string }> | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<DocView[]>("GET", FAMILY[kind], { query: { status: "draft", warehouse: kind === "pick" ? undefined : (warehouse ?? undefined) } });
    if (r.ok) setDrafts(r.data);
    else setMsg(r.error.message);
  }, [kind, warehouse]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / when the kind changes
    void load();
  }, [load]);

  const create = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg("");
    const r = await api<DocView>("POST", FAMILY[kind], { body, idempotencyKey: `create-${newOpId()}` });
    setBusy(false);
    if (r.ok) return onOpen(r.data.id);
    const existing = (r.error as { docId?: number }).docId;
    if (r.error.code === "DOC_EXISTS" && existing) return onOpen(existing);
    setMsg(r.error.message);
  };

  const pickFrom = async (what: "shipments" | "orders") => {
    setBusy(true);
    const r = await api<Array<Record<string, unknown>>>("GET", what === "shipments" ? "stock-receipts/shipments" : "picks/orders");
    setBusy(false);
    if (!r.ok) return setMsg(r.error.message);
    setChoices(
      r.data.map((x) =>
        what === "shipments"
          ? { id: x.id as number, title: `${x.code} ${x.label ? `· ${x.label}` : ""}`, sub: `${x.pending} cái chờ nhận · ${x.status}` }
          : { id: x.orderId as string, title: `Đơn #${x.orderNumber} · ${x.customerName}`, sub: `${x.units} cái ở Kho VN` },
      ),
    );
    if (!r.data.length) setMsg(what === "shipments" ? "Không có chuyến nào đang chờ nhận." : "Không có đơn nào sẵn sàng giao.");
  };

  return (
    <div className="space-y-3" data-testid="draft-list">
      <div className="rounded-lg border border-[#e5e7eb] bg-white p-3">
        <div className="mb-2 font-semibold">Tạo {kind === "count" ? "phiên kiểm kê" : kind === "pick" ? "phiếu soạn hàng" : "phiếu nhập"}{kind !== "pick" && warehouse ? ` · ${WH[warehouse]}` : ""}</div>
        <div className="flex flex-wrap gap-2">
          {kind === "receive" ? (
            <>
              <button type="button" className={`${btn} bg-lien-blue text-white`} disabled={busy || !warehouse} onClick={() => void create({ mode: "direct", warehouse })} data-testid="new-direct">
                Hàng mới (nhập trực tiếp)
              </button>
              {warehouse === "vn" ? (
                <button type="button" className={`${btn} border border-lien-blue text-lien-blue`} disabled={busy} onClick={() => void pickFrom("shipments")} data-testid="new-shipment">
                  Nhận chuyến hàng về
                </button>
              ) : null}
            </>
          ) : kind === "count" ? (
            <button type="button" className={`${btn} bg-lien-blue text-white`} disabled={busy || !warehouse} onClick={() => void create({ warehouse })} data-testid="new-count">
              Bắt đầu kiểm kê
            </button>
          ) : (
            <button type="button" className={`${btn} bg-lien-blue text-white`} disabled={busy} onClick={() => void pickFrom("orders")} data-testid="new-pick">
              Chọn đơn cần xuất
            </button>
          )}
        </div>
        {choices ? (
          <ul className="mt-2 divide-y rounded-md border border-[#e5e7eb]">
            {choices.map((c) => (
              <li key={c.id}>
                <button type="button" className="min-h-12 w-full px-3 py-2 text-left" disabled={busy} onClick={() => void create(kind === "pick" ? { orderId: c.id } : { mode: "shipment", shipmentId: c.id, warehouse: "vn" })}>
                  <div className="text-[14px] font-semibold">{c.title}</div>
                  <div className="text-[12px] text-lien-muted">{c.sub}</div>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {msg ? <p className="text-[13px] text-red-700">{msg}</p> : null}
      <div className="rounded-lg border border-[#e5e7eb] bg-white p-3">
        <div className="mb-2 font-semibold">Phiếu nháp đang dở</div>
        {drafts === null ? <p className="text-[13px] text-lien-muted">Đang tải…</p> : null}
        {drafts && !drafts.length ? <p className="text-[13px] text-lien-muted">Không có phiếu nháp.</p> : null}
        <ul className="divide-y">
          {drafts?.map((d) => (
            <li key={d.id}>
              <button type="button" className="min-h-12 w-full py-2 text-left" onClick={() => onOpen(d.id)} data-testid="open-draft">
                <div className="text-[14px] font-semibold">
                  {d.code} {d.order ? `· Đơn #${d.order.number}` : d.shipment ? `· chuyến ${d.shipment.code}` : d.kind === "receive" ? "· hàng mới" : ""} · {WH[d.warehouse]}
                </div>
                <div className="text-[12px] text-lien-muted">
                  {d.totals.lines} dòng · {d.totals.qty} cái · {d.createdBy} · sửa {new Date(d.updatedAt).toLocaleString("vi-VN")}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

export function DocPanel({ kind, docId, onClose, registerScanHandler, registerTrackingSetter, online }: { kind: DocKind; docId: number; onClose: () => void; registerScanHandler: (h: ScanHandler | null) => void; registerTrackingSetter?: (f: ((code: string) => void) | null) => void; online: boolean }) {
  const [doc, setDoc] = useState<DocView | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mult, setMult] = useState(1);
  const [pending, setPending] = useState<{ raw: string; opId: string; qty: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const base = `${FAMILY[kind]}/${docId}`;
  // pick: carrier + tracking recorded on the VN-domestic leg when the pick completes (as ⑦ Giao hàng VN does)
  const [carriers, setCarriers] = useState<Array<{ value: string; label: string }>>([]);
  const [method, setMethod] = useState<string | null>(null);
  const [tracking, setTracking] = useState<string | null>(null);
  useEffect(() => {
    if (kind !== "pick") return;
    void api<Array<{ value: string; label: string }>>("GET", "picks/carriers").then((r) => r.ok && setCarriers(r.data));
  }, [kind]);
  useEffect(() => {
    if (kind !== "pick" || !registerTrackingSetter) return;
    registerTrackingSetter((code) => setTracking(code));
    return () => registerTrackingSetter(null);
  }, [kind, registerTrackingSetter]);
  const multRef = useRef(1);
  useEffect(() => {
    multRef.current = mult;
  }, [mult]);

  const load = useCallback(async () => {
    const r = await api<DocView>("GET", base);
    if (r.ok) {
      setDoc(r.data);
      setErr("");
    } else setErr(r.error.message);
    return r;
  }, [base]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
    const onVis = () => {
      if (!document.hidden) void load(); // another phone may have scanned meanwhile
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  const sendScan = useCallback(
    async (raw: string, opId: string, qty: number) => {
      const r = await api<{ op: { message: string; outcome: string; replayed: boolean }; doc: DocView }>("POST", `${base}/scans`, { body: { code: raw, opId, qty }, idempotencyKey: `scan-${opId}` });
      if (r.ok) {
        setPending(null);
        setDoc(r.data.doc);
        return { ok: true, message: `${r.data.op.message}${r.data.op.replayed ? " (đã lưu từ trước)" : ""}`, stage: "saved" as const };
      }
      if (r.network) {
        // the server may or may not have it: keep the same opId so a re-send can never add twice
        setPending({ raw, opId, qty });
        return { ok: false, message: "Không chắc đã lưu (mất kết nối). Bấm “Gửi lại” — không bị cộng trùng.", stage: "error" as const };
      }
      if (r.error.code === "DOC_NOT_DRAFT") void load();
      return { ok: false, message: r.error.message, stage: r.error.code === "UNKNOWN_CODE" ? ("unknown" as const) : ("error" as const) };
    },
    [base, load],
  );

  useEffect(() => {
    registerScanHandler((_res, raw) => sendScan(raw, newOpId(), multRef.current));
    return () => registerScanHandler(null);
  }, [registerScanHandler, sendScan]);

  const call = async (method: "PATCH" | "POST" | "DELETE", path: string, body?: unknown, key?: string): Promise<ApiResult<DocView>> => {
    setBusy(true);
    const r = await api<DocView>(method, path, { body, idempotencyKey: key });
    setBusy(false);
    if (r.ok) {
      setDoc(r.data);
      setErr("");
    } else {
      setErr(r.error.message);
      if (["LINE_CHANGED", "DOC_CHANGED", "DOC_NOT_DRAFT"].includes(r.error.code)) void load();
    }
    return r;
  };
  const setLine = (l: LineView, patch: Record<string, unknown>) => call("PATCH", `${base}/lines/${l.id}`, { rev: l.rev, ...patch });

  const undo = async () => {
    setBusy(true);
    const r = await api<{ doc: DocView }>("POST", `${base}/undo`, { body: {} });
    setBusy(false);
    if (r.ok) setDoc(r.data.doc);
    else setErr(r.error.message);
  };

  const confirm = async () => {
    if (!doc) return;
    setConfirming(false);
    setBusy(true);
    const extra = kind === "pick" ? { method: method ?? doc.order?.carrierValue ?? "", tracking: tracking ?? doc.order?.tracking ?? "" } : {};
    const r = await api<{ doc: DocView; alreadyConfirmed: boolean }>("POST", `${base}/${CONFIRM_PATH[kind]}`, { body: { version: doc.version, ...extra }, idempotencyKey: `confirm-${doc.id}-${doc.version}${kind === "pick" ? `-${extra.method}-${extra.tracking}`.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 80) : ""}` });
    setBusy(false);
    if (r.ok) {
      setDoc(r.data.doc);
      setErr("");
      return;
    }
    // lost answer: read the document — if it is confirmed, the stored result is shown (never applied twice)
    const fresh = await load();
    if (fresh.ok && fresh.data.status === "confirmed") return;
    setErr(r.error.code === "DOC_CHANGED" ? "Phiếu vừa thay đổi ở thiết bị khác — đã tải lại, xem lại rồi bấm chốt." : r.error.message);
  };

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Array<{ id: number; name: string; sku: string | null }>>([]);
  const searchProducts = async () => {
    const r = await api<Array<{ id: number; name: string; sku: string | null }>>("GET", "products", { query: { search: q, fields: "id,name,sku", perPage: 10 } });
    if (r.ok) setHits(r.data);
  };

  if (!doc) return <p className="text-[14px] text-lien-muted">{err || "Đang tải phiếu…"}</p>;
  const draft = doc.status === "draft";
  const editable = draft && online && !busy;
  const isDirect = kind === "receive" && doc.mode === "direct";

  return (
    <div className="space-y-3" data-testid="doc-panel">
      <div className="rounded-lg border border-[#e5e7eb] bg-white p-3 text-[14px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{doc.code}</span>
          <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${draft ? "bg-amber-100 text-amber-900" : doc.status === "confirmed" ? "bg-green-600 text-white" : "bg-gray-300"}`} data-testid="doc-status">
            {draft ? "Nháp" : doc.status === "confirmed" ? "Đã chốt" : "Đã huỷ"}
          </span>
          <span className="text-lien-muted">{WH[doc.warehouse]}</span>
          <button type="button" className="ml-auto text-[13px] text-lien-blue underline" onClick={() => void load()}>
            Tải lại
          </button>
          <button type="button" className="text-[13px] text-lien-muted underline" onClick={onClose}>
            Đóng
          </button>
        </div>
        <div className="text-[13px] text-lien-muted">
          {doc.order ? `Đơn #${doc.order.number} · ${doc.order.customer}` : doc.shipment ? `Nhận chuyến ${doc.shipment.code}` : kind === "receive" ? "Hàng mới (tạo mã từng cái khi xác nhận)" : "Chỉ các sản phẩm đã đếm mới được điều chỉnh"}
        </div>
        {draft ? (
          <div className="mt-2 flex items-center gap-2 text-[13px]">
            <label htmlFor="mult">Mỗi lần quét =</label>
            <input id="mult" type="number" min={1} max={9999} value={mult} onChange={(e) => setMult(Math.max(1, Math.min(9999, Number.parseInt(e.target.value, 10) || 1)))} className="min-h-11 w-20 rounded-md border border-[#d1d5db] px-2" inputMode="numeric" data-testid="scan-mult" />
            <span>× quy cách (mã H luôn = 1 cái)</span>
          </div>
        ) : null}
      </div>

      {pending ? (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 p-3 text-[14px]" data-testid="pending-scan">
          Lần quét <span className="font-mono">{pending.raw}</span> chưa được máy chủ xác nhận.
          <button type="button" className={`${btn} ml-2 bg-red-600 text-white`} disabled={!online} onClick={() => void sendScan(pending.raw, pending.opId, pending.qty)}>
            Gửi lại
          </button>
        </div>
      ) : null}
      {err ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[14px] font-semibold text-red-700" role="alert">
          {err}
        </p>
      ) : null}

      <ul className="space-y-2" data-testid="doc-lines">
        {doc.lines.map((l) => (
          <li key={l.id} className="rounded-lg border border-[#e5e7eb] bg-white p-2" data-testid="doc-line">
            <div className="flex items-start gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.product.thumb || "/sites/lienstore/brand/no-image.png"} alt="" className="h-12 w-12 shrink-0 rounded object-contain" />
              <div className="min-w-0 flex-1 text-[13px] leading-5">
                <div className="font-semibold">{l.product.name}</div>
                <div className="text-lien-muted">
                  #{l.product.id}
                  {l.product.sku ? ` · ${l.product.sku}` : ""}
                  {l.expiry ? ` · HSD ${l.expiry}` : ""}
                  {l.unitCostJpy !== null ? ` · ¥${l.unitCostJpy}` : ""}
                  {l.billCode ? ` · bill ${l.billCode}` : ""}
                </div>
                <span className={`mt-0.5 inline-block rounded px-1.5 text-[12px] font-semibold ${STATE_CLS[l.state] ?? ""}`}>{l.message || " "}</span>
                {l.unitCodes.length ? <div className="break-all font-mono text-[11px] text-lien-muted">{l.unitCodes.join(" ")}</div> : null}
              </div>
              <div className="text-right">
                <div className="text-[22px] font-bold leading-6" data-testid="line-qty">
                  {l.qty === null ? "–" : l.qty}
                  {l.expected !== null ? <span className="text-[14px] font-normal text-lien-muted">/{kind === "count" ? `sổ ${l.expected}` : l.expected}</span> : null}
                </div>
              </div>
            </div>
            {draft ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className={`${btn} bg-gray-100`} disabled={!editable || (l.qty ?? 0) <= l.unitCodes.length} onClick={() => void setLine(l, { qty: Math.max(0, (l.qty ?? 0) - 1) })} aria-label="Bớt 1">
                  −
                </button>
                <input
                  key={`${l.id}-${l.rev}`}
                  type="number"
                  min={0}
                  defaultValue={l.qty ?? ""}
                  placeholder={kind === "count" ? "chưa đếm" : "0"}
                  className="min-h-11 w-24 rounded-md border border-[#d1d5db] px-2 text-center text-[16px]"
                  inputMode="numeric"
                  disabled={!editable}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    const next = v === "" ? (kind === "count" ? null : 0) : Number.parseInt(v, 10);
                    if (next !== l.qty && (next === null || Number.isInteger(next))) void setLine(l, { qty: next });
                  }}
                  aria-label="Số lượng"
                />
                <button type="button" className={`${btn} bg-gray-100`} disabled={!editable || (l.expected !== null && kind !== "count" && (l.qty ?? 0) >= l.expected)} onClick={() => void setLine(l, { qty: (l.qty ?? 0) + 1 })} aria-label="Thêm 1">
                  +
                </button>
                {kind === "count" && l.state === "drift" ? (
                  <button type="button" className={`${btn} bg-amber-500 text-black`} disabled={!editable} onClick={() => void setLine(l, { acceptDrift: true })}>
                    Số đếm vẫn đúng
                  </button>
                ) : null}
                {kind === "count" && l.qty !== null ? (
                  <button type="button" className={`${btn} bg-gray-100`} disabled={!editable} onClick={() => void setLine(l, { recount: true })}>
                    Đếm lại
                  </button>
                ) : null}
                {isDirect ? (
                  <button type="button" className="text-[13px] text-lien-blue underline" onClick={() => setOpen(open === l.id ? null : l.id)}>
                    HSD / giá / bill
                  </button>
                ) : null}
                {isDirect || kind === "count" ? (
                  <button type="button" className="ml-auto text-[13px] text-red-700 underline" disabled={!editable} onClick={() => void call("DELETE", `${base}/lines/${l.id}`)}>
                    Bỏ dòng
                  </button>
                ) : null}
              </div>
            ) : null}
            {isDirect && open === l.id && draft ? (
              <form
                className="mt-2 grid grid-cols-2 gap-2 text-[13px]"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const cost = String(f.get("cost") ?? "").trim();
                  void setLine(l, { expiry: String(f.get("expiry") ?? "").trim() || null, unitCostJpy: cost ? Number.parseInt(cost, 10) : null, billCode: String(f.get("bill") ?? "").trim() }).then((r) => r.ok && setOpen(null));
                }}
              >
                <input name="expiry" defaultValue={l.expiry ?? ""} placeholder="HSD 2027-03" className="min-h-11 rounded-md border border-[#d1d5db] px-2" />
                <input name="cost" defaultValue={l.unitCostJpy ?? ""} placeholder="Giá ¥ / cái" inputMode="numeric" className="min-h-11 rounded-md border border-[#d1d5db] px-2" />
                <input name="bill" defaultValue={l.billCode} placeholder="Mã bill (tuỳ chọn)" className="min-h-11 rounded-md border border-[#d1d5db] px-2" />
                <button type="submit" className={`${btn} bg-lien-blue text-white`} disabled={!editable}>
                  Lưu dòng
                </button>
                <button type="button" className="col-span-2 text-left text-[13px] text-lien-blue underline" disabled={!editable} onClick={() => void call("POST", `${base}/lines`, { productId: l.product.id }, `line-${newOpId()}`)}>
                  + Dòng khác cho sản phẩm này (HSD / giá khác)
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      {draft && (kind === "count" || isDirect) ? (
        <details className="rounded-lg border border-[#e5e7eb] bg-white p-3 text-[14px]">
          <summary className="font-semibold">Thêm sản phẩm không quét được mã</summary>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void searchProducts();
            }}
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên / SKU" className="min-h-11 min-w-0 flex-1 rounded-md border border-[#d1d5db] px-2" />
            <button type="submit" className={`${btn} bg-gray-200`}>
              Tìm
            </button>
          </form>
          <ul className="mt-2 divide-y">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" className="min-h-11 w-full text-left text-[13px]" disabled={!editable} onClick={() => void call("POST", `${base}/lines`, { productId: h.id }, `line-${newOpId()}`).then(() => setHits([]))}>
                  #{h.id} {h.name} {h.sku ? `· ${h.sku}` : ""}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {doc.status === "confirmed" && doc.result ? (
        <div className="rounded-lg border-2 border-green-600 bg-green-50 p-3 text-[14px]" data-testid="doc-result">
          <div className="font-semibold text-green-900">
            Đã chốt {doc.confirmedAt ? new Date(doc.confirmedAt).toLocaleString("vi-VN") : ""} · {doc.confirmedBy}
          </div>
          <ResultSummary kind={kind} result={doc.result} />
          <button type="button" className={`${btn} mt-2 bg-lien-blue text-white`} onClick={onClose}>
            Phiếu mới
          </button>
        </div>
      ) : null}

      {draft && kind === "pick" ? (
        <div className="grid grid-cols-1 gap-2 rounded-lg border border-[#e5e7eb] bg-white p-3 text-[14px]" data-testid="pick-carrier">
          <label className="font-semibold" htmlFor="pick-method">
            Đơn vị vận chuyển
          </label>
          <select id="pick-method" value={method ?? doc.order?.carrierValue ?? ""} onChange={(e) => setMethod(e.target.value)} className="min-h-11 rounded-md border border-[#d1d5db] px-2" data-testid="pick-method">
            <option value="">— chọn —</option>
            {carriers.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input value={tracking ?? doc.order?.tracking ?? ""} onChange={(e) => setTracking(e.target.value)} placeholder="Mã vận đơn (gõ hoặc quét)" className="min-h-11 rounded-md border border-[#d1d5db] px-2 font-mono" data-testid="pick-tracking" />
        </div>
      ) : null}

      {draft ? (
        <div className="sticky bottom-0 z-10 space-y-2 rounded-t-lg border border-[#e5e7eb] bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <div className="flex justify-between text-[13px]">
            <span>
              {doc.totals.lines} dòng · {doc.totals.qty} cái{doc.totals.expected !== null && kind !== "count" ? ` / ${doc.totals.expected}` : ""}
              {kind === "count" && doc.totals.uncounted ? ` · ${doc.totals.uncounted} chưa đếm (không điều chỉnh)` : ""}
            </span>
            <span className="text-lien-muted">phiên bản {doc.version}</span>
          </div>
          {doc.blockers.length ? <p className="text-[13px] font-semibold text-red-700">{doc.blockers.join(" ")}</p> : null}
          {confirming ? (
            <div className="rounded-md bg-amber-50 p-2 text-[14px]">
              <p className="mb-2">
                {kind === "receive" ? `Nhập ${doc.totals.qty} cái vào ${WH[doc.warehouse]}?` : kind === "count" ? `Điều chỉnh tồn ${WH[doc.warehouse]} theo ${doc.lines.filter((l) => l.qty !== null).length} sản phẩm đã đếm?` : `Đơn #${doc.order?.number} rời kho, chuyển sang Đang giao?`} Không hoàn tác được bằng nút này.
              </p>
              <div className="flex gap-2">
                <button type="button" className={`${btn} flex-1 bg-green-700 text-white`} disabled={busy || !online} onClick={() => void confirm()} data-testid="confirm-yes">
                  Đồng ý
                </button>
                <button type="button" className={`${btn} bg-gray-200`} onClick={() => setConfirming(false)}>
                  Thôi
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" className={`${btn} bg-gray-100`} disabled={!editable} onClick={() => void undo()} data-testid="undo">
                Hoàn tác lần quét
              </button>
              <button type="button" className={`${btn} flex-1 bg-green-700 text-white`} disabled={!editable || doc.blockers.length > 0 || (kind === "pick" && !(method ?? doc.order?.carrierValue))} onClick={() => setConfirming(true)} data-testid="confirm">
                {CONFIRM_LABEL[kind]}
              </button>
            </div>
          )}
          <button
            type="button"
            className="text-[12px] text-red-700 underline"
            disabled={!editable}
            onClick={() => {
              if (window.confirm(`Huỷ ${doc.code}? Phiếu nháp chưa làm thay đổi tồn kho.`)) void call("POST", `${base}/cancel`, {}, `cancel-${doc.id}`);
            }}
          >
            Huỷ phiếu nháp
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ResultSummary({ kind, result }: { kind: DocKind; result: Record<string, unknown> }) {
  if (kind === "receive" && Array.isArray(result.created)) {
    const created = result.created as Array<{ productId: number; qty: number; codes: string[] }>;
    return (
      <ul className="text-[13px]">
        {created.map((c) => (
          <li key={`${c.productId}-${c.codes[0]}`}>
            #{c.productId}: {c.qty} cái · mã {c.codes[0]}
            {c.codes.length > 1 ? ` … ${c.codes[c.codes.length - 1]}` : ""}
          </li>
        ))}
      </ul>
    );
  }
  if (kind === "receive") return <p className="text-[13px]">Đã nhận {String(result.units)} cái vào Kho VN{result.shipmentDone ? " · chuyến đã về đủ" : ` · còn ${String(result.stillPending)} cái chờ nhận`}.</p>;
  if (kind === "count") return <p className="text-[13px]">Thêm {String(result.added)} cái (bill KK), loại {String(result.removed)} cái (thất lạc){result.uncountedIgnored ? ` · ${String(result.uncountedIgnored)} dòng chưa đếm không điều chỉnh` : ""}.</p>;
  return (
    <p className="text-[13px]">
      Đơn #{String(result.orderNumber)}: {String(result.units)} cái đã rời kho · đơn chuyển sang Đang giao{result.carrier ? ` · ${String(result.carrier)}` : ""}
      {result.tracking ? ` · mã ${String(result.tracking)}` : ""}.
    </p>
  );
}
