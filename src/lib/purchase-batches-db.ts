import "server-only";
import { listPurchaseSources, savePurchaseSource } from "./db";
import { groupUnits } from "./lots-db";
import { todayIso } from "./lots";
import { isPurchaseStatus, type PurchaseStatus, purchaseIndex } from "./purchase";
import { batchCode } from "./purchase-batches";
import { resolvePurchaseSourceKey, UNKNOWN_SOURCE } from "./purchase-sources";
import { createManualReceipt, parseReceiptFiles } from "./receipts-db";
import { getDb, withTransaction } from "./sqlite";
import { createUnitsSync, deleteUnitsSync, editUnitsSync, listUnits, moveUnitsSync, touchSync } from "./units-db";
import type { PurchaseBatch, PurchaseBatchLine } from "@/types/shop";

/**
 * Đợt mua ("đợt") — one buying trip in Japan. A batch owns the units bought in it (stock_units.batch_id, one row per
 * physical item) and lists the order lines planned to be bought in it that still have no unit (order_items.batch_id).
 * Its status is its slowest unit (units-db.syncBatchStatusSync); everything else follows the units.
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
  have: number;
  purchase_status: string | null;
  batch_id: number;
  source_key: string | null;
  sku: string | null;
  thumb: string | null;
  cost_jpy: number | null;
}

const statusOf = (v: string | null): PurchaseStatus => (isPurchaseStatus(v) ? v : "not_bought");

function hydrate(rows: BatchRow[]): PurchaseBatch[] {
  if (!rows.length) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => "?").join(",");
  const units = listUnits(db, { batchIds: ids, withDelivered: true });
  // order lines planned in the batch that still miss units (the rest of them is shown through their units)
  const lines = db
    .prepare(
      `SELECT oi.id, oi.order_id, o.number, o.first_name, o.last_name, oi.product_id, oi.name, oi.quantity, oi.purchase_status, oi.batch_id, oi.source_key, p.sku, p.thumb, p.cost_jpy,
              (SELECT COUNT(*) FROM stock_units u WHERE u.order_item_id = oi.id AND u.removed IS NULL) AS have
       FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.batch_id IN (${ph}) AND o.status IN ('pending','processing') ORDER BY o.number, oi.id`,
    )
    .all(...ids) as unknown as LineRow[];
  const toLine = (l: LineRow): PurchaseBatchLine => ({ itemId: l.id, orderId: l.order_id, orderNumber: l.number, customerName: `${l.last_name} ${l.first_name}`.trim(), productId: l.product_id, productName: l.name, productSku: l.sku, productThumb: l.thumb ?? "", quantity: l.quantity, need: Math.max(0, l.quantity - Number(l.have)), purchaseStatus: statusOf(l.purchase_status), costJpy: l.cost_jpy, sourceKey: l.source_key ?? "" });
  const bills = db
    .prepare(`SELECT r.id, r.code, r.bought_at, r.source_key, r.order_ref, r.total_jpy, r.status, r.files, r.batch_id, (SELECT COUNT(*) FROM purchase_receipt_items i WHERE i.receipt_id = r.id) AS items, (SELECT COUNT(*) FROM stock_units u WHERE u.receipt_id = r.id AND u.removed IS NULL) AS units FROM purchase_receipts r WHERE r.batch_id IN (${ph}) ORDER BY r.bought_at DESC, r.id DESC`)
    .all(...ids) as unknown as Array<{ id: number; code: string; bought_at: string; source_key: string; order_ref: string | null; total_jpy: number | null; status: string; files: string | null; batch_id: number; items: number; units: number }>;
  return rows.map((r) => {
    const mine = units.filter((u) => u.batchId === r.id);
    return {
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
      units: mine,
      groups: groupUnits(mine),
      needs: lines.filter((l) => l.batch_id === r.id && Number(l.have) < l.quantity).map(toLine),
      receipts: bills.filter((x) => x.batch_id === r.id).map((x) => ({ id: x.id, code: x.code, boughtAt: x.bought_at, sourceKey: x.source_key, orderRef: x.order_ref ?? "", totalJpy: x.total_jpy, status: x.status, items: Number(x.items), units: Number(x.units), files: parseReceiptFiles(x.files) })),
    };
  });
}

/** Open batches first (newest on top); `includeDone` adds the ones already at the shop. */
export interface BatchSearch {
  includeDone?: boolean;
  /** Only batches already at the VN shop. */
  onlyDone?: boolean;
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
  if (o.onlyDone) where.push("status = 'at_shop'");
  else if (!o.includeDone) where.push("status <> 'at_shop'");
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

/** Order lines planned to be bought in this batch (lines already in another batch are skipped). */
export function addLinesToBatch(batchId: number, itemIds: number[]): { added: number; code: string } | null {
  const db = getDb();
  const batch = db.prepare("SELECT * FROM purchase_batches WHERE id = ?").get(batchId) as BatchRow | undefined;
  if (!batch || !itemIds.length) return null;
  let added = 0;
  withTransaction(db, () => {
    for (const itemId of itemIds) {
      const line = db.prepare("SELECT id, batch_id FROM order_items WHERE id = ?").get(itemId) as { id: number; batch_id: number | null } | undefined;
      if (!line || (line.batch_id && line.batch_id !== batchId)) continue;
      db.prepare("UPDATE order_items SET batch_id = ?, source_key = CASE WHEN COALESCE(source_key, '') = '' THEN ? ELSE source_key END WHERE id = ?").run(batchId, batch.source_key, itemId);
      added++;
    }
    db.prepare("UPDATE purchase_batches SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), batchId);
  });
  return { added, code: batch.code };
}

/** Take a planned line out of its batch (its units, if any, stay where they are). */
export function removeLineFromBatch(itemId: number): boolean {
  const r = getDb().prepare("UPDATE order_items SET batch_id = NULL WHERE id = ? AND batch_id IS NOT NULL").run(itemId);
  return Number(r.changes) > 0;
}

/**
 * A product bought in this batch: `qty` units (codes H…) on the given bill. Waiting order lines of that product are
 * served from them automatically (oldest order first); the rest is stock.
 */
export async function addProductToBatch(batchId: number, input: { productId: number; qty: number; status?: PurchaseStatus; expiry: string | null; boughtAt: string | null; unitCostJpy: number | null; note: string; store?: string; sourceKey?: string; receiptId?: number | null }): Promise<{ code: string; covered: number; orderUnits: number; stockUnits: number; codes: string[] } | null> {
  const db = getDb();
  const batch = db.prepare("SELECT * FROM purchase_batches WHERE id = ?").get(batchId) as BatchRow | undefined;
  if (!batch) return null;
  const ids = withTransaction(db, () => {
    const made = createUnitsSync(db, {
      productId: input.productId,
      qty: input.qty,
      status: input.status ?? "bought",
      receiptId: input.receiptId ?? null,
      batchId,
      sourceKey: input.sourceKey || batch.source_key,
      store: input.store ?? "",
      boughtAt: input.boughtAt ?? batch.bought_at ?? todayIso(),
      expiry: input.expiry,
      unitCostJpy: input.unitCostJpy,
      origin: "bill",
      note: input.note,
    });
    db.prepare("UPDATE purchase_batches SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), batchId);
    touchSync(db, { unitIds: made, batchIds: [batchId] });
    return made;
  });
  const res = listUnits(db, { ids });
  const held = res.filter((u) => u.itemId);
  return { code: batch.code, covered: new Set(held.map((u) => u.itemId)).size, orderUnits: held.length, stockUnits: res.length - held.length, codes: res.map((u) => u.code) };
}

/** Every unit of the batch moves to `status` (units already with the customer stay). */
export async function setPurchaseBatchStatus(id: number, status: PurchaseStatus): Promise<{ ok: boolean; lines: number; lots: number; message?: string }> {
  const db = getDb();
  const batch = db.prepare("SELECT id FROM purchase_batches WHERE id = ?").get(id) as { id: number } | undefined;
  if (!batch) return { ok: false, lines: 0, lots: 0, message: "Không tìm thấy đợt." };
  const ids = (db.prepare("SELECT id FROM stock_units WHERE batch_id = ? AND removed IS NULL AND status NOT IN ('shipped_to_customer','delivered')").all(id) as Array<{ id: number }>).map((r) => r.id);
  const n = withTransaction(db, () => {
    const k = moveUnitsSync(db, ids, status, { note: "Cả đợt" });
    db.prepare("UPDATE purchase_batches SET status = ?, updated_at = ? WHERE id = ?").run(purchaseIndex(status) > purchaseIndex("at_shop") ? "at_shop" : status, new Date().toISOString(), id);
    touchSync(db, { unitIds: ids, batchIds: [id] });
    return k;
  });
  return { ok: true, lines: 0, lots: n };
}

/** Delete a batch whose goods have not left Kho Nhật: units leave the batch (they stay), planned lines are unlinked. */
export async function deletePurchaseBatch(id: number): Promise<{ ok: boolean; message?: string }> {
  const db = getDb();
  const batch = db.prepare("SELECT id FROM purchase_batches WHERE id = ?").get(id) as { id: number } | undefined;
  if (!batch) return { ok: false, message: "Không tìm thấy đợt." };
  const far = db.prepare("SELECT 1 FROM stock_units WHERE batch_id = ? AND removed IS NULL AND status NOT IN ('not_bought','ordered','bought') LIMIT 1").get(id);
  if (far) return { ok: false, message: "Hàng của đợt đã rời Kho Nhật — không xoá được." };
  withTransaction(db, () => {
    const ids = (db.prepare("SELECT id FROM stock_units WHERE batch_id = ?").all(id) as Array<{ id: number }>).map((r) => r.id);
    db.prepare("UPDATE order_items SET batch_id = NULL WHERE batch_id = ?").run(id);
    db.prepare("UPDATE stock_units SET batch_id = NULL WHERE batch_id = ?").run(id);
    db.prepare("UPDATE purchase_receipts SET batch_id = NULL WHERE batch_id = ?").run(id);
    db.prepare("DELETE FROM purchase_batches WHERE id = ?").run(id);
    touchSync(db, { unitIds: ids });
  });
  return { ok: true };
}

/** Units into a batch (e.g. stock kept in Japan joins the next trip). */
export function moveUnitsToBatch(unitIds: number[], batchId: number): number {
  const db = getDb();
  return withTransaction(db, () => {
    const n = editUnitsSync(db, unitIds, { batchId });
    touchSync(db, { unitIds, batchIds: [batchId] });
    return n;
  });
}

/** Ticked units belong to this bill (paper trail). */
export function assignReceiptToUnits(receiptId: number | null, unitIds: number[]): number {
  const db = getDb();
  if (receiptId && !db.prepare("SELECT 1 FROM purchase_receipts WHERE id = ?").get(receiptId)) return 0;
  return withTransaction(db, () => {
    const n = editUnitsSync(db, unitIds, { receiptId });
    touchSync(db, { unitIds });
    return n;
  });
}

/** The bill of these units, created on the spot when they have none (own code or PM-…), so photos can attach. */
export function ensureUnitsReceipt(unitIds: number[], opts: { code?: string } = {}): number | null {
  const db = getDb();
  if (!unitIds.length) return null;
  const u = db.prepare("SELECT receipt_id, batch_id, source_key, bought_at FROM stock_units WHERE id = ?").get(unitIds[0]) as { receipt_id: number | null; batch_id: number | null; source_key: string; bought_at: string | null } | undefined;
  if (!u) return null;
  const code = (opts.code ?? "").trim();
  if (u.receipt_id && !code) return u.receipt_id;
  if (u.receipt_id && code) {
    const cur = db.prepare("SELECT code FROM purchase_receipts WHERE id = ?").get(u.receipt_id) as { code: string } | undefined;
    if (cur?.code === code) return u.receipt_id;
  }
  const rc = createManualReceipt({ sourceKey: u.source_key, boughtAt: u.bought_at ?? todayIso(), batchId: u.batch_id, code: code || undefined });
  if (!rc) return null;
  assignReceiptToUnits(rc.id, unitIds);
  return rc.id;
}

/** Delete units entered by mistake (not those already with the customer). */
export function deleteUnits(unitIds: number[]): { deleted: number; refused: number } {
  const db = getDb();
  return withTransaction(db, () => {
    const products = (db.prepare(`SELECT DISTINCT product_id FROM stock_units WHERE id IN (${unitIds.map(() => "?").join(",") || "NULL"})`).all(...unitIds) as Array<{ product_id: number }>).map((r) => r.product_id);
    const items = (db.prepare(`SELECT DISTINCT order_item_id FROM stock_units WHERE order_item_id IS NOT NULL AND id IN (${unitIds.map(() => "?").join(",") || "NULL"})`).all(...unitIds) as Array<{ order_item_id: number }>).map((r) => r.order_item_id);
    const batches = (db.prepare(`SELECT DISTINCT batch_id FROM stock_units WHERE batch_id IS NOT NULL AND id IN (${unitIds.map(() => "?").join(",") || "NULL"})`).all(...unitIds) as Array<{ batch_id: number }>).map((r) => r.batch_id);
    const r = deleteUnitsSync(db, unitIds);
    touchSync(db, { productIds: products, itemIds: items, batchIds: batches });
    return r;
  });
}

/**
 * "Làm lại từ đầu": wipes every purchasing record — batches, bills (+ photos), units and their history, packing runs —
 * and puts the open orders' lines back to "Cần mua". Products whose stock came from units go back to "hàng order"
 * (stock NULL). Owner only; irreversible.
 */
export function resetPurchasingData(): { batches: number; slips: number; receipts: number; lots: number; shipments: number; lines: number; files: string[] } {
  const db = getDb();
  const now = new Date().toISOString();
  const files = (db.prepare("SELECT files FROM purchase_receipts").all() as Array<{ files: string | null }>).flatMap((r) => parseReceiptFiles(r.files).map((f) => f.path));
  const count = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n);
  const out = { batches: count("SELECT COUNT(*) AS n FROM purchase_batches"), slips: 0, receipts: count("SELECT COUNT(*) AS n FROM purchase_receipts"), lots: count("SELECT COUNT(*) AS n FROM stock_units"), shipments: count("SELECT COUNT(*) AS n FROM shipments"), lines: 0, files };
  withTransaction(db, () => {
    const products = (db.prepare("SELECT DISTINCT product_id FROM stock_units").all() as Array<{ product_id: number }>).map((r) => r.product_id);
    db.prepare("DELETE FROM stock_unit_events").run();
    db.prepare("DELETE FROM stock_units").run();
    db.prepare("DELETE FROM purchase_receipt_items").run();
    db.prepare("DELETE FROM purchase_receipts").run();
    db.prepare("DELETE FROM purchase_batches").run();
    db.prepare("DELETE FROM shipments").run();
    out.lines = Number(db.prepare("UPDATE order_items SET purchase_status = 'not_bought', purchase_note = '', batch_id = NULL, receipt_id = NULL, source_key = '', purchase_expiry = NULL, purchase_bought_at = NULL, purchase_cost_jpy = NULL, auto_hold = 1, purchase_updated_at = ? WHERE order_id IN (SELECT id FROM orders WHERE status IN ('pending','processing'))").run(now).changes);
    if (products.length) db.prepare(`UPDATE products SET stock = NULL, updated_at = ? WHERE id IN (${products.map(() => "?").join(",")})`).run(now, ...products);
  });
  return out;
}

/**
 * "Nhập nhanh nhiều bill": one bill per line — `mã | cửa hàng | nội dung | tổng` (tabs or | as separators); a line
 * starting with "@" names the source for the lines below ("@ OS Drug Store"). The date comes from a code like
 * BILL-260927-1200 (yymmdd), else the batch's bought date. Unknown sources are created as stores.
 */
export async function importBillsFromText(batchId: number, text: string): Promise<{ created: number; skipped: string[]; sources: string[] }> {
  const db = getDb();
  const batch = db.prepare("SELECT id, code, source_key, bought_at FROM purchase_batches WHERE id = ?").get(batchId) as { id: number; code: string; source_key: string; bought_at: string | null } | undefined;
  if (!batch) return { created: 0, skipped: ["Không tìm thấy đợt."], sources: [] };
  const sources = await listPurchaseSources(true);
  let sourceKey = batch.source_key || UNKNOWN_SOURCE;
  const created: string[] = [];
  const skipped: string[] = [];
  const newSources: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^\|\s*|\s*\|$/g, "");
    if (!line) continue;
    if (line.startsWith("@")) {
      const name = line.slice(1).trim().replace(/\s*\(\d+\s*bill\)\s*$/i, "");
      if (!name) continue;
      const hit = resolvePurchaseSourceKey(name, sources) ?? sources.find((s) => name.toLowerCase().includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(name.toLowerCase()))?.key ?? null;
      if (hit) sourceKey = hit;
      else {
        const s = await savePurchaseSource({ name, kind: "store", url: "", address: "", branch: "", note: "" });
        sources.push(s);
        newSources.push(s.name);
        sourceKey = s.key;
      }
      continue;
    }
    if (/^(mã bill|ma bill|code)\b/i.test(line)) continue; // header row
    const cells = line.split(/\t|\s*\|\s*/).map((c) => c.trim()).filter((c, i, arr) => !(c === "" && (i === 0 || i === arr.length - 1)));
    if (cells.length < 2) {
      skipped.push(line.slice(0, 40));
      continue;
    }
    const code = cells[0].slice(0, 60);
    if (!code) continue;
    const last = cells[cells.length - 1];
    const totalMatch = last.replace(/,/g, "").match(/(\d+)/);
    const totalJpy = totalMatch ? Number.parseInt(totalMatch[1], 10) : null;
    const payment = totalMatch ? last.replace(/[¥￥]?[\d,]+/, "").trim() : "";
    const middle = cells.slice(1, totalMatch ? -1 : undefined);
    const store = middle.length > 1 ? middle[0] : "";
    const content = middle.length > 1 ? middle.slice(1).join(" · ") : (middle[0] ?? "");
    const m = code.match(/-(\d{2})(\d{2})(\d{2})-/);
    const boughtAt = m ? `20${m[1]}-${m[2]}-${m[3]}` : (batch.bought_at ?? new Date().toISOString().slice(0, 10));
    if (db.prepare("SELECT 1 FROM purchase_receipts WHERE code = ?").get(code)) {
      skipped.push(`${code} (đã có)`);
      continue;
    }
    const rc = createManualReceipt({ code, sourceKey, boughtAt, orderRef: store.slice(0, 80), note: [content, payment].filter(Boolean).join(" · ").slice(0, 300), batchId });
    if (!rc) {
      skipped.push(code);
      continue;
    }
    if (totalJpy !== null) db.prepare("UPDATE purchase_receipts SET total_jpy = ? WHERE id = ?").run(totalJpy, rc.id);
    created.push(code);
  }
  return { created: created.length, skipped, sources: newSources };
}

/** Id of the bill with this code (created in the batch when it does not exist yet); blank code → null. */
export function receiptIdForCode(code: string, batchId: number | null): number | null {
  const c = code.trim().slice(0, 60);
  if (!c) return null;
  const db = getDb();
  const ex = db.prepare("SELECT id FROM purchase_receipts WHERE code = ?").get(c) as { id: number } | undefined;
  if (ex) return ex.id;
  const batch = batchId ? (db.prepare("SELECT source_key, bought_at FROM purchase_batches WHERE id = ?").get(batchId) as { source_key: string; bought_at: string | null } | undefined) : undefined;
  const m = c.match(/(\d{2})(\d{2})(\d{2})/);
  const boughtAt = m ? `20${m[1]}-${m[2]}-${m[3]}` : (batch?.bought_at ?? new Date().toISOString().slice(0, 10));
  return createManualReceipt({ code: c, sourceKey: batch?.source_key ?? UNKNOWN_SOURCE, boughtAt, batchId })?.id ?? null;
}
