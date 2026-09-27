import "server-only";
import { createStockPurchase, deleteStockPurchase, setStockPurchaseStatus } from "./db";
import { todayIso } from "./lots";
import { isPurchaseStatus, type PurchaseStatus, purchaseIndex } from "./purchase";
import { BATCH_DONE, batchCode, planLineCover, planSurplusTake } from "./purchase-batches";
import { UNKNOWN_SOURCE } from "./purchase-sources";
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
}

const statusOf = (v: string | null): PurchaseStatus => (isPurchaseStatus(v) ? v : "not_bought");

function hydrate(rows: BatchRow[]): PurchaseBatch[] {
  if (!rows.length) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => "?").join(",");
  const lines = db
    .prepare(
      `SELECT oi.id, oi.order_id, o.number, o.first_name, o.last_name, oi.product_id, oi.name, oi.quantity, oi.purchase_status, oi.batch_id, oi.source_key, p.sku, p.thumb, p.cost_jpy
       FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.batch_id IN (${ph}) ORDER BY o.number, oi.id`,
    )
    .all(...ids) as unknown as LineRow[];
  const stock = db.prepare(`SELECT sp.*, p.name, p.sku, p.thumb, NULL AS cur_code FROM stock_purchases sp JOIN products p ON p.id = sp.product_id WHERE sp.batch_id IN (${ph}) ORDER BY sp.id`).all(...ids) as unknown as StockRow[];
  // split off and kept in Japan: waiting (batch_id NULL) or already inside a later batch
  const held = db.prepare(`SELECT sp.*, p.name, p.sku, p.thumb, b.code AS cur_code FROM stock_purchases sp JOIN products p ON p.id = sp.product_id LEFT JOIN purchase_batches b ON b.id = sp.batch_id WHERE sp.origin_batch_id IN (${ph}) AND (sp.batch_id IS NULL OR sp.batch_id <> sp.origin_batch_id) ORDER BY sp.id`).all(...ids) as unknown as StockRow[];
  const toLine = (l: LineRow): PurchaseBatchLine => ({ itemId: l.id, orderId: l.order_id, orderNumber: l.number, customerName: `${l.last_name} ${l.first_name}`.trim(), productId: l.product_id, productName: l.name, productSku: l.sku, productThumb: l.thumb ?? "", quantity: l.quantity, purchaseStatus: statusOf(l.purchase_status), costJpy: l.cost_jpy, sourceKey: l.source_key ?? "" });
  const toStock = (s: StockRow): PurchaseBatchStock => ({ id: s.id, productId: s.product_id, productName: s.name, productSku: s.sku, productThumb: s.thumb ?? "", qty: s.qty, expiry: s.expiry, boughtAt: s.bought_at, unitCostJpy: s.unit_cost_jpy, status: statusOf(s.status), warehouse: isWarehouse(s.warehouse) ? s.warehouse : DEFAULT_WAREHOUSE, lotId: s.lot_id, note: s.note ?? "", sourceKey: s.source_key || UNKNOWN_SOURCE, batchId: s.batch_id, batchCode: s.cur_code ?? "", originBatchId: s.origin_batch_id });
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
    stock: stock.filter((s) => s.batch_id === r.id).map(toStock),
    held: held.filter((s) => s.origin_batch_id === r.id).map(toStock),
  }));
}

/** Open batches first (newest on top); `includeDone` adds the ones already at the shop. */
export function listPurchaseBatches(includeDone = false, limit = 60): PurchaseBatch[] {
  const rows = getDb()
    .prepare(`SELECT * FROM purchase_batches ${includeDone ? "" : "WHERE status <> 'at_shop'"} ORDER BY CASE status WHEN 'at_shop' THEN 1 ELSE 0 END, id DESC LIMIT ?`)
    .all(limit) as unknown as BatchRow[];
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
      added++;
    }
    db.prepare("UPDATE purchase_batches SET updated_at = ? WHERE id = ?").run(now, batchId);
  });
  return { added, code: batch.code };
}

/** Take a line out of its batch (its purchase status stays as it is). */
export function removeLineFromBatch(itemId: number): boolean {
  return Number(getDb().prepare("UPDATE order_items SET batch_id = NULL WHERE id = ? AND batch_id IS NOT NULL").run(itemId).changes) > 0;
}

/** Surplus bought in this batch with no order behind it → a stock purchase that follows the batch and becomes a lot at the shop. */
export async function addSurplusToBatch(batchId: number, input: { productId: number; qty: number; expiry: string | null; boughtAt: string | null; unitCostJpy: number | null; note: string; sourceKey?: string }): Promise<PurchaseBatchStock | null> {
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
  db.prepare("UPDATE purchase_batches SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), batchId);
  return getPurchaseBatch(batchId)?.stock.find((s) => s.id === sp.id) ?? null;
}

/**
 * A product bought in this batch: the units first cover the open "Chưa mua" lines of that product (oldest first, whole
 * lines — they join the batch with the note "Tự động lấy từ mua theo đợt"), the rest is booked as surplus for stock
 * with its own expiry. Call once per expiry date when the same product came with several dates.
 */
export async function addProductToBatch(batchId: number, input: { productId: number; qty: number; expiry: string | null; boughtAt: string | null; unitCostJpy: number | null; note: string; sourceKey?: string }): Promise<{ code: string; covered: number; orderUnits: number; stockUnits: number; lotId: number | null } | null> {
  const db = getDb();
  const batch = db.prepare("SELECT * FROM purchase_batches WHERE id = ?").get(batchId) as BatchRow | undefined;
  if (!batch) return null;
  const open = db
    .prepare("SELECT oi.id AS itemId, oi.quantity FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = ? AND o.status IN ('pending','processing') AND (oi.purchase_status IS NULL OR oi.purchase_status = 'not_bought') AND oi.batch_id IS NULL ORDER BY o.created_at, oi.id")
    .all(input.productId) as unknown as Array<{ itemId: number; quantity: number }>;
  const plan = planLineCover(open, input.qty);
  const now = new Date().toISOString();
  const target = statusOf(batch.status);
  withTransaction(db, () => {
    // the goods were bought at THIS source — the covered lines record it (each product in a batch has its own)
    const upd = db.prepare("UPDATE order_items SET batch_id = ?, source_key = ?, purchase_status = ?, purchase_updated_at = ?, purchase_note = CASE WHEN purchase_note = '' THEN ? ELSE purchase_note END WHERE id = ?");
    for (const l of plan.cover) upd.run(batchId, input.sourceKey || batch.source_key, target, now, `Tự động lấy từ mua theo đợt ${batch.code}`, l.itemId);
    db.prepare("UPDATE purchase_batches SET updated_at = ? WHERE id = ?").run(now, batchId);
  });
  let lotId: number | null = null;
  if (plan.left > 0) {
    const s = await addSurplusToBatch(batchId, { ...input, qty: plan.left });
    lotId = s?.lotId ?? null;
  }
  return { code: batch.code, covered: plan.cover.length, orderUnits: input.qty - plan.left, stockUnits: plan.left, lotId };
}

/** Surplus still unbooked in open batches, per product → [{batchId, code, qty}] (oldest batch first). */
export function listOpenSurplus(): Map<number, Array<{ batchId: number; code: string; qty: number }>> {
  const rows = db_openSurplus();
  const out = new Map<number, Array<{ batchId: number; code: string; qty: number }>>();
  for (const r of rows) out.set(r.product_id, [...(out.get(r.product_id) ?? []), { batchId: r.batch_id, code: r.code, qty: Number(r.qty) }]);
  return out;
}
function db_openSurplus(): Array<{ product_id: number; batch_id: number; code: string; qty: number }> {
  return getDb()
    .prepare("SELECT sp.product_id, sp.batch_id, b.code, SUM(sp.qty) AS qty FROM stock_purchases sp JOIN purchase_batches b ON b.id = sp.batch_id WHERE sp.lot_id IS NULL AND b.status <> 'at_shop' GROUP BY sp.product_id, sp.batch_id ORDER BY sp.batch_id")
    .all() as unknown as Array<{ product_id: number; batch_id: number; code: string; qty: number }>;
}

/**
 * Right after checkout: every line of the new order that stock could not cover is served from an open batch's surplus
 * when one has enough units (oldest batch first) — "mua theo đặt hàng" fills itself from "mua theo đợt".
 * Never throws (checkout must not fail because of this); returns how many lines were allocated.
 */
export function autoAllocateOrderFromBatches(orderId: string): number {
  try {
    const db = getDb();
    const lines = db.prepare("SELECT id, product_id, quantity FROM order_items WHERE order_id = ? AND (purchase_status IS NULL OR purchase_status = 'not_bought') AND batch_id IS NULL").all(orderId) as unknown as Array<{ id: number; product_id: number; quantity: number }>;
    if (!lines.length) return 0;
    let n = 0;
    for (const l of lines) {
      const surplus = db_openSurplus().filter((s) => s.product_id === l.product_id && Number(s.qty) >= l.quantity);
      for (const s of surplus) {
        const r = allocateSurplusToLine(s.batch_id, l.id, `Tự động lấy từ mua theo đợt ${s.code}`);
        if (r.ok) {
          n++;
          break;
        }
      }
    }
    return n;
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
  if (line.batch_id) return { ok: false, message: "Dòng đơn đã nằm trong một đợt gửi." };
  if (statusOf(line.purchase_status) !== "not_bought") return { ok: false, message: "Chỉ lấy hàng dư cho dòng còn “Chưa mua”." };
  const surplus = db.prepare("SELECT id, qty, expiry, source_key FROM stock_purchases WHERE batch_id = ? AND product_id = ? AND lot_id IS NULL").all(batchId, line.product_id) as unknown as Array<{ id: number; qty: number; expiry: string | null; source_key: string }>;
  const plan = planSurplusTake(surplus, line.quantity);
  if (plan.short > 0) {
    const have = surplus.reduce((n, s) => n + s.qty, 0);
    return { ok: false, message: have ? `Hàng dư trong đợt chỉ còn ${have} đv, dòng đơn cần ${line.quantity}.` : "Đợt này không còn hàng dư của sản phẩm đó (hoặc hàng dư đã nhập kho thành lô — tồn kho sẽ tự trừ khi tạo đơn)." };
  }
  const now = new Date().toISOString();
  withTransaction(db, () => {
    for (const [spId, take] of plan.takes) {
      const cur = db.prepare("SELECT qty FROM stock_purchases WHERE id = ?").get(spId) as { qty: number };
      if (cur.qty - take <= 0) db.prepare("DELETE FROM stock_purchases WHERE id = ?").run(spId);
      else db.prepare("UPDATE stock_purchases SET qty = ?, updated_at = ? WHERE id = ?").run(cur.qty - take, now, spId);
    }
    const status = statusOf(batch.status);
    const fromSource = surplus.find((s) => s.id === plan.takes[0]?.[0])?.source_key || batch.source_key;
    db.prepare("UPDATE order_items SET batch_id = ?, source_key = ?, purchase_status = ?, purchase_updated_at = ?, purchase_note = CASE WHEN purchase_note = '' THEN ? ELSE purchase_note END WHERE id = ?").run(batchId, fromSource, status, now, note ?? `Lấy từ hàng dư mua theo đợt ${batch.code}`, itemId);
    db.prepare("UPDATE purchase_batches SET updated_at = ? WHERE id = ?").run(now, batchId);
  });
  return { ok: true, message: `Đã lấy ${line.quantity} đv hàng dư của đợt ${batch.code} cho dòng đơn.` };
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
  // surplus rows: follow the batch (lots are booked at the shop)
  const stock = db.prepare("SELECT id, status, lot_id FROM stock_purchases WHERE batch_id = ?").all(id) as unknown as Array<{ id: number; status: string; lot_id: number | null }>;
  let lots = 0;
  for (const s of stock) {
    if (s.lot_id) continue;
    if (purchaseIndex(statusOf(s.status)) >= purchaseIndex(target)) continue;
    const r = await setStockPurchaseStatus(s.id, target);
    if (r.ok && r.lotId) lots++;
  }
  const boughtAt = batch.bought_at ?? (purchaseIndex(target) >= purchaseIndex("bought") ? today : null);
  const shippedAt = batch.shipped_at ?? (purchaseIndex(target) >= purchaseIndex("shipped_jp_vn") ? today : null);
  db.prepare("UPDATE purchase_batches SET status = ?, bought_at = ?, shipped_at = ?, note = COALESCE(?, note), updated_at = ? WHERE id = ?").run(target, boughtAt, shippedAt, note ?? null, now, id);
  return { ok: true, lines: toRaise.length, lots };
}

/** Delete a batch that has not produced lots yet: lines are unlinked (status kept), surplus rows are dropped. */
export async function deletePurchaseBatch(id: number): Promise<{ ok: boolean; message?: string }> {
  const db = getDb();
  const batch = db.prepare("SELECT id FROM purchase_batches WHERE id = ?").get(id) as { id: number } | undefined;
  if (!batch) return { ok: false, message: "Không tìm thấy đợt gửi." };
  const lotted = db.prepare("SELECT COUNT(*) AS n FROM stock_purchases WHERE batch_id = ? AND lot_id IS NOT NULL").get(id) as { n: number };
  if (Number(lotted.n) > 0) return { ok: false, message: "Đợt đã có hàng dư nhập kho thành lô — không xoá được. Sửa lô trong Kho hàng nếu cần." };
  withTransaction(db, () => {
    db.prepare("UPDATE order_items SET batch_id = NULL WHERE batch_id = ?").run(id);
    db.prepare("DELETE FROM stock_purchases WHERE batch_id = ?").run(id);
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
  db.prepare("UPDATE stock_purchases SET product_id = ?, qty = ?, source_key = ?, expiry = ?, bought_at = ?, unit_cost_jpy = ?, note = ?, updated_at = ? WHERE id = ?").run(
    patch.productId ?? cur.product_id,
    patch.qty && patch.qty > 0 ? patch.qty : cur.qty,
    patch.sourceKey || cur.source_key,
    patch.expiry === undefined ? cur.expiry : patch.expiry,
    patch.boughtAt === undefined ? cur.bought_at : patch.boughtAt,
    patch.unitCostJpy === undefined ? cur.unit_cost_jpy : patch.unitCostJpy,
    patch.note ?? cur.note,
    new Date().toISOString(),
    spId,
  );
  if (patch.status && patch.status !== cur.status) {
    const r = await setStockPurchaseStatus(spId, patch.status);
    if (!r.ok) return { ok: false, message: r.message };
  }
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
export function holdBatchRows(batchId: number, stockIds: number[], itemIds: number[]): { stock: number; lines: number } {
  const db = getDb();
  const batch = db.prepare("SELECT code FROM purchase_batches WHERE id = ?").get(batchId) as { code: string } | undefined;
  if (!batch) return { stock: 0, lines: 0 };
  const now = new Date().toISOString();
  let stock = 0;
  let lines = 0;
  withTransaction(db, () => {
    for (const id of stockIds) {
      const cur = db.prepare("SELECT status, note FROM stock_purchases WHERE id = ? AND batch_id = ? AND lot_id IS NULL").get(id, batchId) as { status: string; note: string } | undefined;
      if (!cur) continue;
      const status = purchaseIndex(statusOf(cur.status)) > purchaseIndex("bought") ? "bought" : cur.status;
      db.prepare("UPDATE stock_purchases SET batch_id = NULL, origin_batch_id = ?, status = ?, note = ?, updated_at = ? WHERE id = ?").run(batchId, status, [`Giữ lại Nhật từ đợt ${batch.code} · chờ đợt sau`, cur.note].filter(Boolean).join(" · "), now, id);
      stock++;
    }
    if (itemIds.length) {
      const ph = itemIds.map(() => "?").join(",");
      lines = Number(db.prepare(`UPDATE order_items SET batch_id = NULL WHERE batch_id = ? AND id IN (${ph})`).run(batchId, ...itemIds).changes);
    }
  });
  return { stock, lines };
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
    moved++;
  }
  if (moved) db.prepare("UPDATE purchase_batches SET updated_at = ? WHERE id = ?").run(now, batchId);
  return { moved, code: batch.code };
}
