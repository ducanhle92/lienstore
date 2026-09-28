import "server-only";
import { purchaseIndex, type PurchaseStatus } from "./purchase";
import { createUnitsSync, moveUnitsSync, touchSync } from "./units-db";
import { UNKNOWN_SOURCE } from "./purchase-sources";
import { type BillItem, type MatchCandidate, matchBillItem, parseBillText, receiptCode, type ReceiptStatus } from "./receipts";
import { getDb, withTransaction } from "./sqlite";

/** Phiếu mua hàng — DB side (see lib/receipts.ts for the pure parsing / matching / code helpers). */
export interface ReceiptItem {
  id: number;
  receiptId: number;
  productId: number | null;
  productName: string;
  productThumb: string;
  rawName: string;
  qty: number;
  unitJpy: number | null;
  asin: string;
  matchScore: number | null;
}
export interface ReceiptFile {
  /** Storage path relative to the uploads dir. */
  path: string;
  url: string;
  name: string;
  mime: string;
}

export interface Receipt {
  id: number;
  code: string;
  /** Shipment batch the bill was booked into (Mua theo đợt), if any. */
  batchId: number | null;
  batchCode: string;
  sourceKey: string;
  boughtAt: string;
  orderRef: string;
  totalJpy: number | null;
  shippedAt: string | null;
  tracking: string;
  note: string;
  status: ReceiptStatus;
  createdAt: string;
  updatedAt: string;
  /** Photos / PDFs of the bill (uploads). */
  files: ReceiptFile[];
  items: ReceiptItem[];
  /** Order lines linked to this receipt: order number × qty × status. */
  lines: Array<{ itemId: number; orderId: string; orderNumber: number; productName: string; quantity: number; purchaseStatus: string }>;
  /** Units of this bill no order holds (stock). */
  stockUnits: number;
  /** Every unit bought on this bill. */
  units: number;
}

interface ReceiptRow {
  id: number;
  code: string;
  batch_id: number | null;
  batch_code: string | null;
  source_key: string;
  bought_at: string;
  order_ref: string;
  total_jpy: number | null;
  shipped_at: string | null;
  tracking: string;
  note: string;
  status: string;
  created_at: string;
  updated_at: string;
  files: string | null;
}
export function parseReceiptFiles(raw: string | null): ReceiptFile[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((f) => f && typeof f.path === "string" && typeof f.url === "string").map((f) => ({ path: String(f.path), url: String(f.url), name: String(f.name ?? ""), mime: String(f.mime ?? "") })) : [];
  } catch {
    return [];
  }
}
interface ItemRow {
  id: number;
  receipt_id: number;
  product_id: number | null;
  raw_name: string;
  qty: number;
  unit_jpy: number | null;
  asin: string;
  match_score: number | null;
  pname: string | null;
  pthumb: string | null;
}
const isStatus = (v: string): v is ReceiptStatus => v === "draft" || v === "bought" || v === "shipped";

function hydrate(rows: ReceiptRow[]): Receipt[] {
  if (!rows.length) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => "?").join(",");
  const items = db.prepare(`SELECT ri.*, p.name AS pname, p.thumb AS pthumb FROM purchase_receipt_items ri LEFT JOIN products p ON p.id = ri.product_id WHERE ri.receipt_id IN (${ph}) ORDER BY ri.id`).all(...ids) as unknown as ItemRow[];
  const lines = db.prepare(`SELECT oi.id, oi.order_id, o.number, oi.name, oi.quantity, oi.purchase_status, oi.receipt_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.receipt_id IN (${ph}) ORDER BY o.number, oi.id`).all(...ids) as unknown as Array<{ id: number; order_id: string; number: number; name: string; quantity: number; purchase_status: string; receipt_id: number }>;
  const stock = db.prepare(`SELECT receipt_id, SUM(order_item_id IS NULL) AS n, COUNT(*) AS total FROM stock_units WHERE removed IS NULL AND receipt_id IN (${ph}) GROUP BY receipt_id`).all(...ids) as unknown as Array<{ receipt_id: number; n: number; total: number }>;
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    batchId: r.batch_id ?? null,
    batchCode: r.batch_code ?? "",
    sourceKey: r.source_key,
    boughtAt: r.bought_at,
    orderRef: r.order_ref ?? "",
    totalJpy: r.total_jpy,
    shippedAt: r.shipped_at,
    tracking: r.tracking ?? "",
    note: r.note ?? "",
    status: isStatus(r.status) ? r.status : "bought",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    files: parseReceiptFiles(r.files),
    items: items.filter((i) => i.receipt_id === r.id).map((i) => ({ id: i.id, receiptId: i.receipt_id, productId: i.product_id, productName: i.pname ?? "", productThumb: i.pthumb ?? "", rawName: i.raw_name ?? "", qty: i.qty, unitJpy: i.unit_jpy, asin: i.asin ?? "", matchScore: i.match_score })),
    lines: lines.filter((l) => l.receipt_id === r.id).map((l) => ({ itemId: l.id, orderId: l.order_id, orderNumber: l.number, productName: l.name, quantity: l.quantity, purchaseStatus: l.purchase_status })),
    stockUnits: Number(stock.find((s) => s.receipt_id === r.id)?.n ?? 0),
    units: Number(stock.find((s) => s.receipt_id === r.id)?.total ?? 0),
  }));
}

const RECEIPT_SELECT = "SELECT r.*, (SELECT b.code FROM purchase_batches b WHERE b.id = r.batch_id) AS batch_code FROM purchase_receipts r";

export function listReceipts(limit = 60): Receipt[] {
  return hydrate(getDb().prepare(`${RECEIPT_SELECT} ORDER BY CASE r.status WHEN 'draft' THEN 0 ELSE 1 END, r.bought_at DESC, r.id DESC LIMIT ?`).all(limit) as unknown as ReceiptRow[]);
}
export function getReceipt(id: number): Receipt | null {
  const r = getDb().prepare(`${RECEIPT_SELECT} WHERE r.id = ?`).get(id) as ReceiptRow | undefined;
  return r ? hydrate([r])[0] : null;
}

function nextCode(boughtAt: string): string {
  const db = getDb();
  const prefix = receiptCode(boughtAt, 1).slice(0, -3);
  const n = (db.prepare("SELECT COUNT(*) AS n FROM purchase_receipts WHERE code LIKE ?").get(`${prefix}-%`) as { n: number }).n;
  let seq = Number(n) + 1;
  while (db.prepare("SELECT 1 FROM purchase_receipts WHERE code = ?").get(receiptCode(boughtAt, seq))) seq++;
  return receiptCode(boughtAt, seq);
}

/** Lines the admin ticked → one receipt (items grouped per product); the lines become "Đã mua" and remember the source. */
export function createReceiptFromLines(itemIds: number[], input: { sourceKey: string; boughtAt: string; orderRef: string; note: string }): Receipt | null {
  const db = getDb();
  if (!itemIds.length) return null;
  const now = new Date().toISOString();
  const ph = itemIds.map(() => "?").join(",");
  const rows = db.prepare(`SELECT oi.id, oi.product_id, oi.name, oi.quantity, oi.purchase_status, p.cost_jpy FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.id IN (${ph})`).all(...itemIds) as unknown as Array<{ id: number; product_id: number; name: string; quantity: number; purchase_status: string | null; cost_jpy: number | null }>;
  if (!rows.length) return null;
  const id = withTransaction(db, () => {
    const code = nextCode(input.boughtAt);
    const r = db.prepare("INSERT INTO purchase_receipts (code, source_key, bought_at, order_ref, total_jpy, shipped_at, tracking, note, status, raw_text, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, '', ?, 'bought', '', ?, ?)").run(code, input.sourceKey || UNKNOWN_SOURCE, input.boughtAt, input.orderRef, input.note, now, now);
    const rid = Number(r.lastInsertRowid);
    const byProduct = new Map<number, { name: string; qty: number; jpy: number | null }>();
    for (const l of rows) {
      const g = byProduct.get(l.product_id) ?? { name: l.name, qty: 0, jpy: l.cost_jpy };
      g.qty += l.quantity;
      byProduct.set(l.product_id, g);
    }
    const ins = db.prepare("INSERT INTO purchase_receipt_items (receipt_id, product_id, raw_name, qty, unit_jpy, asin, match_score) VALUES (?, ?, ?, ?, ?, '', 1)");
    for (const [pid, g] of byProduct) ins.run(rid, pid, g.name, g.qty, g.jpy);
    // each line was bought for its customer: it gets its own units (codes H…) on this bill, pinned to it
    const touched: number[] = [];
    for (const l of rows) {
      const have = (db.prepare("SELECT id FROM stock_units WHERE order_item_id = ? AND removed IS NULL").all(l.id) as Array<{ id: number }>).map((r) => r.id);
      const status: PurchaseStatus = l.purchase_status && purchaseIndex(l.purchase_status as PurchaseStatus) > purchaseIndex("bought") ? (l.purchase_status as PurchaseStatus) : "bought";
      if (have.length) {
        db.prepare(`UPDATE stock_units SET receipt_id = ?, source_key = ?, updated_at = ? WHERE id IN (${have.map(() => "?").join(",")})`).run(rid, input.sourceKey || UNKNOWN_SOURCE, now, ...have);
        moveUnitsSync(db, have, status, { raiseOnly: true, note: `bill ${code}` });
      }
      const made = l.quantity > have.length ? createUnitsSync(db, { productId: l.product_id, qty: l.quantity - have.length, status, itemId: l.id, receiptId: rid, sourceKey: input.sourceKey || UNKNOWN_SOURCE, boughtAt: input.boughtAt, unitCostJpy: l.cost_jpy, origin: "order", note: `bill ${code}` }) : [];
      touched.push(...have, ...made);
    }
    db.prepare("UPDATE purchase_receipts SET total_jpy = (SELECT SUM(COALESCE(unit_jpy, 0) * qty) FROM purchase_receipt_items WHERE receipt_id = ?) WHERE id = ?").run(rid, rid);
    touchSync(db, { unitIds: touched, itemIds: rows.map((l) => l.id) });
    return rid;
  });
  return getReceipt(id);
}

/** Candidates for matching bill lines: every product with its known purchase URLs. */
export function matchCandidates(): MatchCandidate[] {
  const db = getDb();
  const products = db.prepare("SELECT id, name, name_ja, supplier_url, cost_url, description, tags FROM products").all() as unknown as Array<{ id: number; name: string; name_ja: string | null; supplier_url: string | null; cost_url: string | null; description: string | null; tags: string | null }>;
  // JAN codes live in the description ("JAN 4909978200879") and the tags — drugstore receipts print them under each line
  const jansOf = (p: { description: string | null; tags: string | null }) => Array.from(new Set(`${p.description ?? ""} ${p.tags ?? ""}`.match(/(?<![\d-])\d{13}(?![\d-])/g) ?? []));
  const urls = db.prepare("SELECT product_id, url FROM product_cost_sources WHERE url <> ''").all() as unknown as Array<{ product_id: number; url: string }>;
  const byP = new Map<number, string[]>();
  for (const u of urls) byP.set(u.product_id, [...(byP.get(u.product_id) ?? []), u.url]);
  return products.map((p) => ({ id: p.id, name: p.name, nameJa: p.name_ja ?? "", urls: [...(byP.get(p.id) ?? []), p.supplier_url ?? "", p.cost_url ?? ""].filter(Boolean), jans: jansOf(p) }));
}

/** Pasted bill → draft receipt with parsed lines and suggested products (the admin confirms / corrects, then "Xác nhận"). */
export function createDraftFromBill(text: string, input: { sourceKey: string; boughtAt: string; orderRef: string; batchId?: number | null }): { receipt: Receipt; parsedItems: number } | null {
  const parsed = parseBillText(text);
  if (!parsed.items.length) return null;
  const db = getDb();
  const now = new Date().toISOString();
  const boughtAt = input.boughtAt || parsed.boughtAt || now.slice(0, 10);
  const cands = matchCandidates();
  const id = withTransaction(db, () => {
    const code = nextCode(boughtAt);
    const r = db.prepare("INSERT INTO purchase_receipts (code, source_key, bought_at, order_ref, total_jpy, shipped_at, tracking, note, status, raw_text, batch_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, '', '', 'draft', ?, ?, ?, ?)").run(code, input.sourceKey || UNKNOWN_SOURCE, boughtAt, input.orderRef || parsed.orderRef, parsed.items.reduce((s, i) => s + (i.unitJpy ?? 0) * i.qty, 0) || null, text.slice(0, 20000), input.batchId ?? null, now, now);
    const rid = Number(r.lastInsertRowid);
    const ins = db.prepare("INSERT INTO purchase_receipt_items (receipt_id, product_id, raw_name, qty, unit_jpy, asin, match_score) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const it of parsed.items) {
      const m = matchBillItem(it, cands);
      ins.run(rid, m?.id ?? null, it.name.slice(0, 200), it.qty, it.unitJpy, it.asin ?? "", m?.score ?? null);
    }
    return rid;
  });
  const receipt = getReceipt(id);
  return receipt ? { receipt, parsedItems: parsed.items.length } : null;
}

/**
 * Confirm a draft: each item (with its confirmed product) covers open order lines of that product oldest-first — those
 * lines become "Đã mua" on this receipt — and whatever is left over becomes a warehouse-lot purchase ("mua lưu kho",
 * bought, bound for the Japan warehouse) on the same receipt.
 */
export async function confirmReceipt(id: number, productByItem: Record<number, number | null>, opts: { received?: boolean } = {}): Promise<{ linesCovered: number; stockUnits: number } | null> {
  const db = getDb();
  const receipt = getReceipt(id);
  if (!receipt || receipt.status !== "draft") return null;
  const now = new Date().toISOString();
  let linesCovered = 0;
  let stockUnits = 0;
  // booked into a shipment batch → the stock rows join the batch and take its status (at least "bought")
  const batch = receipt.batchId ? (db.prepare("SELECT id, code, status FROM purchase_batches WHERE id = ?").get(receipt.batchId) as { id: number; code: string; status: string } | undefined) : undefined;
  // in hand (counter purchase) → lot at Kho Nhật now (or wherever the batch already is); ordered online → slip until "Đã nhận"
  const received = opts.received !== false;
  const batchStatus: PurchaseStatus = !received ? "ordered" : batch && purchaseIndex((batch.status as PurchaseStatus) || "not_bought") > purchaseIndex("bought") ? (batch.status as PurchaseStatus) : "bought";
  const bought: Array<{ productId: number; qty: number; unitJpy: number | null }> = [];
  withTransaction(db, () => {
    const setItem = db.prepare("UPDATE purchase_receipt_items SET product_id = ? WHERE id = ?");
    for (const it of receipt.items) {
      const pid = productByItem[it.id] === undefined ? it.productId : productByItem[it.id];
      setItem.run(pid, it.id);
      if (pid) bought.push({ productId: pid, qty: it.qty, unitJpy: it.unitJpy });
    }
    db.prepare("UPDATE purchase_receipts SET status = 'bought', updated_at = ? WHERE id = ?").run(now, id);
    if (batch) db.prepare("UPDATE purchase_batches SET updated_at = ? WHERE id = ?").run(now, batch.id);
  });
  // every bill line becomes its units (codes H…) on this bill; waiting order lines are served from them (oldest order first)
  const made = withTransaction(db, () => {
    const ids: number[] = [];
    for (const l of bought) ids.push(...createUnitsSync(db, { productId: l.productId, qty: l.qty, status: batchStatus, receiptId: id, batchId: batch?.id ?? null, sourceKey: receipt.sourceKey, boughtAt: receipt.boughtAt, unitCostJpy: l.unitJpy, origin: "bill", note: `bill ${receipt.code}` }));
    touchSync(db, { unitIds: ids });
    return ids;
  });
  if (made.length) {
    const r = db.prepare(`SELECT COUNT(DISTINCT order_item_id) AS lines, SUM(order_item_id IS NULL) AS free FROM stock_units WHERE id IN (${made.map(() => "?").join(",")})`).get(...made) as { lines: number; free: number };
    linesCovered = Number(r.lines);
    stockUnits = Number(r.free ?? 0);
  }
  return { linesCovered, stockUnits };
}

/** Ship-out date / tracking / note; a ship-out date moves every linked line and lot purchase at least to "Tới ĐVVC Nhật". */
export function updateReceipt(id: number, patch: { shippedAt?: string | null; tracking?: string; note?: string; orderRef?: string; boughtAt?: string; sourceKey?: string }): boolean {
  const db = getDb();
  const cur = getReceipt(id);
  if (!cur) return false;
  const now = new Date().toISOString();
  const shippedAt = patch.shippedAt === undefined ? cur.shippedAt : patch.shippedAt;
  const status: ReceiptStatus = cur.status === "draft" ? "draft" : shippedAt ? "shipped" : "bought";
  withTransaction(db, () => {
    db.prepare("UPDATE purchase_receipts SET shipped_at = ?, tracking = ?, note = ?, order_ref = ?, bought_at = ?, source_key = ?, status = ?, updated_at = ? WHERE id = ?").run(shippedAt, patch.tracking ?? cur.tracking, patch.note ?? cur.note, patch.orderRef ?? cur.orderRef, patch.boughtAt ?? cur.boughtAt, patch.sourceKey ?? cur.sourceKey, status, now, id);
    if (shippedAt && cur.status !== "draft") {
      // the bill's goods were sent straight to the carrier: its units still at / before Kho Nhật move there
      const ids = (db.prepare("SELECT id FROM stock_units WHERE receipt_id = ? AND removed IS NULL AND status IN ('not_bought','ordered','bought') AND shipment_id IS NULL").all(id) as Array<{ id: number }>).map((r) => r.id);
      moveUnitsSync(db, ids, "to_carrier_jp", { note: `bill ${cur.code} gửi ĐVVC` });
      touchSync(db, { unitIds: ids });
    }
    if (patch.tracking !== undefined && patch.tracking) db.prepare("UPDATE order_items SET purchase_note = CASE WHEN purchase_note = '' THEN ? ELSE purchase_note END WHERE receipt_id = ?").run(patch.tracking, id);
  });
  return true;
}

/** Delete a receipt: lines and lot purchases are unlinked (their status is kept); drafts vanish entirely. */
export function deleteReceipt(id: number): boolean {
  const db = getDb();
  return withTransaction(db, () => {
    const cur = db.prepare("SELECT id FROM purchase_receipts WHERE id = ?").get(id);
    if (!cur) return false;
    db.prepare("UPDATE order_items SET receipt_id = NULL WHERE receipt_id = ?").run(id);
    db.prepare("UPDATE stock_units SET receipt_id = NULL WHERE receipt_id = ?").run(id);
    db.prepare("DELETE FROM purchase_receipts WHERE id = ?").run(id);
    return true;
  });
}

export type { BillItem };

/** Attach uploaded bill photos / PDFs to a receipt. */
export function addReceiptFiles(id: number, files: ReceiptFile[]): boolean {
  const db = getDb();
  const cur = db.prepare("SELECT files FROM purchase_receipts WHERE id = ?").get(id) as { files: string | null } | undefined;
  if (!cur) return false;
  const next = [...parseReceiptFiles(cur.files), ...files];
  db.prepare("UPDATE purchase_receipts SET files = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), new Date().toISOString(), id);
  return true;
}
/** Detach one file (by storage path); the caller deletes the upload. */
export function removeReceiptFile(id: number, path: string): ReceiptFile | null {
  const db = getDb();
  const cur = db.prepare("SELECT files FROM purchase_receipts WHERE id = ?").get(id) as { files: string | null } | undefined;
  if (!cur) return null;
  const all = parseReceiptFiles(cur.files);
  const hit = all.find((f) => f.path === path) ?? null;
  if (!hit) return null;
  db.prepare("UPDATE purchase_receipts SET files = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(all.filter((f) => f.path !== path)), new Date().toISOString(), id);
  return hit;
}

/** An empty bill (no parsed lines) — the paper trail for photos and for rows added by hand in a batch. */
export function createManualReceipt(input: { sourceKey: string; boughtAt: string; orderRef?: string; note?: string; batchId?: number | null; /** the shop's own bill number; blank = PM-… generated */ code?: string }): Receipt | null {
  const db = getDb();
  const now = new Date().toISOString();
  const boughtAt = input.boughtAt || now.slice(0, 10);
  const custom = (input.code ?? "").trim().slice(0, 60);
  if (custom) {
    const ex = db.prepare("SELECT id FROM purchase_receipts WHERE code = ?").get(custom) as { id: number } | undefined;
    if (ex) return getReceipt(ex.id);
  }
  const id = withTransaction(db, () => {
    const code = custom || nextCode(boughtAt);
    const r = db.prepare("INSERT INTO purchase_receipts (code, source_key, bought_at, order_ref, total_jpy, shipped_at, tracking, note, status, raw_text, batch_id, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, '', ?, 'bought', '', ?, ?, ?)").run(code, input.sourceKey || UNKNOWN_SOURCE, boughtAt, (input.orderRef ?? "").slice(0, 80), (input.note ?? "").slice(0, 300), input.batchId ?? null, now, now);
    return Number(r.lastInsertRowid);
  });
  return getReceipt(id);
}

export function getReceiptByCode(code: string): Receipt | null {
  const r = getDb().prepare(`${RECEIPT_SELECT} WHERE r.code = ?`).get(code.trim()) as ReceiptRow | undefined;
  return r ? hydrate([r])[0] : null;
}

/** Rename a bill (the shop's own numbering, e.g. BILL_260927_1454 like the photo); codes are unique. */
export function renameReceipt(id: number, code: string): { ok: boolean; message: string } {
  const c = code.trim().slice(0, 60);
  if (!c) return { ok: false, message: "Mã bill không được trống." };
  const db = getDb();
  const clash = db.prepare("SELECT id FROM purchase_receipts WHERE code = ? AND id <> ?").get(c, id) as { id: number } | undefined;
  if (clash) return { ok: false, message: `Mã ${c} đã dùng cho bill khác.` };
  const r = db.prepare("UPDATE purchase_receipts SET code = ?, updated_at = ? WHERE id = ?").run(c, new Date().toISOString(), id);
  return Number(r.changes) ? { ok: true, message: `Đã đổi mã bill thành ${c}.` } : { ok: false, message: "Không tìm thấy bill." };
}
