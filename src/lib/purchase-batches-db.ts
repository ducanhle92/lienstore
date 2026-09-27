import "server-only";
import { createStockPurchase, deleteStockPurchase, heldAllocationsSync, mergeLotBackSync, setLotLocationSync, setStockPurchaseStatus, splitLotSync } from "./db";
import { listLotViews } from "./lots-db";
import { locationForStatus } from "./warehouses";
import { todayIso } from "./lots";
import { isPurchaseStatus, type PurchaseStatus, purchaseIndex } from "./purchase";
import { BATCH_DONE, batchCode } from "./purchase-batches";
import { UNKNOWN_SOURCE } from "./purchase-sources";
import { allocatePendingForProductSync, allocateOrderSync, candidatesFor, detachItemFromBatchSync, listReservationsForStockPurchases, onBatchChangedSync, onStockPurchaseChangedSync, reservedOn, setManualAllocationSync, syncItemStatusSync } from "./allocations-db";
import { createManualReceipt, parseReceiptFiles } from "./receipts-db";
import { getDb, withTransaction } from "./sqlite";
import { DEFAULT_WAREHOUSE, isWarehouse } from "./warehouses";
import type { PurchaseBatch, PurchaseBatchLine, PurchaseBatchStock } from "@/types/shop";

/**
 * Shipment batches ("đợt gửi") — see src/lib/purchase-batches.ts for the idea.
 * A batch groups `order_items.batch_id` (lines bought for customers) and `stock_purchases.batch_id` (surplus for stock).
 * Moving the batch moves every row; the surplus turns into lots through setStockPurchaseStatus when it reaches the shop.
 */

interface BatchRow {
  id: number;
  code: string;
  label: string;
  status: string;
  source_key: string;
  bought_at: string | null;
  shipped_at: string | null;
  tracking: string;
  note: string;
  created_at: string;
  updated_at: string;
}
interface LineRow {
  id: number;
  order_id: string;
  number: number;
  first_name: string;
  last_name: string;
  product_id: number;
  name: string;
  quantity: number;
  purchase_status: string | null;
  batch_id: number;
  source_key: string | null;
  sku: string | null;
  thumb: string | null;
  cost_jpy: number | null;
  purchase_expiry: string | null;
  purchase_bought_at: string | null;
  receipt_id: number | null;
  receipt_code: string | null;
}
interface StockRow {
  id: number;
  product_id: number;
  qty: number;
  expiry: string | null;
  bought_at: string | null;
  unit_cost_jpy: number | null;
  status: string;
  warehouse: string;
  lot_id: number | null;
  note: string;
  batch_id: number | null;
  origin_batch_id: number | null;
  source_key: string;
  name: string;
  sku: string | null;
  thumb: string | null;
  cur_code: string | null;
  receipt_id?: number | null;
  receipt_code?: string | null;
}

const statusOf = (v: string | null): PurchaseStatus => (isPurchaseStatus(v) ? v : "not_bought");

function hydrate(rows: BatchRow[]): PurchaseBatch[] {
  if (!rows.length) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => "?").join(",");
  const lines = db
    .prepare(
      `SELECT oi.id, oi.order_id, o.number, o.first_name, o.last_name, oi.product_id, oi.name, oi.quantity, oi.purchase_status, oi.batch_id, oi.source_key, p.sku, p.thumb,
              COALESCE(oi.purchase_cost_jpy, p.cost_jpy) AS cost_jpy, oi.purchase_expiry, oi.purchase_bought_at, oi.receipt_id,
              (SELECT r.code FROM purchase_receipts r WHERE r.id = oi.receipt_id) AS receipt_code
       FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.batch_id IN (${ph}) ORDER BY o.number, oi.id`,
    )
    .all(...ids) as unknown as LineRow[];
  const stock = db.prepare(`SELECT sp.*, p.name, p.sku, p.thumb, NULL AS cur_code, (SELECT r.code FROM purchase_receipts r WHERE r.id = sp.receipt_id) AS receipt_code FROM stock_purchases sp JOIN products p ON p.id = sp.product_id WHERE sp.batch_id IN (${ph}) AND sp.lot_id IS NULL ORDER BY sp.id`).all(...ids) as unknown as StockRow[];
  const idSet = new Set(ids);
  const lotsAll = listLotViews(db, { includeEmpty: true }).filter((l) => l.batchId !== null && idSet.has(l.batchId) && (l.qtyLeft > 0 || l.reserved.some((r) => r.consumed)));
  // split off and kept in Japan: waiting (batch_id NULL) or already inside a later batch
  const held = db.prepare(`SELECT sp.*, p.name, p.sku, p.thumb, b.code AS cur_code, NULL AS receipt_code FROM stock_purchases sp JOIN products p ON p.id = sp.product_id LEFT JOIN purchase_batches b ON b.id = sp.batch_id WHERE sp.origin_batch_id IN (${ph}) AND (sp.batch_id IS NULL OR sp.batch_id <> sp.origin_batch_id) ORDER BY sp.id`).all(...ids) as unknown as StockRow[];
  const toLine = (l: LineRow): PurchaseBatchLine => ({ itemId: l.id, orderId: l.order_id, orderNumber: l.number, customerName: `${l.last_name} ${l.first_name}`.trim(), productId: l.product_id, productName: l.name, productSku: l.sku, productThumb: l.thumb ?? "", quantity: l.quantity, purchaseStatus: statusOf(l.purchase_status), costJpy: l.cost_jpy, sourceKey: l.source_key ?? "", expiry: l.purchase_expiry ?? null, boughtAt: l.purchase_bought_at ?? null, receiptId: l.receipt_id ?? null, receiptCode: l.receipt_code ?? "" });
  const bills = db
    .prepare(`SELECT r.id, r.code, r.bought_at, r.source_key, r.order_ref, r.total_jpy, r.status, r.files, r.batch_id, (SELECT COUNT(*) FROM purchase_receipt_items i WHERE i.receipt_id = r.id) AS items FROM purchase_receipts r WHERE r.batch_id IN (${ph}) ORDER BY r.bought_at DESC, r.id DESC`)
    .all(...ids) as unknown as Array<{ id: number; code: string; bought_at: string; source_key: string; order_ref: string | null; total_jpy: number | null; status: string; files: string | null; batch_id: number; items: number }>;
  const reservedMap = listReservationsForStockPurchases(db, [...stock, ...held].map((s) => s.id));
  const toStock = (s: StockRow): PurchaseBatchStock => ({ id: s.id, productId: s.product_id, productName: s.name, productSku: s.sku, productThumb: s.thumb ?? "", qty: s.qty, expiry: s.expiry, boughtAt: s.bought_at, unitCostJpy: s.unit_cost_jpy, status: statusOf(s.status), warehouse: isWarehouse(s.warehouse) ? s.warehouse : DEFAULT_WAREHOUSE, lotId: s.lot_id, note: s.note ?? "", sourceKey: s.source_key || UNKNOWN_SOURCE, batchId: s.batch_id, batchCode: s.cur_code ?? "", originBatchId: s.origin_batch_id, reserved: reservedMap.get(s.id) ?? [], receiptId: s.receipt_id ?? null, receiptCode: s.receipt_code ?? "" });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label ?? "",
    status: statusOf(r.status),
    sourceKey: r.source_key || UNKNOWN_SOURCE,
    boughtAt: r.bought_at,
    shippedAt: r.shipped_at,
    tracking: r.tracking ?? "",
    note: r.note ?? "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lines: lines.filter((l) => l.batch_id === r.id).map(toLine),
    receipts: bills.filter((x) => x.batch_id === r.id).map((x) => ({ id: x.id, code: x.code, boughtAt: x.bought_at, sourceKey: x.source_key, orderRef: x.order_ref ?? "", totalJpy: x.total_jpy, status: x.status, items: Number(x.items), files: parseReceiptFiles(x.files) })),
    lots: lotsAll.filter((l) => l.batchId === r.id),
    stock: stock.filter((s) => s.batch_id === r.id).map(toStock),
    held: held.filter((s) => s.origin_batch_id === r.id).map(toStock),
  }));
}

/** Open batches first (newest on top); `includeDone` adds the ones already at the shop. */
export interface BatchSearch {
  includeDone?: boolean;
  /** Matches code / label / note (case-insensitive). */
  q?: string;
  /** Bought date range (inclusive, ISO date). */
  from?: string;
  to?: string;
}
export function listPurchaseBatches(opts: boolean | BatchSearch = false, limit = 60): PurchaseBatch[] {
  const o: BatchSearch = typeof opts === "boolean" ? { includeDone: opts } : opts;
  const where: string[] = [];
  const args: unknown[] = [];
  if (!o.includeDone) where.push("status <> 'at_shop'");
  if (o.q) {
    where.push("(LOWER(code) LIKE ? OR LOWER(label) LIKE ? OR LOWER(note) LIKE ?)");
    const like = `%${o.q.toLowerCase()}%`;
    args.push(like, like, like);
  }
  if (o.from) {
    where.push("COALESCE(bought_at, substr(created_at, 1, 10)) >= ?");
    args.push(o.from);
  }
  if (o.to) {
    where.push("COALESCE(bought_at, substr(created_at, 1, 10)) <= ?");
    args.push(o.to);
  }
  const rows = getDb()
    .prepare(`SELECT * FROM purchase_batches ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY CASE status WHEN 'at_shop' THEN 1 ELSE 0 END, id DESC LIMIT ?`)
    .all(...(args as never[]), limit) as unknown as BatchRow[];
  return hydrate(rows);
}

/** Lightweight list of the open batches for "thêm vào đợt" pickers. */
export function listBatchHeads(): Array<{ id: number; code: string; label: string; status: PurchaseStatus }> {
  const rows = getDb().prepare("SELECT id, code, label, status FROM purchase_batches WHERE status <> 'at_shop' ORDER BY id DESC").all() as unknown as Array<{ id: number; code: string; label: string; status: string }>;
  return rows.map((r) => ({ id: r.id, code: r.code, label: r.label ?? "", status: statusOf(r.status) }));
}

export function getPurchaseBatch(id: number): PurchaseBatch | null {
  const r = getDb().prepare("SELECT * FROM purchase_batches WHERE id = ?").get(id) as BatchRow | undefined;
  return r ? hydrate([r])[0] : null;
}

function nextCode(date: string): string {
  const db = getDb();
  const prefix = batchCode(date, 1).slice(0, -3);
  const n = (db.prepare("SELECT COUNT(*) AS n FROM purchase_batches WHERE code LIKE ?").get(`${prefix}-%`) as { n: number }).n;
  let seq = Number(n) + 1;
  while (db.prepare("SELECT 1 FROM purchase_batches WHERE code = ?").get(batchCode(date, seq))) seq++;
  return batchCode(date, seq);
}

export function createPurchaseBatch(input: { label: string; sourceKey: string; boughtAt: string | null; note: string }): PurchaseBatch {
  const db = getDb();
  const now = new Date().toISOString();
  const id = withTransaction(db, () => {
    const code = nextCode(todayIso());
    const r = db.prepare("INSERT INTO purchase_batches (code, label, status, source_key, bought_at, shipped_at, tracking, note, created_at, updated_at) VALUES (?, ?, 'not_bought', ?, ?, NULL, '', ?, ?, ?)").run(code, input.label, input.sourceKey || UNKNOWN_SOURCE, input.boughtAt, input.note, now, now);
    return Number(r.lastInsertRowid);
  });
  return getPurchaseBatch(id)!;
}

export function updatePurchaseBatch(id: number, patch: { label?: string; sourceKey?: string; boughtAt?: string | null; tracking?: string; note?: string }): boolean {
  const db = getDb();
  const cur = db.prepare("SELECT * FROM purchase_batches WHERE id = ?").get(id) as BatchRow | undefined;
  if (!cur) return false;
  db.prepare("UPDATE purchase_batches SET label = ?, source_key = ?, bought_at = ?, tracking = ?, note = ?, updated_at = ? WHERE id = ?").run(patch.label ?? cur.label, patch.sourceKey || cur.source_key, patch.boughtAt === undefined ? cur.bought_at : patch.boughtAt, patch.tracking ?? cur.tracking, patch.note ?? cur.note, new Date().toISOString(), id);
  return true;
}

/** Order lines the batch will carry; lines already in another batch are skipped. Status catches up with the batch. */
export function addLinesToBatch(batchId: number, itemIds: number[]): { added: number; code: string } | null {
  const db = getDb();
  const batch = db.prepare("SELECT * FROM purchase_batches WHERE id = ?").get(batchId) as BatchRow | undefined;
  if (!batch || !itemIds.length) return null;
  const now = new Date().toISOString();
  const target = statusOf(batch.status);
  let added = 0;
  withTransaction(db, () => {
    for (const itemId of itemIds) {
      const line = db.prepare("SELECT id, purchase_status, batch_id, source_key FROM order_items WHERE id = ?").get(itemId) as { id: number; purchase_status: string | null; batch_id: number | null; source_key: string | null } | undefined;
      if (!line || (line.batch_id && line.batch_id !== batchId)) continue;
      const status = purchaseIndex(statusOf(line.purchase_status)) < purchaseIndex(target) ? target : statusOf(line.purchase_status);
      db.prepare("UPDATE order_items SET batch_id = ?, source_key = CASE WHEN COALESCE(source_key, '') = '' THEN ? ELSE source_key END, purchase_status = ?, purchase_updated_at = CASE WHEN purchase_status <> ? THEN ? ELSE purchase_updated_at END WHERE id = ?").run(batchId, batch.source_key, status, status, now, itemId);
      // the line's source is now "mua trong đợt này" (admin decision → manual, "Phân bổ lại" keeps it)
      setManualAllocationSync(db, itemId, "batch", batchId);
      added++;
    }
    db.prepare("UPDATE purchase_batches SET updated_at = ? WHERE id = ?").run(now, batchId);
  });
  return { added, code: batch.code };
}

/** Take a line out of its batch (its purchase status stays as it is). */
export function removeLineFromBatch(itemId: number): boolean {
  const db = getDb();
  const cur = db.prepare("SELECT batch_id FROM order_items WHERE id = ?").get(itemId) as { batch_id: number | null } | undefined;
  if (!cur?.batch_id) return false;
  withTransaction(db, () => detachItemFromBatchSync(db, itemId, cur.batch_id as number));
  return true;
}

/** Surplus bought in this batch with no order behind it → a stock purchase that follows the batch and becomes a lot at the shop. */
export async function addSurplusToBatch(batchId: number, input: { productId: number; qty: number; expiry: string | null; boughtAt: string | null; unitCostJpy: number | null; note: string; sourceKey?: string; receiptId?: number | null }): Promise<PurchaseBatchStock | null> {
  const db = getDb();
  const batch = db.prepare("SELECT * FROM purchase_batches WHERE id = ?").get(batchId) as BatchRow | undefined;
  if (!batch) return null;
  const sp = await createStockPurchase({
    productId: input.productId,
    qty: input.qty,
    sourceKey: input.sourceKey || batch.source_key,
    unitCostJpy: input.unitCostJpy,
    expiry: input.expiry,
    boughtAt: input.boughtAt ?? batch.bought_at,
    warehouse: DEFAULT_WAREHOUSE,
    location: "",
    note: input.note ? `Đợt ${batch.code} · ${input.note}` : `Đợt ${batch.code}`,
    status: statusOf(batch.status),
    batchId,
  });
  if (input.receiptId) db.prepare("UPDATE stock_purchases SET receipt_id = ? WHERE id = ?").run(input.receiptId, sp.id);
  db.prepare("UPDATE purchase_batches SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), batchId);
  return getPurchaseBatch(batchId)?.stock.find((s) => s.id === sp.id) ?? null;
}

/**
 * A product bought in this batch: the units first cover the open "Chưa mua" lines of that product (oldest first, whole
 * lines — they join the batch with the note "Tự động lấy từ mua theo đợt"), the rest is booked as surplus for stock
 * with its own expiry. Call once per expiry date when the same product came with several dates.
 */
export async function addProductToBatch(batchId: number, input: { productId: number; qty: number; expiry: string | null; boughtAt: string | null; unitCostJpy: number | null; note: string; sourceKey?: string; receiptId?: number | null }): Promise<{ code: string; covered: number; orderUnits: number; stockUnits: number; lotId: number | null } | null> {
  const db = getDb();
  const batch = db.prepare("SELECT * FROM purchase_batches WHERE id = ?").get(batchId) as BatchRow | undefined;
  if (!batch) return null;
  // one stock row for everything bought; the lines still "Cần mua" reserve their units from it (oldest order first),
  // the rest stays as stock for later orders — and each line carries the source it was really bought at
  const s = await addSurplusToBatch(batchId, input);
  if (!s) return null;
  const served = withTransaction(db, () => allocatePendingForProductSync(db, input.productId));
  if (served.length) {
    const ph = served.map(() => "?").join(",");
    db.prepare(`UPDATE order_items SET source_key = ? WHERE id IN (${ph}) AND id IN (SELECT order_item_id FROM order_item_allocations WHERE source_type = 'stock_purchase' AND source_id = ?)`).run(input.sourceKey || batch.source_key, ...served, s.id);
    // lines served from this purchase were paid on the same bill (a lot is created at "bought", so look through it too)
    if (input.receiptId) db.prepare(`UPDATE order_items SET receipt_id = ? WHERE id IN (${ph}) AND (id IN (SELECT order_item_id FROM order_item_allocations WHERE source_type = 'stock_purchase' AND source_id = ?) OR (? IS NOT NULL AND id IN (SELECT order_item_id FROM order_item_allocations WHERE source_type = 'lot' AND source_id = ?)))`).run(input.receiptId, ...served, s.id, s.lotId, s.lotId);
  }
  const res = listReservationsForStockPurchases(db, [s.id]).get(s.id) ?? [];
  const orderUnits = res.reduce((n, r) => n + r.qty, 0);
  return { code: batch.code, covered: res.length, orderUnits, stockUnits: input.qty - orderUnits, lotId: s.lotId };
}

/** Surplus still unbooked in open batches, per product → [{batchId, code, qty}] (oldest batch first). */
export function listOpenSurplus(): Map<number, Array<{ batchId: number; code: string; qty: number }>> {
  const rows = db_openSurplus();
  const out = new Map<number, Array<{ batchId: number; code: string; qty: number }>>();
  for (const r of rows) if (r.qty > 0) out.set(r.product_id, [...(out.get(r.product_id) ?? []), { batchId: r.batch_id, code: r.code, qty: Number(r.qty) }]);
  return out;
}
/** Units of batch stock rows not reserved by any order, per product × batch. */
function db_openSurplus(): Array<{ product_id: number; batch_id: number; code: string; qty: number }> {
  const db = getDb();
  const rows = db
    .prepare("SELECT sp.id, sp.qty, sp.product_id, sp.batch_id, b.code FROM stock_purchases sp JOIN purchase_batches b ON b.id = sp.batch_id WHERE sp.lot_id IS NULL AND b.status <> 'at_shop' ORDER BY sp.batch_id")
    .all() as unknown as Array<{ id: number; qty: number; product_id: number; batch_id: number; code: string }>;
  const lots = db
    .prepare("SELECT l.id, l.qty_left AS qty, l.product_id, l.batch_id, b.code FROM stock_lots l JOIN purchase_batches b ON b.id = l.batch_id WHERE l.qty_left > 0 AND b.status <> 'at_shop' ORDER BY l.batch_id")
    .all() as unknown as Array<{ id: number; qty: number; product_id: number; batch_id: number; code: string }>;
  const agg = new Map<string, { product_id: number; batch_id: number; code: string; qty: number }>();
  const add = (r: { id: number; qty: number; product_id: number; batch_id: number; code: string }, type: "stock_purchase" | "lot") => {
    const k = `${r.product_id}:${r.batch_id}`;
    const cur = agg.get(k) ?? { product_id: r.product_id, batch_id: r.batch_id, code: r.code, qty: 0 };
    cur.qty += Math.max(0, r.qty - reservedOn(db, type, r.id));
    agg.set(k, cur);
  };
  for (const r of rows) add(r, "stock_purchase");
  for (const r of lots) add(r, "lot");
  return [...agg.values()];
}

/**
 * Right after checkout: every line of the new order that stock could not cover is served from an open batch's surplus
 * when one has enough units (oldest batch first) — "mua theo đặt hàng" fills itself from "mua theo đợt".
 * Never throws (checkout must not fail because of this); returns how many lines were allocated.
 */
export function autoAllocateOrderFromBatches(orderId: string): number {
  try {
    const db = getDb();
    withTransaction(db, () => allocateOrderSync(db, orderId, false));
    return 1;
  } catch {
    return 0;
  }
}

/** Drop a surplus row (refused once it has become a lot — manage the lot in Kho hàng instead). */
export async function removeSurplusFromBatch(stockPurchaseId: number): Promise<boolean> {
  return deleteStockPurchase(stockPurchaseId);
}

/**
 * A customer ordered while the batch is on its way: serve the line from the surplus (nearest expiry first).
 * The surplus rows shrink, the line joins the batch and takes its status.
 */
export function allocateSurplusToLine(batchId: number, itemId: number, note?: string): { ok: boolean; message: string } {
  const db = getDb();
  const batch = db.prepare("SELECT * FROM purchase_batches WHERE id = ?").get(batchId) as BatchRow | undefined;
  if (!batch) return { ok: false, message: "Không tìm thấy đợt gửi." };
  const line = db.prepare("SELECT id, product_id, quantity, purchase_status, batch_id FROM order_items WHERE id = ?").get(itemId) as { id: number; product_id: number; quantity: number; purchase_status: string | null; batch_id: number | null } | undefined;
  if (!line) return { ok: false, message: "Không tìm thấy dòng đơn." };
  void note;
  const inBatch = new Set((db.prepare("SELECT id FROM stock_purchases WHERE batch_id = ? AND product_id = ? AND lot_id IS NULL").all(batchId, line.product_id) as Array<{ id: number }>).map((r) => r.id));
  const lotsInBatch = new Set((db.prepare("SELECT id FROM stock_lots WHERE batch_id = ? AND product_id = ? AND qty_left > 0").all(batchId, line.product_id) as Array<{ id: number }>).map((r) => r.id));
  const best = candidatesFor(db, line.product_id, itemId)
    .filter((c) => (c.type === "stock_purchase" && inBatch.has(c.id)) || (c.type === "lot" && lotsInBatch.has(c.id)))
    .sort((a, b) => (a.type === b.type ? b.available - a.available : a.type === "lot" ? -1 : 1))[0];
  if (!best) return { ok: false, message: "Đợt này không còn đơn vị nào trống của sản phẩm đó." };
  const r = withTransaction(db, () => setManualAllocationSync(db, itemId, best.type, best.id));
  if (!r.ok) return r;
  const fromSource = (db.prepare(best.type === "lot" ? "SELECT source_key FROM stock_lots WHERE id = ?" : "SELECT source_key FROM stock_purchases WHERE id = ?").get(best.id) as { source_key: string }).source_key || batch.source_key;
  db.prepare("UPDATE order_items SET source_key = ? WHERE id = ?").run(fromSource, itemId);
  db.prepare("UPDATE purchase_batches SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), batchId);
  return { ok: true, message: best.available >= line.quantity ? `Đã giữ ${line.quantity} đv hàng lưu kho của đợt ${batch.code} cho dòng đơn.` : `Đợt ${batch.code} chỉ còn ${best.available} đv trống — đã giữ phần đó, phần còn lại là “Cần mua”.` };
}

/**
 * Move the whole batch: every order line catches up (never moved backwards), every surplus row follows and becomes a lot
 * at "at_shop" (expiry + purchase date travel with it). Returns how many lines moved and how many lots were booked.
 */
export async function setPurchaseBatchStatus(id: number, status: PurchaseStatus, note?: string): Promise<{ ok: boolean; lines: number; lots: number; message?: string }> {
  const db = getDb();
  const batch = db.prepare("SELECT * FROM purchase_batches WHERE id = ?").get(id) as BatchRow | undefined;
  if (!batch) return { ok: false, lines: 0, lots: 0, message: "Không tìm thấy đợt gửi." };
  const target: PurchaseStatus = purchaseIndex(status) > purchaseIndex(BATCH_DONE) ? BATCH_DONE : status;
  const now = new Date().toISOString();
  const today = todayIso();
  // order lines: raise only
  const lines = db.prepare("SELECT id, purchase_status FROM order_items WHERE batch_id = ?").all(id) as unknown as Array<{ id: number; purchase_status: string | null }>;
  const toRaise = lines.filter((l) => purchaseIndex(statusOf(l.purchase_status)) < purchaseIndex(target)).map((l) => l.id);
  if (toRaise.length) {
    const ph = toRaise.map(() => "?").join(",");
    db.prepare(`UPDATE order_items SET purchase_status = ?, purchase_updated_at = ? WHERE id IN (${ph})`).run(target, now, ...toRaise);
  }
  // slips not yet lots follow the batch (they become lots at "Tại kho Nhật"); lots already in the batch move to the place the status implies
  const stock = db.prepare("SELECT id, status, lot_id FROM stock_purchases WHERE batch_id = ?").all(id) as unknown as Array<{ id: number; status: string; lot_id: number | null }>;
  let lots = 0;
  for (const s of stock) {
    if (s.lot_id) continue;
    if (purchaseIndex(statusOf(s.status)) >= purchaseIndex(target)) continue;
    const r = await setStockPurchaseStatus(s.id, target);
    if (r.ok && r.lotId) lots++;
  }
  const loc = locationForStatus(target);
  if (loc) {
    const lotIds = (db.prepare("SELECT id FROM stock_lots WHERE batch_id = ?").all(id) as Array<{ id: number }>).map((r) => r.id);
    withTransaction(db, () => setLotLocationSync(db, lotIds, loc.warehouse, loc.inTransit));
  }
  const boughtAt = batch.bought_at ?? (purchaseIndex(target) >= purchaseIndex("bought") ? today : null);
  const shippedAt = batch.shipped_at ?? (purchaseIndex(target) >= purchaseIndex("shipped_jp_vn") ? today : null);
  db.prepare("UPDATE purchase_batches SET status = ?, bought_at = ?, shipped_at = ?, note = COALESCE(?, note), updated_at = ? WHERE id = ?").run(target, boughtAt, shippedAt, note ?? null, now, id);
  onBatchChangedSync(db, id); // lines served from this batch (directly or through its stock rows) follow
  return { ok: true, lines: toRaise.length, lots };
}

/** Delete a batch that has not produced lots yet: lines are unlinked (status kept), surplus rows are dropped. */
export async function deletePurchaseBatch(id: number): Promise<{ ok: boolean; message?: string }> {
  const db = getDb();
  const batch = db.prepare("SELECT id FROM purchase_batches WHERE id = ?").get(id) as { id: number } | undefined;
  if (!batch) return { ok: false, message: "Không tìm thấy đợt gửi." };
  const st = db.prepare("SELECT status FROM purchase_batches WHERE id = ?").get(id) as { status: string };
  if (purchaseIndex(statusOf(st.status)) > purchaseIndex("bought")) return { ok: false, message: "Chuyến đã rời kho Nhật — không xoá được." };
  withTransaction(db, () => {
    // members go back to Kho Nhật (shop) / stay as open slips; nothing is deleted
    db.prepare("UPDATE order_items SET batch_id = NULL WHERE batch_id = ?").run(id);
    db.prepare("UPDATE stock_purchases SET batch_id = NULL, updated_at = ? WHERE batch_id = ?").run(new Date().toISOString(), id);
    const lotIds = (db.prepare("SELECT id FROM stock_lots WHERE batch_id = ?").all(id) as Array<{ id: number }>).map((r) => r.id);
    db.prepare("UPDATE stock_lots SET batch_id = NULL WHERE batch_id = ?").run(id);
    setLotLocationSync(db, lotIds, "jp", false);
    db.prepare("UPDATE order_item_allocations SET source_type = 'buy', source_id = NULL, manual = 0 WHERE source_type = 'batch' AND source_id = ?").run(id);
    db.prepare("DELETE FROM purchase_batches WHERE id = ?").run(id);
  });
  return { ok: true };
}

// ---------- editable rows · split / hold in Japan · move between batches ----------

interface SpRow {
  id: number;
  product_id: number;
  qty: number;
  source_key: string;
  unit_cost_jpy: number | null;
  status: string;
  expiry: string | null;
  bought_at: string | null;
  warehouse: string;
  location: string;
  note: string;
  lot_id: number | null;
  batch_id: number | null;
  origin_batch_id: number | null;
  receipt_id: number | null;
}

/** Edit one stock row (refused once it is a lot). A status change walks the row through setStockPurchaseStatus (lot at "at_shop"). */
export async function updateBatchStock(spId: number, patch: { productId?: number; qty?: number; sourceKey?: string; expiry?: string | null; boughtAt?: string | null; unitCostJpy?: number | null; note?: string; status?: PurchaseStatus }): Promise<{ ok: boolean; message?: string }> {
  const db = getDb();
  const cur = db.prepare("SELECT * FROM stock_purchases WHERE id = ?").get(spId) as SpRow | undefined;
  if (!cur) return { ok: false, message: "Không tìm thấy dòng." };
  if (cur.lot_id) return { ok: false, message: "Dòng đã nhập kho thành lô — sửa lô trong Kho hàng." };
  if (patch.productId && !db.prepare("SELECT 1 FROM products WHERE id = ?").get(patch.productId)) return { ok: false, message: "Sản phẩm không tồn tại." };
  const held = reservedOn(db, "stock_purchase", spId);
  if (patch.qty && patch.qty > 0 && patch.qty < held) return { ok: false, message: `Dòng này đang giữ ${held} đv cho đơn khách — không giảm dưới số đó (đổi nguồn ở trang đơn trước).` };
  if (patch.productId && patch.productId !== cur.product_id && held > 0) return { ok: false, message: "Dòng này đang giữ hàng cho đơn khách — bỏ giữ chỗ ở trang đơn trước khi đổi sản phẩm." };
  // the table shows the note without its "Đợt CODE · " prefix; put it back so the slip still says which batch it came with
  let note = patch.note ?? cur.note;
  if (patch.note !== undefined && cur.batch_id) {
    const code = (db.prepare("SELECT code FROM purchase_batches WHERE id = ?").get(cur.batch_id) as { code: string } | undefined)?.code;
    if (code && !note.startsWith(`Đợt ${code}`)) note = note ? `Đợt ${code} · ${note}` : `Đợt ${code}`;
  }
  db.prepare("UPDATE stock_purchases SET product_id = ?, qty = ?, source_key = ?, expiry = ?, bought_at = ?, unit_cost_jpy = ?, note = ?, updated_at = ? WHERE id = ?").run(
    patch.productId ?? cur.product_id,
    patch.qty && patch.qty > 0 ? patch.qty : cur.qty,
    patch.sourceKey || cur.source_key,
    patch.expiry === undefined ? cur.expiry : patch.expiry,
    patch.boughtAt === undefined ? cur.bought_at : patch.boughtAt,
    patch.unitCostJpy === undefined ? cur.unit_cost_jpy : patch.unitCostJpy,
    note,
    new Date().toISOString(),
    spId,
  );
  if (patch.status && patch.status !== cur.status) {
    const r = await setStockPurchaseStatus(spId, patch.status);
    if (!r.ok) return { ok: false, message: r.message };
  } else onStockPurchaseChangedSync(db, spId);
  return { ok: true };
}

/**
 * Split `qty` units off a stock row. "hold": they stay in Japan for a later shipment (leave this batch, remember it as
 * origin, status falls back to "Đã mua"); "split": a second row inside the same batch (another expiry / source).
 */
export function splitBatchStock(spId: number, qty: number, mode: "hold" | "split"): { ok: boolean; message: string; newId?: number } {
  const db = getDb();
  const cur = db.prepare("SELECT * FROM stock_purchases WHERE id = ?").get(spId) as SpRow | undefined;
  if (!cur) return { ok: false, message: "Không tìm thấy dòng." };
  if (cur.lot_id) return { ok: false, message: "Dòng đã nhập kho thành lô — tách lô trong Kho hàng." };
  if (!Number.isInteger(qty) || qty <= 0 || qty >= cur.qty) return { ok: false, message: `Số tách phải từ 1 đến ${cur.qty - 1} (dòng đang có ${cur.qty} đv).` };
  const held = reservedOn(db, "stock_purchase", spId);
  if (cur.qty - qty < held) return { ok: false, message: `Dòng đang giữ ${held} đv cho đơn khách — chỉ tách được tối đa ${cur.qty - held} đv.` };
  const batch = cur.batch_id ? (db.prepare("SELECT code FROM purchase_batches WHERE id = ?").get(cur.batch_id) as { code: string } | undefined) : undefined;
  const now = new Date().toISOString();
  const hold = mode === "hold";
  const status = hold && purchaseIndex(statusOf(cur.status)) > purchaseIndex("bought") ? "bought" : cur.status;
  const note = hold ? [`Giữ lại Nhật từ đợt ${batch?.code ?? "?"} · chờ đợt sau`, cur.note].filter(Boolean).join(" · ") : cur.note;
  const newId = withTransaction(db, () => {
    db.prepare("UPDATE stock_purchases SET qty = ?, updated_at = ? WHERE id = ?").run(cur.qty - qty, now, spId);
    const r = db
      .prepare("INSERT INTO stock_purchases (product_id, qty, source_key, unit_cost_jpy, status, expiry, bought_at, warehouse, location, note, batch_id, origin_batch_id, receipt_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(cur.product_id, qty, cur.source_key, cur.unit_cost_jpy, status, cur.expiry, cur.bought_at, cur.warehouse, cur.location, note, hold ? null : cur.batch_id, hold ? cur.batch_id : cur.origin_batch_id, cur.receipt_id, now, now);
    return Number(r.lastInsertRowid);
  });
  return { ok: true, message: hold ? `Đã giữ lại ${qty} đv tại Nhật (chờ đợt sau); ${cur.qty - qty} đv vẫn đi đợt này.` : `Đã tách ${qty} đv thành dòng riêng trong đợt.`, newId };
}

/** Ticked rows: stock rows are kept in Japan for a later batch (origin remembered), order lines simply leave the batch. */
export function holdBatchRows(batchId: number, stockIds: number[], itemIds: number[], lotIds: number[] = []): { stock: number; lines: number; lots: number } {
  const lotsRes = lotIds.length ? removeLotsFromBatch(lotIds) : { removed: 0 };
  const db = getDb();
  const batch = db.prepare("SELECT code FROM purchase_batches WHERE id = ?").get(batchId) as { code: string } | undefined;
  if (!batch) return { stock: 0, lines: 0, lots: lotsRes.removed };
  const now = new Date().toISOString();
  let stock = 0;
  let lines = 0;
  withTransaction(db, () => {
    for (const id of stockIds) {
      const cur = db.prepare("SELECT status, note FROM stock_purchases WHERE id = ? AND batch_id = ? AND lot_id IS NULL").get(id, batchId) as { status: string; note: string } | undefined;
      if (!cur) continue;
      const status = purchaseIndex(statusOf(cur.status)) > purchaseIndex("bought") ? "bought" : cur.status;
      db.prepare("UPDATE stock_purchases SET batch_id = NULL, origin_batch_id = ?, status = ?, note = ?, updated_at = ? WHERE id = ?").run(batchId, status, [`Giữ lại Nhật từ đợt ${batch.code} · chờ đợt sau`, cur.note].filter(Boolean).join(" · "), now, id);
      onStockPurchaseChangedSync(db, id);
      stock++;
    }
    if (itemIds.length) {
      const ph = itemIds.map(() => "?").join(",");
      lines = Number(db.prepare(`UPDATE order_items SET batch_id = NULL WHERE batch_id = ? AND id IN (${ph})`).run(batchId, ...itemIds).changes);
    }
  });
  return { stock, lines, lots: lotsRes.removed };
}

/** Stock rows (held in Japan, or plain "mua lưu kho" slips) → into a batch; the row catches up with the batch status. */
export async function moveStockToBatch(spIds: number[], batchId: number): Promise<{ moved: number; code: string } | null> {
  const db = getDb();
  const batch = db.prepare("SELECT id, code, status FROM purchase_batches WHERE id = ?").get(batchId) as { id: number; code: string; status: string } | undefined;
  if (!batch) return null;
  const now = new Date().toISOString();
  let moved = 0;
  for (const id of spIds) {
    const cur = db.prepare("SELECT batch_id, origin_batch_id, status FROM stock_purchases WHERE id = ? AND lot_id IS NULL").get(id) as { batch_id: number | null; origin_batch_id: number | null; status: string } | undefined;
    if (!cur || cur.batch_id === batchId) continue;
    db.prepare("UPDATE stock_purchases SET batch_id = ?, origin_batch_id = ?, updated_at = ? WHERE id = ?").run(batchId, cur.origin_batch_id ?? cur.batch_id, now, id);
    if (purchaseIndex(statusOf(cur.status)) < purchaseIndex(statusOf(batch.status))) await setStockPurchaseStatus(id, statusOf(batch.status));
    else onStockPurchaseChangedSync(db, id);
    moved++;
  }
  if (moved) db.prepare("UPDATE purchase_batches SET updated_at = ? WHERE id = ?").run(now, batchId);
  return { moved, code: batch.code };
}

// ---------- lots in a shipment (Kho Nhật → chuyến) ----------

const LOCK_FROM: PurchaseStatus = "shipped_jp_vn";

/** Lots at Kho Nhật (shop) go into a gathering / bought batch; a partial quantity splits the lot first (reservations travel). */
export function addLotsToBatch(batchId: number, items: Array<{ lotId: number; qty?: number | null }>): { ok: boolean; message: string; added: number } {
  const db = getDb();
  const batch = db.prepare("SELECT id, code, status FROM purchase_batches WHERE id = ?").get(batchId) as { id: number; code: string; status: string } | undefined;
  if (!batch) return { ok: false, message: "Không tìm thấy chuyến.", added: 0 };
  if (purchaseIndex(statusOf(batch.status)) >= purchaseIndex(LOCK_FROM)) return { ok: false, message: `Chuyến ${batch.code} đã bay NB→VN — không thêm lô được nữa.`, added: 0 };
  let added = 0;
  const skipped: string[] = [];
  const now = new Date().toISOString();
  withTransaction(db, () => {
    for (const it of items) {
      const lot = db.prepare("SELECT id, qty_left, warehouse, in_transit, batch_id FROM stock_lots WHERE id = ?").get(it.lotId) as { id: number; qty_left: number; warehouse: string; in_transit: number; batch_id: number | null } | undefined;
      if (!lot) continue;
      const heldUnits = heldAllocationsSync(db, lot.id).reduce((n, a) => n + a.qty, 0);
      if (lot.qty_left <= 0 && heldUnits <= 0) continue;
      if (lot.batch_id && lot.batch_id !== batchId) {
        skipped.push(`lô #${lot.id} đang ở chuyến khác`);
        continue;
      }
      if (lot.warehouse !== "jp" || lot.in_transit) {
        skipped.push(`lô #${lot.id} không ở Kho Nhật (shop)`);
        continue;
      }
      // a number below the unsold count splits: that many unsold units + every unit customers already paid for
      const qty = typeof it.qty === "number" && it.qty >= 0 && it.qty < lot.qty_left ? it.qty : null;
      if (qty !== null) {
        const r = splitLotSync(db, lot.id, qty, { moveReservations: true, batchId });
        if (!r.ok) {
          skipped.push(`lô #${lot.id}: ${r.message}`);
          continue;
        }
        added++;
      } else if (lot.batch_id !== batchId) {
        db.prepare("UPDATE stock_lots SET batch_id = ?, updated_at = ? WHERE id = ?").run(batchId, now, lot.id);
        added++;
      }
    }
    const lotIds = (db.prepare("SELECT id FROM stock_lots WHERE batch_id = ?").all(batchId) as Array<{ id: number }>).map((r) => r.id);
    // lines served from these lots now show the batch
    for (const id of lotIds) for (const it of db.prepare("SELECT DISTINCT order_item_id AS id FROM order_item_allocations WHERE source_type = 'lot' AND source_id = ?").all(id) as Array<{ id: number }>) syncItemStatusSync(db, it.id);
    db.prepare("UPDATE purchase_batches SET updated_at = ? WHERE id = ?").run(now, batchId);
  });
  return { ok: added > 0 || !skipped.length, message: `Đã đưa ${added} lô vào chuyến ${batch.code}${skipped.length ? ` · bỏ qua: ${skipped.join("; ")}` : ""}.`, added };
}

/** "Giữ lại Nhật": lots leave the batch and stand at Kho Nhật (shop) again — allowed until the batch has flown. */
export function removeLotsFromBatch(lotIds: number[]): { ok: boolean; message: string; removed: number } {
  const db = getDb();
  let removed = 0;
  let merged = 0;
  const refused: string[] = [];
  withTransaction(db, () => {
    for (const id of lotIds) {
      const lot = db.prepare("SELECT l.id, l.batch_id, b.code, b.status FROM stock_lots l LEFT JOIN purchase_batches b ON b.id = l.batch_id WHERE l.id = ?").get(id) as { id: number; batch_id: number | null; code: string | null; status: string | null } | undefined;
      if (!lot || !lot.batch_id) continue;
      if (purchaseIndex(statusOf(lot.status)) >= purchaseIndex(LOCK_FROM)) {
        refused.push(`lô #${id} (chuyến ${lot.code} đã bay)`);
        continue;
      }
      db.prepare("UPDATE stock_lots SET batch_id = NULL WHERE id = ?").run(id);
      setLotLocationSync(db, [id], "jp", false);
      removed++;
      // a part split off for this shipment rejoins its parent lot if that one still waits at Kho Nhật outside any shipment
      const parent = db.prepare("SELECT p.id FROM stock_lots c JOIN stock_lots p ON p.id = c.parent_lot_id WHERE c.id = ? AND p.warehouse = 'jp' AND COALESCE(p.in_transit, 0) = 0 AND p.batch_id IS NULL AND p.qty_left > 0").get(id) as { id: number } | undefined;
      if (parent) {
        const m = mergeLotBackSync(db, id);
        if (m.ok) merged++;
      }
    }
  });
  return { ok: removed > 0 || !refused.length, message: `Đã giữ lại Nhật ${removed} lô${merged ? ` (gộp lại ${merged} lô về lô gốc)` : ""}${refused.length ? ` · không rút được: ${refused.join("; ")}` : ""}.`, removed };
}

/** Lots that can still be put into a shipment: at Kho Nhật (shop), not in any batch. */
export function listLotsAvailableForBatch(): ReturnType<typeof listLotViews> {
  return listLotViews(getDb(), {}).filter((l) => l.warehouse === "jp" && !l.inTransit && !l.batchId);
}

/** Ticked rows belong to this bill (paper trail): order lines, slips, and lots (through their slip). */
export function assignReceiptToRows(receiptId: number, rows: { ids: number[]; sids: number[]; lotIds: number[] }): number {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM purchase_receipts WHERE id = ?").get(receiptId)) return 0;
  let n = 0;
  withTransaction(db, () => {
    if (rows.ids.length) n += Number(db.prepare(`UPDATE order_items SET receipt_id = ? WHERE id IN (${rows.ids.map(() => "?").join(",")})`).run(receiptId, ...rows.ids).changes);
    if (rows.sids.length) n += Number(db.prepare(`UPDATE stock_purchases SET receipt_id = ? WHERE id IN (${rows.sids.map(() => "?").join(",")})`).run(receiptId, ...rows.sids).changes);
    for (const lotId of rows.lotIds) {
      const r = db.prepare("UPDATE stock_purchases SET receipt_id = ? WHERE lot_id = ?").run(receiptId, lotId);
      if (Number(r.changes) === 0) {
        // a lot entered by hand has no slip yet: make one so the bill reference has somewhere to live
        const lot = db.prepare("SELECT product_id, qty_in, source_key, unit_cost_jpy, expiry, bought_at, warehouse, note, batch_id FROM stock_lots WHERE id = ?").get(lotId) as { product_id: number; qty_in: number; source_key: string; unit_cost_jpy: number | null; expiry: string | null; bought_at: string | null; warehouse: string; note: string; batch_id: number | null } | undefined;
        if (!lot) continue;
        const now = new Date().toISOString();
        const ins = db.prepare("INSERT INTO stock_purchases (product_id, qty, source_key, unit_cost_jpy, status, expiry, bought_at, warehouse, location, note, lot_id, batch_id, receipt_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'bought', ?, ?, ?, '', ?, ?, ?, ?, ?, ?)").run(lot.product_id, lot.qty_in, lot.source_key, lot.unit_cost_jpy, lot.expiry, lot.bought_at, lot.warehouse, lot.note, lotId, lot.batch_id, receiptId, now, now);
        db.prepare("UPDATE stock_lots SET purchase_id = ? WHERE id = ? AND purchase_id IS NULL").run(Number(ins.lastInsertRowid), lotId);
      }
      n++;
    }
  });
  return n;
}

/** The bill a lot was bought on (through its slip); null clears it. */
export function setLotReceipt(lotId: number, receiptId: number | null): void {
  if (receiptId) {
    assignReceiptToRows(receiptId, { ids: [], sids: [], lotIds: [lotId] });
    return;
  }
  getDb().prepare("UPDATE stock_purchases SET receipt_id = NULL WHERE lot_id = ?").run(lotId);
}

/** The bill of a lot, created on the spot when it has none (own code or PM-…), so photos / codes can attach per lot. */
export function ensureLotReceipt(lotId: number, opts: { code?: string } = {}): number | null {
  const db = getDb();
  const lot = db.prepare("SELECT l.id, l.batch_id, l.source_key, l.bought_at, l.received_at, (SELECT sp.receipt_id FROM stock_purchases sp WHERE sp.lot_id = l.id AND sp.receipt_id IS NOT NULL LIMIT 1) AS receipt_id FROM stock_lots l WHERE l.id = ?").get(lotId) as { id: number; batch_id: number | null; source_key: string; bought_at: string | null; received_at: string; receipt_id: number | null } | undefined;
  if (!lot) return null;
  const code = (opts.code ?? "").trim();
  if (lot.receipt_id && !code) return lot.receipt_id;
  if (lot.receipt_id && code) {
    const cur = db.prepare("SELECT code FROM purchase_receipts WHERE id = ?").get(lot.receipt_id) as { code: string } | undefined;
    if (cur?.code === code) return lot.receipt_id;
  }
  const rc = createManualReceipt({ sourceKey: lot.source_key, boughtAt: lot.bought_at ?? lot.received_at, batchId: lot.batch_id, code: code || undefined });
  if (!rc) return null;
  setLotReceipt(lotId, rc.id);
  return rc.id;
}
