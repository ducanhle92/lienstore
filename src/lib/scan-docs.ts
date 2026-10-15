import "server-only";
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { recordAudit } from "@/lib/api-tokens";
import { parseScannedCode } from "@/lib/barcodes";
import { type ProductBrief, productBriefSync, resolveParsedSync } from "@/lib/barcodes-db";
import { setOrderLegStatusSync } from "@/lib/db";
import { parseExpiry } from "@/lib/lots";
import { listOrdersReadyToShip } from "@/lib/lots-db";
import { receiptIdForCode } from "@/lib/purchase-batches-db";
import { requireDelivery, requireWarehouse, type ShopWarehouse } from "@/lib/scan-access";
import { DomainError } from "@/lib/service-error";
import { applyLegMethodSync, legMethodOptions } from "@/lib/leg-method";
import { setShipmentStatusSync } from "@/lib/shipments-db";
import { getDb, withTransaction } from "@/lib/sqlite";
import { sortUnits } from "@/lib/units";
import { adjustUnitsToTotalSync, createUnitsSync, moveUnitsSync, touchSync } from "@/lib/units-db";

/**
 * Scan documents of the phone screen (docs/architecture/mobile-scanning.md) — one model, three kinds:
 *   receive  phiếu nhập: `direct` = new goods → createUnitsSync; `shipment` = a packing run arriving → moveUnitsSync(at_shop)
 *   count    phiên kiểm kê: counted totals → adjustUnitsToTotalSync (the stocktake rule the CSV import uses)
 *   pick     phiếu soạn hàng of one order → setOrderLegStatusSync(vn_domestic, sent) (the ⑦ "bắt đầu giao" step)
 * Drafts never touch stock. Every function is synchronous inside ONE transaction (document + stock + op journal), so
 * a retried scan (same opId) or a repeated confirm returns the stored outcome instead of applying twice.
 */

export type DocKind = "receive" | "count" | "pick";
export type DocStatus = "draft" | "confirmed" | "cancelled";
export const DOC_PREFIX: Record<DocKind, string> = { receive: "QN", count: "QK", pick: "QX" };
export const DOC_LABEL: Record<DocKind, string> = { receive: "Phiếu nhập", count: "Phiên kiểm kê", pick: "Phiếu soạn hàng" };
const MAX_LINES = 500;
const MAX_QTY = 9999;
const OP_ID_RE = /^[A-Za-z0-9._:-]{8,100}$/;

export interface DocCtx {
  actor: string;
  permissions: string[];
  tokenId?: number | null;
  requestId?: string;
  ip?: string;
}

interface DocRow {
  id: number;
  code: string;
  kind: DocKind;
  mode: string;
  status: DocStatus;
  warehouse: string;
  shipment_id: number | null;
  order_id: string | null;
  note: string;
  version: number;
  result: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  confirmed_by: string;
  confirmed_at: string | null;
}
interface LineRow {
  id: number;
  doc_id: number;
  product_id: number;
  qty: number | null;
  expected: number | null;
  expected_at: string | null;
  unit_codes: string;
  expiry: string | null;
  unit_cost_jpy: number | null;
  bill_code: string;
  note: string;
  rev: number;
  created_at: string;
  updated_at: string;
}

export interface LineView {
  id: number;
  rev: number;
  product: ProductBrief;
  qty: number | null;
  expected: number | null;
  /** count: system total at the warehouse NOW (drift when ≠ expected). */
  current?: number;
  unitCodes: string[];
  expiry: string | null;
  unitCostJpy: number | null;
  billCode: string;
  state: "ok" | "short" | "over" | "uncounted" | "drift" | "empty" | "match" | "diff";
  message: string;
}

export interface DocView {
  id: number;
  code: string;
  kind: DocKind;
  mode: string;
  status: DocStatus;
  warehouse: ShopWarehouse;
  version: number;
  note: string;
  shipment: { id: number; code: string; status: string } | null;
  order: { id: string; number: number; customer: string; shipStage: string; carrier: string; carrierValue: string; tracking: string } | null;
  lines: LineView[];
  totals: { lines: number; qty: number; expected: number | null; uncounted?: number; drift?: number };
  /** Why confirming is not possible right now (empty = ready). */
  blockers: string[];
  result: unknown;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  confirmedBy: string;
  confirmedAt: string | null;
}

const now = () => new Date().toISOString();
const parseCodes = (s: string): string[] => {
  try {
    const v = JSON.parse(s) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const statusAt: Record<ShopWarehouse, string> = { vn: "at_shop", jp: "bought" };

function docRow(db: DatabaseSync, id: number, kind?: DocKind): DocRow {
  const d = db.prepare("SELECT * FROM scan_docs WHERE id = ?").get(id) as DocRow | undefined;
  if (!d || (kind && d.kind !== kind)) throw new DomainError(404, "NOT_FOUND", `Không có ${kind ? DOC_LABEL[kind].toLowerCase() : "phiếu"} #${id}.`);
  return d;
}
function lineRows(db: DatabaseSync, docId: number): LineRow[] {
  return db.prepare("SELECT * FROM scan_lines WHERE doc_id = ? ORDER BY id").all(docId) as unknown as LineRow[];
}
function bump(db: DatabaseSync, docId: number): void {
  db.prepare("UPDATE scan_docs SET version = version + 1, updated_at = ? WHERE id = ?").run(now(), docId);
}
function requireDraft(d: DocRow): void {
  if (d.status !== "draft") throw new DomainError(409, "DOC_NOT_DRAFT", `${DOC_LABEL[d.kind]} ${d.code} đã ${d.status === "confirmed" ? "chốt" : "huỷ"} — không sửa được nữa.`, { status: d.status });
}
/** Writing to a document needs the same rights as creating it (warehouse / delivery). */
function requireDocRights(d: DocRow, perms: string[]): void {
  if (d.kind === "pick") requireDelivery(perms);
  else requireWarehouse(perms, d.warehouse);
}

/** All units at the warehouse (free, held for orders, boxed) — what a person can count on the shelf. */
function systemTotal(db: DatabaseSync, productId: number, w: ShopWarehouse): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM stock_units WHERE product_id = ? AND removed IS NULL AND status = ?").get(productId, statusAt[w]) as { n: number }).n);
}
/** The units a stock count may add to / write off: free, not boxed (lib/units-db adjustUnitsToTotalSync). */
function freeAdjustable(db: DatabaseSync, productId: number, w: ShopWarehouse): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM stock_units WHERE product_id = ? AND removed IS NULL AND order_item_id IS NULL AND shipment_id IS NULL AND status = ?").get(productId, statusAt[w]) as { n: number }).n);
}

/** Units of the run not received yet (still before the shop), per product. */
function shipmentPending(db: DatabaseSync, shipmentId: number): Array<{ id: number; code: string; product_id: number; status: string; expiry: string | null; bought_at: string | null }> {
  return db.prepare("SELECT id, code, product_id, status, expiry, bought_at FROM stock_units WHERE shipment_id = ? AND removed IS NULL AND status IN ('bought','to_carrier_jp','shipped_jp_vn','at_carrier_vn','to_shop')").all(shipmentId) as unknown as Array<{ id: number; code: string; product_id: number; status: string; expiry: string | null; bought_at: string | null }>;
}

/** The order's units held at Kho VN per line (pick). */
function orderUnits(db: DatabaseSync, orderId: string): Array<{ code: string; product_id: number; status: string; item_id: number }> {
  return db.prepare("SELECT u.code, u.product_id, u.status, u.order_item_id AS item_id FROM stock_units u JOIN order_items oi ON oi.id = u.order_item_id WHERE oi.order_id = ? AND u.removed IS NULL").all(orderId) as unknown as Array<{ code: string; product_id: number; status: string; item_id: number }>;
}

// ---------------------------------------------------------------------------------------------------------------------
// read

function viewOf(db: DatabaseSync, d: DocRow): DocView {
  const rows = lineRows(db, d.id);
  const w = (d.warehouse === "jp" ? "jp" : "vn") as ShopWarehouse;
  const blockers: string[] = [];
  const lines: LineView[] = rows.map((r) => {
    const product = productBriefSync(db, r.product_id) ?? { id: r.product_id, name: `#${r.product_id} (đã xoá)`, sku: null, thumb: "", status: "draft" as const, saleStatus: "instock" as const, adminUrl: "", stockUrl: "" };
    const base = { id: r.id, rev: r.rev, product, qty: r.qty, expected: r.expected, unitCodes: parseCodes(r.unit_codes), expiry: r.expiry, unitCostJpy: r.unit_cost_jpy, billCode: r.bill_code };
    if (d.kind === "count") {
      if (r.qty === null) return { ...base, state: "uncounted" as const, message: "Chưa đếm" };
      const current = d.status === "draft" ? systemTotal(db, r.product_id, w) : (r.expected ?? 0);
      if (d.status === "draft" && r.expected !== null && current !== r.expected) return { ...base, current, state: "drift" as const, message: `Tồn hệ thống đã đổi ${r.expected} → ${current} trong lúc đếm — đếm lại hoặc xác nhận số đếm.` };
      const diff = r.qty - (r.expected ?? 0);
      return { ...base, current, state: diff === 0 ? ("match" as const) : ("diff" as const), message: diff === 0 ? "Khớp" : `Chênh ${diff > 0 ? "+" : ""}${diff}` };
    }
    if (d.kind === "pick" || d.mode === "shipment") {
      const q = r.qty ?? 0;
      const e = r.expected ?? 0;
      return { ...base, state: q === e ? ("ok" as const) : q < e ? ("short" as const) : ("over" as const), message: q === e ? "Đủ" : q < e ? `Còn thiếu ${e - q}` : `Vượt ${q - e}` };
    }
    return { ...base, state: (r.qty ?? 0) > 0 ? ("ok" as const) : ("empty" as const), message: (r.qty ?? 0) > 0 ? "" : "Số lượng 0 — không nhập" };
  });
  let shipment: DocView["shipment"] = null;
  let order: DocView["order"] = null;
  if (d.shipment_id) {
    const s = db.prepare("SELECT id, code, status FROM shipments WHERE id = ?").get(d.shipment_id) as { id: number; code: string; status: string } | undefined;
    shipment = s ?? null;
  }
  if (d.order_id) {
    const o = db.prepare("SELECT id, number, first_name, last_name, ship_stage FROM orders WHERE id = ?").get(d.order_id) as { id: string; number: number; first_name: string; last_name: string; ship_stage: string | null } | undefined;
    const leg = db.prepare("SELECT method_id, label, tracking FROM order_legs WHERE order_id = ? AND leg = 'vn_domestic'").get(d.order_id) as { method_id: number | null; label: string; tracking: string } | undefined;
    if (o) order = { id: o.id, number: o.number, customer: `${o.last_name} ${o.first_name}`.trim(), shipStage: o.ship_stage ?? "ordered", carrier: leg?.label ?? "", carrierValue: leg?.method_id ? String(leg.method_id) : leg?.label ? "pickup" : "", tracking: leg?.tracking ?? "" };
  }
  if (d.status === "draft") {
    if (d.kind === "receive" && !lines.some((l) => (l.qty ?? 0) > 0)) blockers.push("Chưa có dòng nào có số lượng.");
    if (d.kind === "count") {
      if (!lines.some((l) => l.qty !== null)) blockers.push("Chưa đếm sản phẩm nào.");
      const drift = lines.filter((l) => l.state === "drift");
      if (drift.length) blockers.push(`${drift.length} dòng có biến động tồn trong lúc đếm — đếm lại hoặc xác nhận.`);
    }
    if (d.kind === "pick") {
      const bad = lines.filter((l) => l.state !== "ok");
      if (bad.length) blockers.push(`${bad.length} dòng chưa đủ / sai số lượng — không hoàn tất được.`);
      if (order && (order.shipStage === "delivering" || order.shipStage === "delivered")) blockers.push(`Đơn #${order.number} đã ở bước giao hàng.`);
    }
  }
  const qty = lines.reduce((n, l) => n + (l.qty ?? 0), 0);
  const expected = d.kind === "pick" || d.mode === "shipment" || d.kind === "count" ? lines.reduce((n, l) => n + (l.expected ?? 0), 0) : null;
  let result: unknown = null;
  try {
    result = d.result ? JSON.parse(d.result) : null;
  } catch {
    result = null;
  }
  return {
    id: d.id,
    code: d.code,
    kind: d.kind,
    mode: d.mode,
    status: d.status,
    warehouse: w,
    version: d.version,
    note: d.note,
    shipment,
    order,
    lines,
    totals: { lines: lines.length, qty, expected, ...(d.kind === "count" ? { uncounted: lines.filter((l) => l.qty === null).length, drift: lines.filter((l) => l.state === "drift").length } : {}) },
    blockers,
    result,
    createdBy: d.created_by,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    confirmedBy: d.confirmed_by,
    confirmedAt: d.confirmed_at,
  };
}

export function getDoc(kind: DocKind, id: number): DocView {
  const db = getDb();
  return viewOf(db, docRow(db, id, kind));
}

export function listDocs(kind: DocKind, f: { status?: DocStatus | "all"; warehouse?: ShopWarehouse; limit?: number } = {}): Array<Omit<DocView, "lines" | "blockers" | "result">> {
  const db = getDb();
  const where = ["kind = ?"];
  const args: unknown[] = [kind];
  if (f.status && f.status !== "all") {
    where.push("status = ?");
    args.push(f.status);
  }
  if (f.warehouse) {
    where.push("warehouse = ?");
    args.push(f.warehouse);
  }
  const rows = db.prepare(`SELECT * FROM scan_docs WHERE ${where.join(" AND ")} ORDER BY updated_at DESC, id DESC LIMIT ?`).all(...(args as never[]), Math.min(Math.max(f.limit ?? 30, 1), 200)) as unknown as DocRow[];
  return rows.map((d) => {
    const { lines, blockers, result, ...rest } = viewOf(db, d);
    void lines;
    void blockers;
    void result;
    return rest;
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// create

function nextCode(db: DatabaseSync, kind: DocKind): string {
  const day = now().slice(0, 10);
  const stem = `${DOC_PREFIX[kind]}-${day.slice(2, 4)}${day.slice(5, 7)}${day.slice(8, 10)}-`;
  const n = Number((db.prepare("SELECT COUNT(*) AS n FROM scan_docs WHERE code LIKE ?").get(`${stem}%`) as { n: number }).n);
  let seq = n + 1;
  while (db.prepare("SELECT 1 FROM scan_docs WHERE code = ?").get(`${stem}${String(seq).padStart(2, "0")}`)) seq++;
  return `${stem}${String(seq).padStart(2, "0")}`;
}

export interface CreateInput {
  warehouse?: unknown;
  mode?: unknown;
  shipmentId?: unknown;
  orderId?: unknown;
  orderNumber?: unknown;
  note?: unknown;
}

/** New draft. One open draft per shipment / per order: asking again returns 409 DOC_EXISTS with its id (join it). */
export function createDoc(kind: DocKind, input: CreateInput, ctx: DocCtx): DocView {
  const db = getDb();
  const note = typeof input.note === "string" ? input.note.slice(0, 300) : "";
  return withTransaction(db, () => {
    const ts = now();
    let warehouse: ShopWarehouse = "vn";
    let mode = "";
    let shipmentId: number | null = null;
    let orderId: string | null = null;
    const lines: Array<{ productId: number; expected: number | null }> = [];
    if (kind === "receive") {
      mode = input.mode === "shipment" ? "shipment" : input.mode === undefined || input.mode === "direct" ? "direct" : "";
      if (!mode) throw new DomainError(422, "VALIDATION_FAILED", 'mode: "direct" (hàng mới) hoặc "shipment" (nhận chuyến).', { fields: { mode: "direct | shipment" } });
      warehouse = requireWarehouse(ctx.permissions, input.warehouse ?? (mode === "shipment" ? "vn" : undefined));
      if (mode === "shipment") {
        if (warehouse !== "vn") throw new DomainError(422, "VALIDATION_FAILED", "Nhận chuyến chỉ làm ở Kho VN.");
        const sid = typeof input.shipmentId === "number" ? input.shipmentId : Number.parseInt(String(input.shipmentId ?? ""), 10);
        const sh = Number.isInteger(sid) ? (db.prepare("SELECT id, code, status FROM shipments WHERE id = ?").get(sid) as { id: number; code: string; status: string } | undefined) : undefined;
        if (!sh) throw new DomainError(404, "NOT_FOUND", "Không có chuyến hàng này.");
        if (sh.status === "packing" || sh.status === "packed") throw new DomainError(409, "SHIPMENT_NOT_SENT", `Chuyến ${sh.code} còn ở Kho Nhật (chưa giao ĐVVC).`);
        const open = db.prepare("SELECT id, code FROM scan_docs WHERE kind = 'receive' AND status = 'draft' AND shipment_id = ?").get(sh.id) as { id: number; code: string } | undefined;
        if (open) throw new DomainError(409, "DOC_EXISTS", `Chuyến ${sh.code} đang có phiếu nhận ${open.code} — mở phiếu đó.`, { docId: open.id });
        const pending = shipmentPending(db, sh.id);
        if (!pending.length) throw new DomainError(409, "NOTHING_PENDING", `Mọi cái của chuyến ${sh.code} đã về kho.`);
        const byProduct = new Map<number, number>();
        for (const u of pending) byProduct.set(u.product_id, (byProduct.get(u.product_id) ?? 0) + 1);
        for (const [productId, n] of byProduct) lines.push({ productId, expected: n });
        shipmentId = sh.id;
      }
    } else if (kind === "count") {
      warehouse = requireWarehouse(ctx.permissions, input.warehouse);
    } else {
      requireDelivery(ctx.permissions);
      const o = (typeof input.orderId === "string" && input.orderId ? db.prepare("SELECT id, number, ship_stage FROM orders WHERE id = ?").get(input.orderId) : Number.isInteger(input.orderNumber) ? db.prepare("SELECT id, number, ship_stage FROM orders WHERE number = ?").get(input.orderNumber as number) : undefined) as { id: string; number: number; ship_stage: string | null } | undefined;
      if (!o) throw new DomainError(404, "NOT_FOUND", "Không có đơn hàng này.");
      if (!listOrdersReadyToShip(db).some((r) => r.orderId === o.id)) throw new DomainError(409, "ORDER_NOT_READY", `Đơn #${o.number} chưa sẵn sàng giao (cần đã thanh toán/COD, mọi cái ở Kho VN, chưa giao).`);
      const open = db.prepare("SELECT id, code FROM scan_docs WHERE kind = 'pick' AND status = 'draft' AND order_id = ?").get(o.id) as { id: number; code: string } | undefined;
      if (open) throw new DomainError(409, "DOC_EXISTS", `Đơn #${o.number} đang có phiếu soạn ${open.code} — mở phiếu đó.`, { docId: open.id });
      for (const it of db.prepare("SELECT product_id, SUM(quantity) AS q FROM order_items WHERE order_id = ? GROUP BY product_id ORDER BY MIN(id)").all(o.id) as Array<{ product_id: number; q: number }>) lines.push({ productId: it.product_id, expected: Number(it.q) });
      orderId = o.id;
    }
    const code = nextCode(db, kind);
    const r = db.prepare("INSERT INTO scan_docs (code, kind, mode, status, warehouse, shipment_id, order_id, note, version, created_by, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, 1, ?, ?, ?)").run(code, kind, mode, warehouse, shipmentId, orderId, note, ctx.actor.slice(0, 120), ts, ts);
    const id = Number(r.lastInsertRowid);
    const ins = db.prepare("INSERT INTO scan_lines (doc_id, product_id, qty, expected, expected_at, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?, ?)");
    for (const l of lines) ins.run(id, l.productId, l.expected, ts, ts, ts);
    recordAudit({ actor: ctx.actor, tokenId: ctx.tokenId, action: `scan.${kind}.create`, target: `scan:${code}`, changes: { warehouse, mode, shipmentId, orderId, lines: lines.length }, requestId: ctx.requestId, ip: ctx.ip });
    return viewOf(db, docRow(db, id));
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// scan (one deliberate scan = one opId)

export interface ScanInput {
  code: unknown;
  opId: unknown;
  /** How many of the scanned code (× its pack size); default 1. */
  qty?: unknown;
}
export interface ScanOutcome {
  opId: string;
  lineId: number;
  delta: number;
  outcome: "added" | "unit_added" | "duplicate_unit";
  message: string;
  replayed: boolean;
}

const requestFingerprint = (code: string, qty: number) => createHash("sha256").update(`${code}\n${qty}`).digest("hex").slice(0, 32);

export function scanIntoDoc(kind: DocKind, docId: number, input: ScanInput, ctx: DocCtx): { op: ScanOutcome; doc: DocView } {
  const opId = typeof input.opId === "string" ? input.opId : "";
  if (!OP_ID_RE.test(opId)) throw new DomainError(422, "VALIDATION_FAILED", "opId: 8–100 ký tự [A-Za-z0-9._:-], mới cho mỗi lần quét có chủ ý.", { fields: { opId: "required" } });
  const raw = typeof input.code === "string" ? input.code : "";
  if (!raw.trim() || raw.length > 256) throw new DomainError(422, "VALIDATION_FAILED", "Thiếu mã hoặc mã quá dài.", { fields: { code: "required" } });
  const n = input.qty === undefined ? 1 : input.qty;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_QTY) throw new DomainError(422, "VALIDATION_FAILED", `qty: số nguyên 1–${MAX_QTY}.`, { fields: { qty: `1–${MAX_QTY}` } });
  const db = getDb();
  return withTransaction(db, () => {
    const d = docRow(db, docId, kind);
    const fp = requestFingerprint(raw.trim(), n);
    const prev = db.prepare("SELECT * FROM scan_ops WHERE doc_id = ? AND op_id = ?").get(docId, opId) as { request: string; response: string | null } | undefined;
    if (prev) {
      if (prev.request !== fp) throw new DomainError(422, "OP_ID_REUSED", "opId này đã dùng cho một lần quét khác — mỗi lần quét cần opId mới.");
      const op = { ...(JSON.parse(prev.response ?? "{}") as ScanOutcome), replayed: true };
      return { op, doc: viewOf(db, d) };
    }
    requireDocRights(d, ctx.permissions);
    requireDraft(d);
    const res = resolveParsedSync(db, parseScannedCode(raw));
    if (res.kind === "invalid" || res.kind === "unsupported_qr") throw new DomainError(422, "INVALID_CODE", res.message);
    if (res.kind === "unknown") throw new DomainError(404, "UNKNOWN_CODE", `${res.code}: ${res.message}`, { scannedCode: res.code });
    if (res.kind === "conflict") throw new DomainError(409, "CODE_CONFLICT", res.message, { scannedCode: res.code, candidates: res.candidates.map((c) => c.id) });
    const productId = res.product.id;
    const unitCode = res.kind === "unit" ? res.code : null;
    const delta = unitCode ? 1 : n * res.packQty;
    const w = d.warehouse as ShopWarehouse;
    const rows = lineRows(db, docId);
    let line = rows.filter((r) => r.product_id === productId).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)[0];
    const name = res.product.name;
    // a unit found here while the book has it elsewhere still counts here (the count corrects the book) — say so
    const elsewhere = kind === "count" && res.kind === "unit" && res.unit.warehouse !== w ? ` · sổ ghi cái này ở "${res.unit.place}"` : "";

    // ---- rules per kind ----
    if (unitCode && res.kind === "unit") {
      const u = res.unit;
      if (kind === "receive" && d.mode !== "shipment") throw new DomainError(422, "UNIT_ALREADY_IN_STOCK", `${unitCode} là hàng đã có trong sổ kho (${u.place}) — phiếu hàng mới chỉ nhận mã sản phẩm. Hàng về theo chuyến: dùng phiếu nhận chuyến.`);
      if (u.removed) throw new DomainError(422, "UNIT_REMOVED", `${unitCode} đã bị loại khỏi kho (${u.removed}).`);
      if (kind === "count" && (u.status === "shipped_to_customer" || u.status === "delivered")) throw new DomainError(422, "UNIT_DELIVERED", `${unitCode} đã giao cho khách — hàng khách trả lại nhập ở trang tồn kho sản phẩm (Khách trả lại).`);
      if (kind === "count" && (u.status === "not_bought" || u.status === "ordered")) throw new DomainError(422, "UNIT_NOT_IN_HAND", `${unitCode} trong sổ vẫn là "chưa mua / đã đặt" — kiểm tra lại nhãn.`);
      if (kind === "receive") {
        const inRun = db.prepare("SELECT shipment_id, status FROM stock_units WHERE code = ?").get(unitCode) as { shipment_id: number | null; status: string };
        if (inRun.shipment_id !== d.shipment_id) throw new DomainError(422, "UNIT_NOT_IN_SHIPMENT", `${unitCode} không thuộc chuyến này.`);
        if (inRun.status === "at_shop") throw new DomainError(422, "UNIT_ALREADY_RECEIVED", `${unitCode} đã nhận vào Kho VN rồi.`);
      }
      if (kind === "pick") {
        const mine = orderUnits(db, d.order_id!).find((x) => x.code === unitCode);
        if (!mine) {
          const expectedCodes = orderUnits(db, d.order_id!).filter((x) => x.product_id === productId).map((x) => x.code);
          throw new DomainError(422, expectedCodes.length ? "WRONG_UNIT" : "WRONG_PRODUCT", expectedCodes.length ? `${unitCode} không phải cái giữ cho đơn này — lấy ${expectedCodes.join(", ")}.` : `${name} không có trong đơn.`);
        }
        if (mine.status !== "at_shop") throw new DomainError(422, "WRONG_WAREHOUSE", `${unitCode} không ở Kho VN.`);
      }
      if (line && parseCodes(line.unit_codes).includes(unitCode)) {
        const op: ScanOutcome = { opId, lineId: line.id, delta: 0, outcome: "duplicate_unit", message: `${unitCode} đã được ghi nhận trong phiếu — không cộng thêm.`, replayed: false };
        db.prepare("INSERT INTO scan_ops (doc_id, op_id, line_id, kind, code_raw, code, delta, unit_code, request, response, actor, created_at) VALUES (?, ?, ?, 'scan', ?, ?, 0, ?, ?, ?, ?, ?)").run(docId, opId, line.id, raw.slice(0, 256), res.code, unitCode, fp, JSON.stringify(op), ctx.actor.slice(0, 120), now());
        return { op, doc: viewOf(db, d) };
      }
    }
    if ((kind === "pick" || d.mode === "shipment") && !line) throw new DomainError(422, "WRONG_PRODUCT", `${name} không có trong ${kind === "pick" ? "đơn" : "chuyến"} này.`);

    const ts = now();
    let wasNull = false;
    if (!line) {
      if (rows.length >= MAX_LINES) throw new DomainError(422, "TOO_MANY_LINES", `Tối đa ${MAX_LINES} dòng mỗi phiếu.`);
      const r = db.prepare("INSERT INTO scan_lines (doc_id, product_id, qty, expected, expected_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(docId, productId, kind === "count" ? null : 0, kind === "count" ? systemTotal(db, productId, w) : null, kind === "count" ? ts : null, ts, ts);
      line = db.prepare("SELECT * FROM scan_lines WHERE id = ?").get(Number(r.lastInsertRowid)) as unknown as LineRow;
    }
    const codes = parseCodes(line.unit_codes);
    let qty = line.qty ?? 0;
    if (line.qty === null) {
      wasNull = true;
      // first count of this product: snapshot the book total now
      db.prepare("UPDATE scan_lines SET expected = ?, expected_at = ? WHERE id = ?").run(systemTotal(db, productId, w), ts, line.id);
    }
    // every physical item is scanned once — by its unit code (deduplicated above) or by a product code (+pack size)
    const applied = delta;
    if (unitCode) codes.push(unitCode);
    qty += delta;
    if ((kind === "pick" || d.mode === "shipment") && qty > (line.expected ?? 0)) {
      throw new DomainError(422, "OVER_QUANTITY", `${name}: ${kind === "pick" ? "đơn cần" : "chuyến có"} ${line.expected ?? 0}, đã quét ${line.qty ?? 0} — lần quét này làm vượt số lượng.`, { lineId: line.id, expected: line.expected, qty: line.qty });
    }
    if (qty > MAX_QTY * 10) throw new DomainError(422, "VALIDATION_FAILED", "Số lượng quá lớn.");
    db.prepare("UPDATE scan_lines SET qty = ?, unit_codes = ?, rev = rev + 1, updated_at = ? WHERE id = ?").run(qty, JSON.stringify(codes), ts, line.id);
    const outcome: ScanOutcome = { opId, lineId: line.id, delta: applied, outcome: unitCode ? "unit_added" : "added", message: `${name}: ${kind === "count" ? "đã đếm" : kind === "pick" ? "đã soạn" : "nhập"} ${qty}${line.expected !== null && kind !== "count" ? `/${line.expected}` : ""}${res.packQty > 1 && !unitCode ? ` (+${delta} = ${n} ${res.packLabel || "gói"} × ${res.packQty})` : ""}${elsewhere}`, replayed: false };
    db.prepare("INSERT INTO scan_ops (doc_id, op_id, line_id, kind, code_raw, code, delta, unit_code, request, response, actor, created_at) VALUES (?, ?, ?, 'scan', ?, ?, ?, ?, ?, ?, ?, ?)").run(docId, opId, line.id, raw.slice(0, 256), res.code, applied, unitCode, fp + (wasNull ? ":wasNull" : ""), JSON.stringify(outcome), ctx.actor.slice(0, 120), ts);
    bump(db, docId);
    return { op: outcome, doc: viewOf(db, docRow(db, docId)) };
  });
}

/** Undo the last scan of the document (or a given opId): its quantity / unit code are taken back. */
export function undoScan(kind: DocKind, docId: number, input: { opId?: unknown }, ctx: DocCtx): { undone: { opId: string; lineId: number | null; delta: number } | null; doc: DocView } {
  const db = getDb();
  return withTransaction(db, () => {
    const d = docRow(db, docId, kind);
    requireDocRights(d, ctx.permissions);
    requireDraft(d);
    const op = (typeof input.opId === "string"
      ? db.prepare("SELECT * FROM scan_ops WHERE doc_id = ? AND op_id = ? AND kind = 'scan'").get(docId, input.opId)
      : db.prepare("SELECT * FROM scan_ops WHERE doc_id = ? AND kind = 'scan' AND undone_at IS NULL ORDER BY id DESC LIMIT 1").get(docId)) as { id: number; op_id: string; line_id: number | null; delta: number; unit_code: string | null; request: string; undone_at: string | null } | undefined;
    if (!op) throw new DomainError(404, "NOTHING_TO_UNDO", "Không có lần quét nào để hoàn tác.");
    if (op.undone_at) return { undone: { opId: op.op_id, lineId: op.line_id, delta: 0 }, doc: viewOf(db, d) };
    const line = op.line_id ? (db.prepare("SELECT * FROM scan_lines WHERE id = ?").get(op.line_id) as LineRow | undefined) : undefined;
    const ts = now();
    if (line) {
      const codes = parseCodes(line.unit_codes).filter((c) => c !== op.unit_code);
      const qty = Math.max(codes.length, (line.qty ?? 0) - op.delta);
      const backToNull = kind === "count" && op.request.endsWith(":wasNull") && qty === 0 && codes.length === 0;
      db.prepare("UPDATE scan_lines SET qty = ?, unit_codes = ?, rev = rev + 1, updated_at = ? WHERE id = ?").run(backToNull ? null : qty, JSON.stringify(codes), ts, line.id);
    }
    db.prepare("UPDATE scan_ops SET undone_at = ? WHERE id = ?").run(ts, op.id);
    bump(db, docId);
    return { undone: { opId: op.op_id, lineId: op.line_id, delta: op.delta }, doc: viewOf(db, docRow(db, docId)) };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// edit a line (absolute values → needs the line's rev: two phones editing the same line get 409)

export interface LineInput {
  rev?: unknown;
  qty?: unknown;
  expiry?: unknown;
  unitCostJpy?: unknown;
  billCode?: unknown;
  /** count: clear the count of this line (đếm lại) */
  recount?: unknown;
  /** count: the book changed while counting and the count is still right — take the current book total as reference */
  acceptDrift?: unknown;
}

export function updateLine(kind: DocKind, docId: number, lineId: number, input: LineInput, ctx: DocCtx): DocView {
  const db = getDb();
  return withTransaction(db, () => {
    const d = docRow(db, docId, kind);
    requireDocRights(d, ctx.permissions);
    requireDraft(d);
    const line = db.prepare("SELECT * FROM scan_lines WHERE id = ? AND doc_id = ?").get(lineId, docId) as LineRow | undefined;
    if (!line) throw new DomainError(404, "NOT_FOUND", "Không có dòng này.");
    if (typeof input.rev !== "number" || input.rev !== line.rev) throw new DomainError(409, "LINE_CHANGED", "Dòng này vừa được sửa ở thiết bị khác — tải lại phiếu rồi sửa lại.", { rev: line.rev, qty: line.qty });
    const w = d.warehouse as ShopWarehouse;
    const ts = now();
    const set: Record<string, unknown> = {};
    const fields: Record<string, string> = {};
    if (input.recount === true) {
      if (kind !== "count") throw new DomainError(422, "VALIDATION_FAILED", "Chỉ phiên kiểm kê mới đếm lại.");
      Object.assign(set, { qty: null, unit_codes: "[]", expected: systemTotal(db, line.product_id, w), expected_at: ts });
    }
    if (input.acceptDrift === true) {
      if (kind !== "count") throw new DomainError(422, "VALIDATION_FAILED", "Chỉ phiên kiểm kê.");
      Object.assign(set, { expected: systemTotal(db, line.product_id, w), expected_at: ts });
    }
    if (input.qty !== undefined) {
      const q = input.qty;
      if (q === null && kind === "count") Object.assign(set, { qty: null, unit_codes: "[]" });
      else if (typeof q !== "number" || !Number.isInteger(q) || q < 0 || q > MAX_QTY * 10) fields.qty = `Số nguyên 0–${MAX_QTY * 10}${kind === "count" ? " (hoặc null = chưa đếm)" : ""}.`;
      else {
        const codes = parseCodes(line.unit_codes);
        if (q < codes.length) fields.qty = `Đã quét ${codes.length} mã từng cái — bỏ bớt bằng Hoàn tác, không đặt thấp hơn.`;
        else if ((kind === "pick" || d.mode === "shipment") && q > (line.expected ?? 0)) fields.qty = `Không vượt ${line.expected ?? 0}.`;
        else {
          set.qty = q;
          if (kind === "count" && line.qty === null) Object.assign(set, { expected: systemTotal(db, line.product_id, w), expected_at: ts });
        }
      }
    }
    if (input.expiry !== undefined) {
      if (kind !== "receive" || d.mode !== "direct") fields.expiry = "Chỉ phiếu nhập hàng mới ghi hạn dùng.";
      else if (input.expiry === null || input.expiry === "") set.expiry = null;
      else {
        const e = typeof input.expiry === "string" ? parseExpiry(input.expiry) : null;
        if (!e) fields.expiry = "Hạn dùng: 2027-03-31, 31/03/2027 hoặc 2027-03.";
        else set.expiry = e;
      }
    }
    if (input.unitCostJpy !== undefined) {
      if (!ctx.permissions.includes("see_cost")) throw new DomainError(403, "FORBIDDEN", "Cần quyền “Xem giá vốn” để ghi giá ¥.");
      if (kind !== "receive" || d.mode !== "direct") fields.unitCostJpy = "Chỉ phiếu nhập hàng mới.";
      else if (input.unitCostJpy !== null && (typeof input.unitCostJpy !== "number" || !Number.isInteger(input.unitCostJpy) || input.unitCostJpy < 0)) fields.unitCostJpy = "Số nguyên ¥ ≥ 0 hoặc null.";
      else set.unit_cost_jpy = input.unitCostJpy;
    }
    if (input.billCode !== undefined) {
      if (kind !== "receive" || d.mode !== "direct") fields.billCode = "Chỉ phiếu nhập hàng mới.";
      else if (typeof input.billCode !== "string" || input.billCode.length > 60) fields.billCode = "Chuỗi ≤ 60 ký tự.";
      else set.bill_code = input.billCode.trim();
    }
    if (Object.keys(fields).length) throw new DomainError(422, "VALIDATION_FAILED", "Dữ liệu không hợp lệ.", { fields });
    if (!Object.keys(set).length) throw new DomainError(400, "BAD_REQUEST", "Không có gì để sửa.");
    const cols = Object.keys(set);
    db.prepare(`UPDATE scan_lines SET ${cols.map((c) => `${c} = ?`).join(", ")}, rev = rev + 1, updated_at = ? WHERE id = ?`).run(...(cols.map((c) => set[c]) as never[]), ts, lineId);
    db.prepare("INSERT INTO scan_ops (doc_id, op_id, line_id, kind, request, actor, created_at) VALUES (?, ?, ?, 'set', ?, ?, ?)").run(docId, `set-${lineId}-${line.rev}`, lineId, JSON.stringify(set).slice(0, 500), ctx.actor.slice(0, 120), ts);
    bump(db, docId);
    return viewOf(db, docRow(db, docId));
  });
}

/** A line without scanning: receive (direct) → another line of the product (other expiry / price), qty 0;
 *  count → the product is in scope, "chưa đếm" until a number is set (counted 0 ≠ not counted). */
export function addLine(kind: DocKind, docId: number, input: { productId?: unknown }, ctx: DocCtx): DocView {
  const db = getDb();
  return withTransaction(db, () => {
    const d = docRow(db, docId, kind);
    requireDocRights(d, ctx.permissions);
    requireDraft(d);
    if (!(kind === "count" || (kind === "receive" && d.mode === "direct"))) throw new DomainError(422, "VALIDATION_FAILED", "Phiếu này chỉ có các dòng của đơn / chuyến.");
    const pid = typeof input.productId === "number" && Number.isInteger(input.productId) ? input.productId : 0;
    if (!productBriefSync(db, pid)) throw new DomainError(404, "NOT_FOUND", `Không có sản phẩm #${pid}.`);
    const lines = lineRows(db, docId);
    if (lines.length >= MAX_LINES) throw new DomainError(422, "TOO_MANY_LINES", `Tối đa ${MAX_LINES} dòng mỗi phiếu.`);
    if (kind === "count" && lines.some((l) => l.product_id === pid)) return viewOf(db, d);
    const ts = now();
    if (kind === "count") db.prepare("INSERT INTO scan_lines (doc_id, product_id, qty, expected, expected_at, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?)").run(docId, pid, systemTotal(db, pid, d.warehouse as ShopWarehouse), ts, ts, ts);
    else db.prepare("INSERT INTO scan_lines (doc_id, product_id, qty, created_at, updated_at) VALUES (?, ?, 0, ?, ?)").run(docId, pid, ts, ts);
    bump(db, docId);
    return viewOf(db, docRow(db, docId));
  });
}

export function removeLine(kind: DocKind, docId: number, lineId: number, ctx: DocCtx): DocView {
  const db = getDb();
  return withTransaction(db, () => {
    const d = docRow(db, docId, kind);
    requireDocRights(d, ctx.permissions);
    requireDraft(d);
    if (kind === "pick" || d.mode === "shipment") throw new DomainError(422, "VALIDATION_FAILED", "Dòng của đơn / chuyến không bỏ được — đặt số lượng 0 nếu cần.");
    const r = db.prepare("DELETE FROM scan_lines WHERE id = ? AND doc_id = ?").run(lineId, docId);
    if (!Number(r.changes)) throw new DomainError(404, "NOT_FOUND", "Không có dòng này.");
    db.prepare("UPDATE scan_ops SET undone_at = COALESCE(undone_at, ?) WHERE line_id = ?").run(now(), lineId);
    bump(db, docId);
    return viewOf(db, docRow(db, docId));
  });
}

export function cancelDoc(kind: DocKind, docId: number, ctx: DocCtx): DocView {
  const db = getDb();
  return withTransaction(db, () => {
    const d = docRow(db, docId, kind);
    requireDocRights(d, ctx.permissions);
    if (d.status === "cancelled") return viewOf(db, d);
    requireDraft(d);
    db.prepare("UPDATE scan_docs SET status = 'cancelled', version = version + 1, updated_at = ? WHERE id = ?").run(now(), docId);
    recordAudit({ actor: ctx.actor, tokenId: ctx.tokenId, action: `scan.${kind}.cancel`, target: `scan:${d.code}`, requestId: ctx.requestId, ip: ctx.ip });
    return viewOf(db, docRow(db, docId));
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// confirm (nhập kho / chốt kiểm kê / hoàn tất soạn & bắt đầu giao) — one transaction, at most once

export function confirmDoc(kind: DocKind, docId: number, input: { version?: unknown; method?: unknown; tracking?: unknown }, ctx: DocCtx): { doc: DocView; result: unknown; alreadyConfirmed: boolean } {
  const db = getDb();
  return withTransaction(db, () => {
    const d = docRow(db, docId, kind);
    requireDocRights(d, ctx.permissions);
    if (d.status === "confirmed") return { doc: viewOf(db, d), result: JSON.parse(d.result ?? "null"), alreadyConfirmed: true };
    requireDraft(d);
    if (typeof input.version !== "number" || input.version !== d.version) {
      throw new DomainError(409, "DOC_CHANGED", `${DOC_LABEL[kind]} ${d.code} đã thay đổi (phiên bản ${d.version}) — xem lại rồi chốt.`, { version: d.version });
    }
    const view = viewOf(db, d);
    if (view.blockers.length) throw new DomainError(409, kind === "count" && view.totals.drift ? "COUNT_DRIFT" : kind === "pick" ? "PICK_INCOMPLETE" : "NOTHING_TO_CONFIRM", view.blockers.join(" "), { blockers: view.blockers, lines: view.lines.filter((l) => !["ok", "match", "diff"].includes(l.state)).map((l) => ({ id: l.id, productId: l.product.id, state: l.state, message: l.message })) });
    const w = d.warehouse as ShopWarehouse;
    const rows = lineRows(db, docId);
    let result: Record<string, unknown>;
    const note = `${DOC_LABEL[kind]} ${d.code}`;

    if (kind === "receive" && d.mode === "direct") {
      const made: Array<{ productId: number; qty: number; codes: string[]; expiry: string | null }> = [];
      for (const l of rows) {
        if (!l.qty || l.qty <= 0) continue;
        const receiptId = l.bill_code ? receiptIdForCode(l.bill_code, null) : null;
        const ids = createUnitsSync(db, { productId: l.product_id, qty: l.qty, status: w === "vn" ? "at_shop" : "bought", receiptId, sourceKey: "manual", expiry: l.expiry, unitCostJpy: l.unit_cost_jpy, origin: "manual", note, actor: ctx.actor });
        touchSync(db, { unitIds: ids });
        const codes = ids.length ? (db.prepare(`SELECT code FROM stock_units WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY id`).all(...ids) as Array<{ code: string }>).map((r) => r.code) : [];
        made.push({ productId: l.product_id, qty: ids.length, codes, expiry: l.expiry });
      }
      result = { kind, warehouse: w, created: made, units: made.reduce((n, m) => n + m.qty, 0) };
    } else if (kind === "receive") {
      const pending = shipmentPending(db, d.shipment_id!);
      const moved: Array<{ productId: number; qty: number; codes: string[] }> = [];
      const ids: number[] = [];
      for (const l of rows) {
        if (!l.qty) continue;
        const mine = pending.filter((u) => u.product_id === l.product_id);
        const explicit = parseCodes(l.unit_codes);
        const chosen = mine.filter((u) => explicit.includes(u.code));
        if (chosen.length < explicit.length) throw new DomainError(409, "STOCK_CHANGED", `Một số mã đã quét của sản phẩm #${l.product_id} không còn chờ nhận (đã nhận ở nơi khác?) — tải lại phiếu.`);
        const rest = sortUnits(mine.filter((u) => !explicit.includes(u.code)).map((u) => ({ ...u, status: u.status as never, boughtAt: u.bought_at })));
        const extra = rest.slice(0, l.qty - chosen.length);
        if (chosen.length + extra.length < l.qty) throw new DomainError(409, "STOCK_CHANGED", `Sản phẩm #${l.product_id}: chỉ còn ${mine.length} cái chờ nhận, phiếu ghi ${l.qty} — tải lại phiếu.`);
        const take = [...chosen, ...extra];
        ids.push(...take.map((u) => u.id));
        moved.push({ productId: l.product_id, qty: take.length, codes: take.map((u) => u.code) });
      }
      moveUnitsSync(db, ids, "at_shop", { actor: ctx.actor, note, raiseOnly: true });
      touchSync(db, { unitIds: ids });
      const left = shipmentPending(db, d.shipment_id!).length;
      if (!left) setShipmentStatusSync(db, d.shipment_id!, "done", ctx.actor);
      result = { kind, mode: "shipment", received: moved, units: ids.length, shipmentDone: !left, stillPending: left };
    } else if (kind === "count") {
      const plan: Array<{ productId: number; counted: number; book: number; free: number; target: number; relocated: string[] }> = [];
      const short: string[] = [];
      for (const l of rows) {
        if (l.qty === null) continue;
        if (systemTotal(db, l.product_id, w) !== l.expected) throw new DomainError(409, "COUNT_DRIFT", `Tồn sản phẩm #${l.product_id} vừa thay đổi — đếm lại hoặc xác nhận số đếm.`);
      }
      for (const l of rows) {
        if (l.qty === null) continue;
        // units scanned by their own code here while the book has them elsewhere: they are here — move them first
        const codes = parseCodes(l.unit_codes);
        const away = codes.length ? (db.prepare(`SELECT id, code FROM stock_units WHERE code IN (${codes.map(() => "?").join(",")}) AND removed IS NULL AND status <> ? AND status NOT IN ('not_bought','ordered','shipped_to_customer','delivered')`).all(...codes, statusAt[w]) as Array<{ id: number; code: string }>) : [];
        if (away.length) {
          moveUnitsSync(db, away.map((u) => u.id), statusAt[w] as never, { actor: ctx.actor, note: `${note} — tìm thấy tại kho` });
          touchSync(db, { unitIds: away.map((u) => u.id) });
        }
        const book = systemTotal(db, l.product_id, w);
        const free = freeAdjustable(db, l.product_id, w);
        const target = free + (l.qty - book);
        if (target < 0) short.push(`#${l.product_id}: đếm ${l.qty}, sổ ${book} trong đó ${book - free} cái đang giữ cho đơn / đã đóng thùng`);
        plan.push({ productId: l.product_id, counted: l.qty, book, free, target, relocated: away.map((u) => u.code) });
      }
      if (short.length) throw new DomainError(409, "COUNT_SHORT_HELD", `Thiếu cả hàng đang giữ cho đơn — xử lý tay ở trang tồn kho sản phẩm (nhả giữ chỗ / loại cái cụ thể) rồi chốt: ${short.join("; ")}.`, { lines: short });
      const changes = plan.map((p) => ({ ...p, ...adjustUnitsToTotalSync(db, p.productId, p.target, { warehouse: w, actor: ctx.actor }) }));
      touchSync(db, { productIds: plan.map((p) => p.productId) });
      const uncounted = rows.filter((l) => l.qty === null).length;
      result = { kind, warehouse: w, lines: changes, added: changes.reduce((n, c) => n + c.added, 0), removed: changes.reduce((n, c) => n + c.removed, 0), uncountedIgnored: uncounted };
    } else {
      const ready = listOrdersReadyToShip(db).some((r) => r.orderId === d.order_id);
      const o = db.prepare("SELECT number, ship_stage FROM orders WHERE id = ?").get(d.order_id) as { number: number; ship_stage: string | null } | undefined;
      if (!o || !ready || o.ship_stage === "delivering" || o.ship_stage === "delivered") throw new DomainError(409, "ORDER_NOT_READY", `Đơn #${o?.number ?? "?"} không còn ở trạng thái chờ giao — không xuất lần nữa.`);
      const held = orderUnits(db, d.order_id!);
      for (const l of rows) for (const c of parseCodes(l.unit_codes)) if (!held.some((h) => h.code === c && h.status === "at_shop")) throw new DomainError(409, "STOCK_CHANGED", `${c} không còn giữ cho đơn ở Kho VN — tải lại phiếu.`);
      // carrier + tracking of the VN-domestic leg, as ⑦ Giao hàng VN records them
      const method = input.method === undefined || input.method === null ? "" : String(input.method);
      if (input.tracking !== undefined && input.tracking !== null && (typeof input.tracking !== "string" || input.tracking.length > 60)) throw new DomainError(422, "VALIDATION_FAILED", "Mã vận đơn: chuỗi ≤ 60 ký tự.", { fields: { tracking: "≤ 60" } });
      const tracking = typeof input.tracking === "string" && input.tracking.trim() ? input.tracking.trim() : undefined;
      const leg = db.prepare("SELECT method_id, label FROM order_legs WHERE order_id = ? AND leg = 'vn_domestic'").get(d.order_id) as { method_id: number | null; label: string } | undefined;
      if (!method && !leg?.method_id && !leg?.label) throw new DomainError(422, "CARRIER_REQUIRED", "Chọn đơn vị vận chuyển (hoặc khách tự lấy) trước khi bắt đầu giao.", { fields: { method: "required" } });
      const label = applyLegMethodSync(db, d.order_id!, "vn_domestic", method, tracking);
      if (label === "invalid") throw new DomainError(422, "VALIDATION_FAILED", "Đơn vị vận chuyển không hợp lệ.", { fields: { method: "unknown" } });
      setOrderLegStatusSync(db, d.order_id!, "vn_domestic", "sent", { actor: ctx.actor, note, tracking });
      const legNow = db.prepare("SELECT label, tracking FROM order_legs WHERE order_id = ? AND leg = 'vn_domestic'").get(d.order_id) as { label: string; tracking: string } | undefined;
      result = { kind, orderId: d.order_id, orderNumber: o.number, units: held.length, codes: held.map((h) => h.code), carrier: legNow?.label ?? "", tracking: legNow?.tracking ?? "" };
    }
    const ts = now();
    db.prepare("UPDATE scan_docs SET status = 'confirmed', result = ?, confirmed_by = ?, confirmed_at = ?, version = version + 1, updated_at = ? WHERE id = ?").run(JSON.stringify(result), ctx.actor.slice(0, 120), ts, ts, docId);
    recordAudit({ actor: ctx.actor, tokenId: ctx.tokenId, action: `scan.${kind}.confirm`, target: `scan:${d.code}`, changes: result, requestId: ctx.requestId, ip: ctx.ip });
    return { doc: viewOf(db, docRow(db, docId)), result, alreadyConfirmed: false };
  });
}

/** Cost is shown only to accounts with "see_cost" (Xem giá vốn & lãi / lỗ); everyone else gets null. */
export function redactDocCost<T>(data: T, permissions: string[]): T {
  if (permissions.includes("see_cost")) return data;
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = k === "unitCostJpy" ? null : strip(x);
      return out;
    }
    return v;
  };
  return strip(data) as T;
}

/** Packing runs that can be received at Kho VN (handed to the carrier, not done). */
export function receivableShipments(): Array<{ id: number; code: string; label: string; status: string; pending: number }> {
  const db = getDb();
  const rows = db.prepare("SELECT id, code, label, status FROM shipments WHERE status IN ('handed','flying','arrived') ORDER BY id DESC LIMIT 30").all() as Array<{ id: number; code: string; label: string; status: string }>;
  return rows.map((r) => ({ ...r, pending: shipmentPending(db, r.id).length })).filter((r) => r.pending > 0);
}

/** Carriers of the VN-domestic leg for completing a pick ("pickup" = khách tự lấy). */
export function pickCarriers(): Array<{ value: string; label: string }> {
  return legMethodOptions(getDb(), "vn_domestic");
}

/** Orders ready to leave Kho VN (for the pick screen). */
export function pickableOrders(): Array<{ orderId: string; orderNumber: number; customerName: string; units: number }> {
  return listOrdersReadyToShip(getDb()).map((o) => ({ orderId: o.orderId, orderNumber: o.orderNumber, customerName: o.customerName, units: o.units }));
}
