import type { DatabaseSync } from "node:sqlite";
import { type AllocCandidate, type AllocSourceType, combineStatuses, planAllocation, statusFromSource } from "./allocation";
import { todayIso } from "./lots";
import { isPurchaseStatus, PURCHASE_STAGES, type PurchaseStatus, purchaseIndex } from "./purchase";
import { getDb, withTransaction } from "./sqlite";
import { syncProductStock } from "./stock-sync";
import { DEFAULT_WAREHOUSE, describeLocation, isWarehouse, WAREHOUSE_SHORT, type Warehouse } from "./warehouses";

/**
 * order_item_allocations — which stock serves each order line (see lib/allocation.ts for the priority rule).
 *
 * Life cycle: the order is placed → every line gets allocations (reservations; products.stock already excludes them)
 * → the shop confirms payment, or the admin marks a regular customer's order "thu khi giao" → the lot units are really
 * deducted (`consumed_at`, orders.stock_committed_at) → a stock purchase that becomes a lot later converts its
 * allocations to lot allocations (and deducts at once when the order is already committed). Cancelling releases the
 * reservations; cancelling after the deduction books the units back as a return lot ("lô nhập lại").
 *
 * The functions ending in `Sync` take an open connection so callers (createOrder, setStockPurchaseStatus…) can use
 * them inside their own transaction; the plain async ones open one themselves and are what server actions call.
 * This module never imports lib/db.ts (db.ts imports it).
 */

export interface AllocationRow {
  id: number;
  order_item_id: number;
  source_type: AllocSourceType;
  source_id: number | null;
  qty: number;
  manual: number;
  consumed_at: string | null;
  created_at: string;
  updated_at: string;
}

const now = () => new Date().toISOString();
const statusOf = (v: unknown): PurchaseStatus => (isPurchaseStatus(v) ? v : "not_bought");
const whOf = (v: unknown): Warehouse => (isWarehouse(v) ? v : DEFAULT_WAREHOUSE);

/** Units of a source reserved by open orders (not deducted yet); `exceptItemId` leaves one line's own reservation out. */
export function reservedOn(db: DatabaseSync, type: "lot" | "stock_purchase" | "batch", id: number, exceptItemId?: number): number {
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(a.qty), 0) AS q FROM order_item_allocations a JOIN order_items oi ON oi.id = a.order_item_id JOIN orders o ON o.id = oi.order_id
       WHERE a.source_type = ? AND a.source_id = ? AND a.consumed_at IS NULL AND o.status <> 'cancelled'${exceptItemId ? " AND a.order_item_id <> ?" : ""}`,
    )
    .get(...(exceptItemId ? [type, id, exceptItemId] : [type, id])) as { q: number };
  return Number(r.q);
}

/** Everything of a product that could serve a line right now, with what is still free on each. */
export function candidatesFor(db: DatabaseSync, productId: number, exceptItemId?: number): AllocCandidate[] {
  const lots = db.prepare("SELECT id, qty_left, expiry, warehouse, in_transit, COALESCE(bought_at, received_at) AS bought_at FROM stock_lots WHERE product_id = ? AND qty_left > 0").all(productId) as unknown as Array<{ id: number; qty_left: number; expiry: string | null; warehouse: string; in_transit: number; bought_at: string | null }>;
  const slips = db.prepare("SELECT id, qty, expiry, status, batch_id, COALESCE(bought_at, substr(created_at, 1, 10)) AS bought_at FROM stock_purchases WHERE product_id = ? AND lot_id IS NULL AND qty > 0").all(productId) as unknown as Array<{ id: number; qty: number; expiry: string | null; status: string; batch_id: number | null; bought_at: string | null }>;
  const out: AllocCandidate[] = [];
  for (const l of lots) out.push({ type: "lot", id: l.id, available: l.qty_left - reservedOn(db, "lot", l.id, exceptItemId), expiry: l.expiry, warehouse: whOf(l.warehouse), inTransit: !!l.in_transit, status: null, batchId: null, boughtAt: l.bought_at });
  for (const s of slips) out.push({ type: "stock_purchase", id: s.id, available: s.qty - reservedOn(db, "stock_purchase", s.id, exceptItemId), expiry: s.expiry, warehouse: null, inTransit: false, status: statusOf(s.status), batchId: s.batch_id, boughtAt: s.bought_at });
  return out.filter((c) => c.available > 0);
}

interface ItemRow {
  id: number;
  order_id: string;
  product_id: number;
  quantity: number;
  purchase_status: string | null;
  purchase_note: string;
  order_status: string;
  order_number: number;
}
function itemRow(db: DatabaseSync, itemId: number): ItemRow | undefined {
  return db.prepare("SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.purchase_status, oi.purchase_note, o.status AS order_status, o.number AS order_number FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.id = ?").get(itemId) as ItemRow | undefined;
}

function allocsOf(db: DatabaseSync, itemId: number): AllocationRow[] {
  return db.prepare("SELECT * FROM order_item_allocations WHERE order_item_id = ? ORDER BY id").all(itemId) as unknown as AllocationRow[];
}

/** Purchase status + batch link of a line follow its sources; a note tells the admin it was filled automatically. */
export function syncItemStatusSync(db: DatabaseSync, itemId: number): void {
  const item = itemRow(db, itemId);
  if (!item) return;
  const allocs = allocsOf(db, itemId);
  if (!allocs.length) return;
  const statuses: PurchaseStatus[] = [];
  let batchId: number | null = null;
  let batchCode = "";
  for (const a of allocs) {
    if (a.source_type === "lot") {
      const lot = a.source_id ? (db.prepare("SELECT l.warehouse, l.in_transit, l.batch_id, b.code FROM stock_lots l LEFT JOIN purchase_batches b ON b.id = l.batch_id WHERE l.id = ?").get(a.source_id) as { warehouse: string; in_transit: number; batch_id: number | null; code: string | null } | undefined) : undefined;
      statuses.push(statusFromSource({ type: "lot", warehouse: lot ? whOf(lot.warehouse) : null, inTransit: !!lot?.in_transit, consumed: !!a.consumed_at }));
      if (lot?.batch_id && !batchId) {
        batchId = lot.batch_id;
        batchCode = lot.code ?? "";
      }
    } else if (a.source_type === "stock_purchase") {
      const sp = a.source_id ? (db.prepare("SELECT sp.status, sp.batch_id, b.code FROM stock_purchases sp LEFT JOIN purchase_batches b ON b.id = sp.batch_id WHERE sp.id = ?").get(a.source_id) as { status: string; batch_id: number | null; code: string | null } | undefined) : undefined;
      statuses.push(statusFromSource({ type: "stock_purchase", status: sp ? statusOf(sp.status) : "not_bought" }));
      if (sp?.batch_id && !batchId) {
        batchId = sp.batch_id;
        batchCode = sp.code ?? "";
      }
    } else if (a.source_type === "batch") {
      const b = a.source_id ? (db.prepare("SELECT id, code, status FROM purchase_batches WHERE id = ?").get(a.source_id) as { id: number; code: string; status: string } | undefined) : undefined;
      statuses.push(statusFromSource({ type: "batch", status: b ? statusOf(b.status) : "not_bought" }));
      if (b && !batchId) {
        batchId = b.id;
        batchCode = b.code;
      }
    } else statuses.push("not_bought");
  }
  const cur = statusOf(item.purchase_status);
  // the customer-side steps (đang giao / đã nhận) are set by the shipping flow and never lowered here
  const next = purchaseIndex(cur) > purchaseIndex("at_shop") ? cur : combineStatuses(statuses);
  const note = item.purchase_note || (batchCode ? `Tự động lấy từ mua theo đợt ${batchCode}` : "");
  db.prepare("UPDATE order_items SET purchase_status = ?, purchase_updated_at = CASE WHEN purchase_status <> ? THEN ? ELSE purchase_updated_at END, batch_id = ?, purchase_note = ? WHERE id = ?").run(next, next, now(), batchId, note, itemId);
}

/**
 * Give one line its sources. `reset` drops the automatic (non-manual, not deducted) rows first; otherwise only the
 * "buy" remainder is retried. Never reserves more than what is free.
 */
export function allocateItemSync(db: DatabaseSync, itemId: number, reset = false): void {
  const item = itemRow(db, itemId);
  if (!item || item.order_status === "cancelled") return;
  const ts = now();
  if (reset) db.prepare("DELETE FROM order_item_allocations WHERE order_item_id = ? AND manual = 0 AND consumed_at IS NULL").run(itemId);
  else db.prepare("DELETE FROM order_item_allocations WHERE order_item_id = ? AND source_type = 'buy'").run(itemId);
  const have = (db.prepare("SELECT COALESCE(SUM(qty), 0) AS q FROM order_item_allocations WHERE order_item_id = ?").get(itemId) as { q: number }).q;
  const need = item.quantity - Number(have);
  if (need > 0) {
    const plan = planAllocation(need, candidatesFor(db, item.product_id));
    const ins = db.prepare("INSERT INTO order_item_allocations (order_item_id, source_type, source_id, qty, manual, consumed_at, created_at, updated_at) VALUES (?, ?, ?, ?, 0, NULL, ?, ?)");
    for (const t of plan.takes) ins.run(itemId, t.type, t.id, t.qty, ts, ts);
    if (plan.short > 0) ins.run(itemId, "buy", null, plan.short, ts, ts);
  }
  syncItemStatusSync(db, itemId);
  syncProductStock(db, item.product_id, ts);
}

export function allocateOrderSync(db: DatabaseSync, orderId: string, reset = false): void {
  const ids = (db.prepare("SELECT id FROM order_items WHERE order_id = ? ORDER BY id").all(orderId) as Array<{ id: number }>).map((r) => r.id);
  for (const id of ids) allocateItemSync(db, id, reset);
}

/** Lines of open orders still (partly) "Cần mua" for a product, oldest order first → try again (new lot / slip arrived). */
export function allocatePendingForProductSync(db: DatabaseSync, productId: number): number[] {
  const ids = (
    db
      .prepare(
        `SELECT DISTINCT oi.id, o.created_at FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN order_item_allocations a ON a.order_item_id = oi.id
         WHERE oi.product_id = ? AND o.status IN ('pending','processing') AND a.source_type = 'buy' ORDER BY o.created_at, oi.id`,
      )
      .all(productId) as Array<{ id: number }>
  ).map((r) => r.id);
  const served: number[] = [];
  for (const id of ids) {
    allocateItemSync(db, id, false);
    const still = db.prepare("SELECT 1 FROM order_item_allocations WHERE order_item_id = ? AND source_type = 'buy'").get(id);
    if (!still) served.push(id);
  }
  return served;
}

/** Admin override: this line takes its units from one chosen source ("Cần mua" clears every source). */
export function setManualAllocationSync(db: DatabaseSync, itemId: number, type: AllocSourceType, sourceId: number | null): { ok: boolean; message: string } {
  const item = itemRow(db, itemId);
  if (!item) return { ok: false, message: "Không tìm thấy dòng đơn." };
  const consumed = (db.prepare("SELECT COALESCE(SUM(qty), 0) AS q FROM order_item_allocations WHERE order_item_id = ? AND consumed_at IS NOT NULL").get(itemId) as { q: number }).q;
  if (Number(consumed) >= item.quantity) return { ok: false, message: "Dòng này đã trừ tồn kho thật — không đổi nguồn được nữa." };
  const ts = now();
  const need = item.quantity - Number(consumed);
  {
    db.prepare("DELETE FROM order_item_allocations WHERE order_item_id = ? AND consumed_at IS NULL").run(itemId);
    const ins = db.prepare("INSERT INTO order_item_allocations (order_item_id, source_type, source_id, qty, manual, consumed_at, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NULL, ?, ?)");
    let message = "";
    if (type === "buy" || !sourceId) {
      ins.run(itemId, "buy", null, need, ts, ts);
      message = "Dòng đơn chuyển về “Cần mua”.";
    } else if (type === "batch") {
      const b = db.prepare("SELECT code FROM purchase_batches WHERE id = ?").get(sourceId) as { code: string } | undefined;
      if (!b) return { ok: false, message: "Không tìm thấy đợt." };
      ins.run(itemId, "batch", sourceId, need, ts, ts);
      message = `Dòng đơn sẽ mua trong đợt ${b.code}.`;
    } else {
      const cand = candidatesFor(db, item.product_id, itemId).find((c) => c.type === type && c.id === sourceId);
      const avail = cand?.available ?? 0;
      if (avail <= 0) return { ok: false, message: "Nguồn này không còn đơn vị nào trống." };
      const take = Math.min(avail, need);
      ins.run(itemId, type, sourceId, take, ts, ts);
      if (take < need) ins.run(itemId, "buy", null, need - take, ts, ts);
      message = take < need ? `Đã giữ ${take} đv từ nguồn đã chọn; ${need - take} đv còn lại là “Cần mua”.` : "Đã đổi nguồn hàng cho dòng đơn.";
    }
    syncItemStatusSync(db, itemId);
    syncProductStock(db, item.product_id, ts);
    return { ok: true, message };
  }
}

export function isOrderCommitted(db: DatabaseSync, orderId: string): boolean {
  const r = db.prepare("SELECT stock_committed_at FROM orders WHERE id = ?").get(orderId) as { stock_committed_at: string | null } | undefined;
  return !!r?.stock_committed_at;
}

/** Deduct the reserved lot units for real (payment confirmed / COD granted). Idempotent per allocation. */
export function commitOrderSync(db: DatabaseSync, orderId: string): number {
  const ts = now();
  const rows = db
    .prepare("SELECT a.id, a.source_id, a.qty, oi.product_id FROM order_item_allocations a JOIN order_items oi ON oi.id = a.order_item_id WHERE oi.order_id = ? AND a.source_type = 'lot' AND a.consumed_at IS NULL AND a.source_id IS NOT NULL")
    .all(orderId) as unknown as Array<{ id: number; source_id: number; qty: number; product_id: number }>;
  let n = 0;
  const products = new Set<number>();
  for (const a of rows) {
    const lot = db.prepare("SELECT qty_left FROM stock_lots WHERE id = ?").get(a.source_id) as { qty_left: number } | undefined;
    const take = Math.max(0, Math.min(a.qty, lot?.qty_left ?? 0));
    if (take > 0) db.prepare("UPDATE stock_lots SET qty_left = qty_left - ?, updated_at = ? WHERE id = ?").run(take, ts, a.source_id);
    db.prepare("UPDATE order_item_allocations SET consumed_at = ?, qty = ?, updated_at = ? WHERE id = ?").run(ts, take, ts, a.id);
    if (take < a.qty) db.prepare("INSERT INTO order_item_allocations (order_item_id, source_type, source_id, qty, manual, consumed_at, created_at, updated_at) SELECT order_item_id, 'buy', NULL, ?, 0, NULL, ?, ? FROM order_item_allocations WHERE id = ?").run(a.qty - take, ts, ts, a.id);
    products.add(a.product_id);
    n++;
  }
  db.prepare("UPDATE orders SET stock_committed_at = COALESCE(stock_committed_at, ?) WHERE id = ?").run(ts, orderId);
  for (const p of products) syncProductStock(db, p, ts);
  return n;
}

/** Cancel / delete: reservations vanish; units already deducted come back as a return lot when `returnConsumed`. */
export function releaseOrderSync(db: DatabaseSync, orderId: string, returnConsumed: boolean): { released: number; returned: number } {
  const ts = now();
  const order = db.prepare("SELECT number FROM orders WHERE id = ?").get(orderId) as { number: number } | undefined;
  const rows = db
    .prepare("SELECT a.id, a.source_type, a.source_id, a.qty, a.consumed_at, oi.product_id FROM order_item_allocations a JOIN order_items oi ON oi.id = a.order_item_id WHERE oi.order_id = ?")
    .all(orderId) as unknown as Array<{ id: number; source_type: string; source_id: number | null; qty: number; consumed_at: string | null; product_id: number }>;
  let released = 0;
  let returned = 0;
  const products = new Set<number>();
  for (const a of rows) {
    if (a.consumed_at && a.source_type === "lot" && a.qty > 0) {
      if (returnConsumed) {
        const src = a.source_id ? (db.prepare("SELECT * FROM stock_lots WHERE id = ?").get(a.source_id) as Record<string, unknown> | undefined) : undefined;
        db.prepare("INSERT INTO stock_lots (product_id, qty_in, qty_left, received_at, bought_at, source_key, unit_cost_jpy, unit_cost_vnd, expiry, warehouse, location, note, purchase_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)").run(
          a.product_id,
          a.qty,
          a.qty,
          todayIso(),
          (src?.bought_at as string | null) ?? null,
          (src?.source_key as string) ?? "unknown",
          (src?.unit_cost_jpy as number | null) ?? null,
          (src?.unit_cost_vnd as number | null) ?? null,
          (src?.expiry as string | null) ?? null,
          (src?.warehouse as string) ?? DEFAULT_WAREHOUSE,
          (src?.location as string) ?? "",
          `Nhập lại từ đơn #${order?.number ?? "?"} huỷ${a.source_id ? ` (lô #${a.source_id})` : ""}`,
          ts,
          ts,
        );
        returned += a.qty;
      }
    } else released += a.qty;
    products.add(a.product_id);
  }
  db.prepare("DELETE FROM order_item_allocations WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)").run(orderId);
  for (const p of products) syncProductStock(db, p, ts);
  return { released, returned };
}

/** A stock purchase moved (status) or became a lot: its lines follow; lot conversion deducts at once for committed orders. */
export function onStockPurchaseChangedSync(db: DatabaseSync, spId: number): void {
  const sp = db.prepare("SELECT id, product_id, lot_id FROM stock_purchases WHERE id = ?").get(spId) as { id: number; product_id: number; lot_id: number | null } | undefined;
  if (!sp) return;
  const ts = now();
  const allocs = db
    .prepare("SELECT a.id, a.order_item_id, a.qty, oi.order_id FROM order_item_allocations a JOIN order_items oi ON oi.id = a.order_item_id WHERE a.source_type = 'stock_purchase' AND a.source_id = ?")
    .all(spId) as unknown as Array<{ id: number; order_item_id: number; qty: number; order_id: string }>;
  if (sp.lot_id) {
    for (const a of allocs) {
      db.prepare("UPDATE order_item_allocations SET source_type = 'lot', source_id = ?, updated_at = ? WHERE id = ?").run(sp.lot_id, ts, a.id);
      if (isOrderCommitted(db, a.order_id)) {
        const lot = db.prepare("SELECT qty_left FROM stock_lots WHERE id = ?").get(sp.lot_id) as { qty_left: number };
        const take = Math.max(0, Math.min(a.qty, lot.qty_left));
        db.prepare("UPDATE stock_lots SET qty_left = qty_left - ?, updated_at = ? WHERE id = ?").run(take, ts, sp.lot_id);
        db.prepare("UPDATE order_item_allocations SET consumed_at = ?, qty = ?, updated_at = ? WHERE id = ?").run(ts, take, ts, a.id);
      }
    }
  }
  const items = new Set(allocs.map((a) => a.order_item_id));
  for (const id of items) syncItemStatusSync(db, id);
  syncProductStock(db, sp.product_id, ts);
}

/** The whole batch moved: every line served from it (directly or through its slips) follows. */
export function onBatchChangedSync(db: DatabaseSync, batchId: number): void {
  const ids = db
    .prepare(
      `SELECT DISTINCT a.order_item_id AS id FROM order_item_allocations a
       LEFT JOIN stock_purchases sp ON sp.id = a.source_id AND a.source_type = 'stock_purchase'
       LEFT JOIN stock_lots l ON l.id = a.source_id AND a.source_type = 'lot'
       WHERE (a.source_type = 'batch' AND a.source_id = ?) OR (a.source_type = 'stock_purchase' AND sp.batch_id = ?) OR (a.source_type = 'lot' AND l.batch_id = ?)`,
    )
    .all(batchId, batchId, batchId) as Array<{ id: number }>;
  for (const r of ids) syncItemStatusSync(db, r.id);
}

/** A slip was deleted: its lines fall back to "Cần mua". */
export function onStockPurchaseDeletedSync(db: DatabaseSync, spId: number): void {
  const items = (db.prepare("SELECT DISTINCT order_item_id AS id FROM order_item_allocations WHERE source_type = 'stock_purchase' AND source_id = ?").all(spId) as Array<{ id: number }>).map((r) => r.id);
  db.prepare("UPDATE order_item_allocations SET source_type = 'buy', source_id = NULL, manual = 0, updated_at = ? WHERE source_type = 'stock_purchase' AND source_id = ?").run(now(), spId);
  for (const id of items) {
    allocateItemSync(db, id, false);
  }
}

/** Lines of one item leave a batch (admin ✕): batch / batch-slip sources become "Cần mua". */
export function detachItemFromBatchSync(db: DatabaseSync, itemId: number, batchId: number): void {
  const ts = now();
  db.prepare(
    `UPDATE order_item_allocations SET source_type = 'buy', source_id = NULL, manual = 0, updated_at = ? WHERE order_item_id = ? AND consumed_at IS NULL AND (
       (source_type = 'batch' AND source_id = ?) OR (source_type = 'stock_purchase' AND source_id IN (SELECT id FROM stock_purchases WHERE batch_id = ?)))`,
  ).run(ts, itemId, batchId, batchId);
  db.prepare("UPDATE order_items SET batch_id = NULL WHERE id = ?").run(itemId);
  syncItemStatusSync(db, itemId);
  const item = itemRow(db, itemId);
  if (item) syncProductStock(db, item.product_id, ts);
}

// ---------- read side ----------

export interface AllocationView {
  id: number;
  orderItemId: number;
  sourceType: AllocSourceType;
  sourceId: number | null;
  qty: number;
  manual: boolean;
  consumedAt: string | null;
  /** Short badge text ("Có sẵn · Kho VN", "Đang về", "Trong đợt DG-…", "Cần mua"). */
  label: string;
  /** Second line ("lô #12 · HSD 03/2027 · còn 3"). */
  detail: string;
  status: PurchaseStatus;
  tone: "green" | "sky" | "amber" | "gray";
}

const fmtDate = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("/") : "");

export function listAllocationViews(db: DatabaseSync, itemIds: number[]): AllocationView[] {
  if (!itemIds.length) return [];
  const ph = itemIds.map(() => "?").join(",");
  const rows = db.prepare(`SELECT * FROM order_item_allocations WHERE order_item_id IN (${ph}) ORDER BY order_item_id, id`).all(...itemIds) as unknown as AllocationRow[];
  return rows.map((a) => {
    const base = { id: a.id, orderItemId: a.order_item_id, sourceType: a.source_type, sourceId: a.source_id, qty: a.qty, manual: a.manual === 1, consumedAt: a.consumed_at };
    if (a.source_type === "lot") {
      const lot = a.source_id ? (db.prepare("SELECT l.id, l.qty_left, l.expiry, l.warehouse, l.in_transit, b.code FROM stock_lots l LEFT JOIN purchase_batches b ON b.id = l.batch_id WHERE l.id = ?").get(a.source_id) as { id: number; qty_left: number; expiry: string | null; warehouse: string; in_transit: number; code: string | null } | undefined) : undefined;
      const wh = lot ? whOf(lot.warehouse) : "vn";
      const moving = !!lot?.in_transit;
      const status = statusFromSource({ type: "lot", warehouse: lot ? wh : null, inTransit: moving, consumed: !!a.consumed_at });
      const place = lot ? describeLocation(wh, moving) : "";
      const label = a.consumed_at ? `Đã trừ kho${lot ? ` · ${place}` : ""}` : wh === "vn" ? "Có sẵn · Kho VN" : wh === "carrier" && !moving ? "Sắp về kho shop · Kho ĐVVC VN" : `Có sẵn · ${place}`;
      const detail = lot ? `lô #${lot.id}${lot.expiry ? ` · HSD ${fmtDate(lot.expiry)}` : ""} · còn ${lot.qty_left}${lot.code ? ` · chuyến ${lot.code}` : ""}` : "lô cũ (đã trừ khi đặt)";
      return { ...base, label, detail, status, tone: a.consumed_at ? "green" : wh === "vn" ? "green" : "sky" } as AllocationView;
    }
    if (a.source_type === "stock_purchase") {
      const sp = a.source_id ? (db.prepare("SELECT sp.id, sp.status, sp.source_key, sp.unit_cost_jpy, sp.expiry, b.code FROM stock_purchases sp LEFT JOIN purchase_batches b ON b.id = sp.batch_id WHERE sp.id = ?").get(a.source_id) as { id: number; status: string; source_key: string; unit_cost_jpy: number | null; expiry: string | null; code: string | null } | undefined) : undefined;
      const st = sp ? statusOf(sp.status) : "not_bought";
      const bought = purchaseIndex(st) >= purchaseIndex("bought");
      const label = bought ? "Đang về" : sp?.code ? `Trong đợt ${sp.code}` : "Chờ mua (phiếu lưu kho)";
      const detail = sp ? `phiếu #${sp.id} · ${PURCHASE_STAGES[purchaseIndex(st)].short}${sp.code && bought ? ` · đợt ${sp.code}` : ""}${sp.unit_cost_jpy ? ` · ¥${sp.unit_cost_jpy.toLocaleString("ja-JP")}` : ""}${sp.expiry ? ` · HSD ${fmtDate(sp.expiry)}` : ""}` : "phiếu đã xoá";
      return { ...base, label, detail, status: statusFromSource({ type: "stock_purchase", status: st }), tone: bought ? "sky" : "amber" } as AllocationView;
    }
    if (a.source_type === "batch") {
      const b = a.source_id ? (db.prepare("SELECT code, status FROM purchase_batches WHERE id = ?").get(a.source_id) as { code: string; status: string } | undefined) : undefined;
      const st = b ? statusOf(b.status) : "not_bought";
      return { ...base, label: b ? `Trong đợt ${b.code}` : "Đợt đã xoá", detail: b ? PURCHASE_STAGES[purchaseIndex(st)].short : "", status: statusFromSource({ type: "batch", status: st }), tone: purchaseIndex(st) >= purchaseIndex("bought") ? "sky" : "amber" } as AllocationView;
    }
    return { ...base, label: "Cần mua", detail: "", status: "not_bought", tone: "gray" } as AllocationView;
  });
}

export interface SourceOption {
  type: "lot" | "stock_purchase" | "batch";
  id: number;
  label: string;
  available: number;
}

/** What the admin can pick in the override select for a line. */
export function listSourceOptions(db: DatabaseSync, productId: number, itemId: number): SourceOption[] {
  const out: SourceOption[] = [];
  for (const c of candidatesFor(db, productId, itemId)) {
    if (c.type === "lot") {
      const wh = c.warehouse ?? "vn";
      out.push({ type: "lot", id: c.id, label: `Lô #${c.id} · ${WAREHOUSE_SHORT[wh]}${c.inTransit ? " (đang đi)" : ""}${c.expiry ? ` · HSD ${fmtDate(c.expiry)}` : ""} · trống ${c.available}`, available: c.available });
    } else {
      const sp = db.prepare("SELECT sp.source_key, b.code FROM stock_purchases sp LEFT JOIN purchase_batches b ON b.id = sp.batch_id WHERE sp.id = ?").get(c.id) as { source_key: string; code: string | null } | undefined;
      out.push({ type: "stock_purchase", id: c.id, label: `Phiếu #${c.id} · ${PURCHASE_STAGES[purchaseIndex(c.status ?? "not_bought")].short}${sp?.code ? ` · đợt ${sp.code}` : ""}${c.expiry ? ` · HSD ${fmtDate(c.expiry)}` : ""} · trống ${c.available}`, available: c.available });
    }
  }
  const batches = db.prepare("SELECT id, code, label FROM purchase_batches WHERE status <> 'at_shop' ORDER BY id DESC").all() as unknown as Array<{ id: number; code: string; label: string }>;
  for (const b of batches) out.push({ type: "batch", id: b.id, label: `Mua trong đợt ${b.code}${b.label ? ` · ${b.label}` : ""}`, available: Number.MAX_SAFE_INTEGER });
  return out;
}

export interface Reservation {
  sourceType: AllocSourceType;
  sourceId: number | null;
  orderId: string;
  orderNumber: number;
  orderStatus: string;
  itemId: number;
  qty: number;
  consumed: boolean;
  manual: boolean;
}

/** Who holds units of a product (lots page, batch panel). */
export function listReservationsForProduct(db: DatabaseSync, productId: number): Reservation[] {
  const rows = db
    .prepare(
      `SELECT a.source_type, a.source_id, a.qty, a.consumed_at, a.manual, oi.id AS item_id, o.id AS order_id, o.number, o.status FROM order_item_allocations a
       JOIN order_items oi ON oi.id = a.order_item_id JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = ? AND o.status <> 'cancelled' ORDER BY o.number, a.id`,
    )
    .all(productId) as unknown as Array<{ source_type: AllocSourceType; source_id: number | null; qty: number; consumed_at: string | null; manual: number; item_id: number; order_id: string; number: number; status: string }>;
  return rows.map((r) => ({ sourceType: r.source_type, sourceId: r.source_id, orderId: r.order_id, orderNumber: r.number, orderStatus: r.status, itemId: r.item_id, qty: r.qty, consumed: !!r.consumed_at, manual: r.manual === 1 }));
}

/** Reservations on stock rows of a batch (source id → [{order, qty}]). */
export function listReservationsForStockPurchases(db: DatabaseSync, spIds: number[]): Map<number, Array<{ orderId: string; orderNumber: number; qty: number }>> {
  const out = new Map<number, Array<{ orderId: string; orderNumber: number; qty: number }>>();
  if (!spIds.length) return out;
  const ph = spIds.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT a.source_id, a.qty, o.id AS order_id, o.number FROM order_item_allocations a JOIN order_items oi ON oi.id = a.order_item_id JOIN orders o ON o.id = oi.order_id WHERE a.source_type = 'stock_purchase' AND a.source_id IN (${ph}) AND o.status <> 'cancelled' ORDER BY o.number`)
    .all(...spIds) as unknown as Array<{ source_id: number; qty: number; order_id: string; number: number }>;
  for (const r of rows) out.set(r.source_id, [...(out.get(r.source_id) ?? []), { orderId: r.order_id, orderNumber: r.number, qty: r.qty }]);
  return out;
}

/** Order-line ids that still need buying (a "buy" allocation) — the "Mua theo đặt hàng" tab. */
export function itemIdsNeedingPurchase(db: DatabaseSync): Set<number> {
  const rows = db.prepare("SELECT DISTINCT a.order_item_id AS id FROM order_item_allocations a JOIN order_items oi ON oi.id = a.order_item_id JOIN orders o ON o.id = oi.order_id WHERE a.source_type = 'buy' AND o.status IN ('pending','processing')").all() as Array<{ id: number }>;
  return new Set(rows.map((r) => r.id));
}

// ---------- async wrappers for server actions ----------

export async function reallocateOrder(orderId: string): Promise<void> {
  const db = getDb();
  withTransaction(db, () => allocateOrderSync(db, orderId, true));
}
export async function setManualAllocation(itemId: number, type: AllocSourceType, sourceId: number | null): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  return withTransaction(db, () => setManualAllocationSync(db, itemId, type, sourceId));
}
export async function allocatePendingForProduct(productId: number): Promise<number[]> {
  const db = getDb();
  return withTransaction(db, () => allocatePendingForProductSync(db, productId));
}

/** One-off after migration 59: give the legacy "buy" rows a real source where stock already exists. */
export async function backfillAllocationsOnce(): Promise<number> {
  const db = getDb();
  const flag = db.prepare("SELECT value FROM settings WHERE key = 'alloc_backfill_rev'").get() as { value: string } | undefined;
  if (flag?.value === "1") return 0;
  const products = (db.prepare("SELECT DISTINCT oi.product_id FROM order_item_allocations a JOIN order_items oi ON oi.id = a.order_item_id WHERE a.source_type = 'buy'").all() as Array<{ product_id: number }>).map((r) => r.product_id);
  let n = 0;
  withTransaction(db, () => {
    for (const p of products) n += allocatePendingForProductSync(db, p).length;
    db.prepare("INSERT INTO settings (key, value) VALUES ('alloc_backfill_rev', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run();
  });
  return n;
}

/** One-off after migration 61: every product with lots gets its stock recomputed and its waiting lines re-tried. */
export async function resyncStockAfterLotsOnce(): Promise<number> {
  const db = getDb();
  const flag = db.prepare("SELECT value FROM settings WHERE key = 'lots_resync_rev'").get() as { value: string } | undefined;
  if (flag?.value === "1") return 0;
  const ids = (db.prepare("SELECT DISTINCT product_id FROM stock_lots").all() as Array<{ product_id: number }>).map((r) => r.product_id);
  const ts = now();
  withTransaction(db, () => {
    for (const p of ids) {
      syncProductStock(db, p, ts);
      allocatePendingForProductSync(db, p);
    }
    db.prepare("INSERT INTO settings (key, value) VALUES ('lots_resync_rev', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run();
  });
  return ids.length;
}

/**
 * A lot deleted by hand leaves its slip (Mua theo đợt showed it as "giữ lại Nhật") and any allocation dangling.
 * Drop those references and give the affected lines a fresh source. Idempotent; runs at every start.
 */
export async function cleanupOrphanLotRefs(): Promise<{ slips: number; allocations: number }> {
  const db = getDb();
  return withTransaction(db, () => {
    const slips = Number(db.prepare("DELETE FROM stock_purchases WHERE lot_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM stock_lots l WHERE l.id = stock_purchases.lot_id)").run().changes);
    const items = (db.prepare("SELECT DISTINCT order_item_id AS id FROM order_item_allocations a WHERE a.source_type = 'lot' AND NOT EXISTS (SELECT 1 FROM stock_lots l WHERE l.id = a.source_id)").all() as Array<{ id: number }>).map((r) => r.id);
    const allocations = Number(db.prepare("DELETE FROM order_item_allocations WHERE source_type = 'lot' AND NOT EXISTS (SELECT 1 FROM stock_lots l WHERE l.id = order_item_allocations.source_id)").run().changes);
    for (const id of items) allocateItemSync(db, id, true);
    return { slips, allocations };
  });
}

/**
 * "Ghép lại tất cả đơn đang chờ": every open order that has not been deducted yet gives up its automatic reservations,
 * then the orders are served again oldest first under the current rule (place → expiry → bill). Manual choices and
 * deducted units are kept.
 */
export async function reallocateOpenOrders(): Promise<{ orders: number; lines: number }> {
  const db = getDb();
  return withTransaction(db, () => {
    const orders = (db.prepare("SELECT id FROM orders WHERE status IN ('pending','processing') AND stock_committed_at IS NULL ORDER BY created_at, id").all() as Array<{ id: string }>).map((r) => r.id);
    if (!orders.length) return { orders: 0, lines: 0 };
    const ph = orders.map(() => "?").join(",");
    const lines = Number(db.prepare(`DELETE FROM order_item_allocations WHERE manual = 0 AND consumed_at IS NULL AND order_item_id IN (SELECT id FROM order_items WHERE order_id IN (${ph}))`).run(...orders).changes);
    for (const id of orders) allocateOrderSync(db, id, false);
    return { orders: orders.length, lines };
  });
}
