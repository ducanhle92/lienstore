import type { DatabaseSync } from "node:sqlite";
import { LEG_PURCHASE, LEG_STATUS_RANK, type LegStatus } from "./leg-status";
import { isPurchaseStatus, PURCHASE_STAGES, type PurchaseStatus, purchaseIndex } from "./purchase";
import { SHIP_STAGES, type ShippingLeg, type ShipStage } from "./shipping";
import { getDb, withTransaction } from "./sqlite";
import { isUnitRemoved, slowestStatus, sortUnits, stageFromUnits, unitCode, unitExpired, unitInHand, unitServes, type UnitOrigin, type UnitRemoved } from "./units";

/**
 * Từng cái — the single truth for goods (see lib/units.ts for codes and ranking rules).
 *
 * Every write goes through the functions below and ends with `touchSync`, which re-derives everything other screens
 * show: who holds which unit (automatic, oldest order first, nearest place / expiry first), each order line's purchase
 * status, the order's stage and its four legs (only ever advanced automatically), products.stock and the batch status.
 * `Sync` functions take an open connection so callers can wrap several steps in one transaction.
 * This module never imports lib/db.ts (db.ts imports it).
 */

export interface UnitRow {
  id: number;
  code: string;
  product_id: number;
  receipt_id: number | null;
  batch_id: number | null;
  shipment_id: number | null;
  order_item_id: number | null;
  manual: number;
  committed_at: string | null;
  status: string;
  removed: string | null;
  source_key: string;
  store: string;
  bought_at: string | null;
  expiry: string | null;
  unit_cost_jpy: number | null;
  unit_cost_vnd: number | null;
  origin: string;
  note: string;
  created_at: string;
  updated_at: string;
}

const now = () => new Date().toISOString();
const statusOf = (v: unknown): PurchaseStatus => (isPurchaseStatus(v) ? v : "not_bought");
const ph = (n: number) => Array.from({ length: n }, () => "?").join(",");
/** Statuses a unit may hold for an order while it can still be re-assigned (never once it left for the customer). */
const SERVING = PURCHASE_STAGES.filter((s) => unitServes(s.key)).map((s) => s.key);
const SERVING_SQL = SERVING.map((s) => `'${s}'`).join(",");

function eventSync(db: DatabaseSync, unitIds: number[], kind: string, opts: { from?: string | null; to?: string | null; itemId?: number | null; actor?: string; note?: string } = {}): void {
  if (!unitIds.length) return;
  const ins = db.prepare("INSERT INTO stock_unit_events (unit_id, kind, from_status, to_status, order_item_id, actor, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const ts = now();
  for (const id of unitIds) ins.run(id, kind, opts.from ?? null, opts.to ?? null, opts.itemId ?? null, (opts.actor ?? "").slice(0, 80), (opts.note ?? "").slice(0, 300), ts);
}

// =====================================================================================================================
// create / change units

export interface NewUnitsInput {
  productId: number;
  qty: number;
  status: PurchaseStatus;
  receiptId?: number | null;
  batchId?: number | null;
  shipmentId?: number | null;
  sourceKey?: string;
  store?: string;
  boughtAt?: string | null;
  expiry?: string | null;
  unitCostJpy?: number | null;
  unitCostVnd?: number | null;
  origin?: UnitOrigin;
  note?: string;
  /** Held for this order line right away (pinned — "mua theo đơn"). */
  itemId?: number | null;
  actor?: string;
}

/** Creates `qty` units (codes H…) and returns their ids; call `touchSync` afterwards. */
export function createUnitsSync(db: DatabaseSync, input: NewUnitsInput): number[] {
  const qty = Math.max(0, Math.floor(input.qty));
  if (!qty) return [];
  const p = db.prepare("SELECT cost_jpy, cost_price FROM products WHERE id = ?").get(input.productId) as { cost_jpy: number | null; cost_price: number | null } | undefined;
  if (!p) throw new Error("Sản phẩm không tồn tại.");
  const jpy = input.unitCostJpy ?? p.cost_jpy ?? null;
  const vnd = input.unitCostVnd ?? (jpy && jpy !== p.cost_jpy ? null : p.cost_price) ?? null;
  const committed = input.itemId ? ((db.prepare("SELECT o.stock_committed_at FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.id = ?").get(input.itemId) as { stock_committed_at: string | null } | undefined)?.stock_committed_at ?? null) : null;
  const ts = now();
  const ins = db.prepare(
    `INSERT INTO stock_units (code, product_id, receipt_id, batch_id, shipment_id, order_item_id, manual, committed_at, status, removed, source_key, store, bought_at, expiry, unit_cost_jpy, unit_cost_vnd, origin, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const setCode = db.prepare("UPDATE stock_units SET code = ? WHERE id = ?");
  const ids: number[] = [];
  for (let i = 0; i < qty; i++) {
    const r = ins.run(`~${ts}-${i}-${Math.random()}`, input.productId, input.receiptId ?? null, input.batchId ?? null, input.shipmentId ?? null, input.itemId ?? null, input.itemId ? 1 : 0, input.itemId && committed ? ts : null, input.status, input.sourceKey || "unknown", (input.store ?? "").slice(0, 80), input.boughtAt ?? null, input.expiry ?? null, jpy, vnd, input.origin ?? "bill", (input.note ?? "").slice(0, 300), ts, ts);
    const id = Number(r.lastInsertRowid);
    setCode.run(unitCode(id), id);
    ids.push(id);
  }
  eventSync(db, ids, "created", { to: input.status, itemId: input.itemId ?? null, actor: input.actor, note: input.note });
  return ids;
}

/** Status of these units (where they are now). Returns how many changed. */
export function moveUnitsSync(db: DatabaseSync, unitIds: number[], status: PurchaseStatus, opts: { actor?: string; note?: string; raiseOnly?: boolean } = {}): number {
  if (!unitIds.length) return 0;
  const rows = db.prepare(`SELECT id, status FROM stock_units WHERE id IN (${ph(unitIds.length)}) AND removed IS NULL`).all(...unitIds) as Array<{ id: number; status: string }>;
  const ts = now();
  const upd = db.prepare("UPDATE stock_units SET status = ?, updated_at = ? WHERE id = ?");
  let n = 0;
  for (const r of rows) {
    const cur = statusOf(r.status);
    if (cur === status) continue;
    if (opts.raiseOnly && purchaseIndex(cur) >= purchaseIndex(status)) continue;
    upd.run(status, ts, r.id);
    eventSync(db, [r.id], "moved", { from: cur, to: status, actor: opts.actor, note: opts.note });
    n++;
  }
  return n;
}

export interface UnitPatch {
  productId?: number;
  receiptId?: number | null;
  batchId?: number | null;
  sourceKey?: string;
  store?: string;
  boughtAt?: string | null;
  expiry?: string | null;
  unitCostJpy?: number | null;
  unitCostVnd?: number | null;
  note?: string;
}
const PATCH_COL: Record<keyof UnitPatch, string> = { productId: "product_id", receiptId: "receipt_id", batchId: "batch_id", sourceKey: "source_key", store: "store", boughtAt: "bought_at", expiry: "expiry", unitCostJpy: "unit_cost_jpy", unitCostVnd: "unit_cost_vnd", note: "note" };

/** Edit facts of units (only the given fields). A product change drops the hold (the unit is another item now). */
export function editUnitsSync(db: DatabaseSync, unitIds: number[], patch: UnitPatch, opts: { actor?: string } = {}): number {
  const keys = (Object.keys(patch) as Array<keyof UnitPatch>).filter((k) => patch[k] !== undefined);
  if (!unitIds.length || !keys.length) return 0;
  const sets = keys.map((k) => `${PATCH_COL[k]} = ?`).join(", ");
  const vals = keys.map((k) => {
    const v = patch[k];
    if (k === "store") return String(v ?? "").slice(0, 80);
    if (k === "note") return String(v ?? "").slice(0, 300);
    if (k === "sourceKey") return String(v || "unknown");
    return v as never;
  });
  const r = db.prepare(`UPDATE stock_units SET ${sets}, updated_at = ? WHERE id IN (${ph(unitIds.length)})`).run(...(vals as never[]), now(), ...unitIds);
  if (patch.productId !== undefined) db.prepare(`UPDATE stock_units SET order_item_id = NULL, manual = 0, committed_at = NULL WHERE id IN (${ph(unitIds.length)}) AND order_item_id IS NOT NULL AND product_id <> (SELECT product_id FROM order_items WHERE id = stock_units.order_item_id)`).run(...unitIds);
  eventSync(db, unitIds, "edited", { actor: opts.actor, note: keys.map((k) => PATCH_COL[k]).join(", ") });
  return Number(r.changes);
}

/** Written off (thất lạc / hỏng / loại bỏ): out of stock for good, the order line it was held for looks for another. */
export function removeUnitsSync(db: DatabaseSync, unitIds: number[], reason: UnitRemoved, opts: { actor?: string; note?: string } = {}): number {
  if (!unitIds.length) return 0;
  const r = db.prepare(`UPDATE stock_units SET removed = ?, order_item_id = NULL, manual = 0, committed_at = NULL, shipment_id = NULL, updated_at = ? WHERE id IN (${ph(unitIds.length)}) AND removed IS NULL`).run(reason, now(), ...unitIds);
  eventSync(db, unitIds, "removed", { to: reason, actor: opts.actor, note: opts.note });
  return Number(r.changes);
}
/** Undo a write-off. */
export function restoreUnitsSync(db: DatabaseSync, unitIds: number[], opts: { actor?: string } = {}): number {
  if (!unitIds.length) return 0;
  const r = db.prepare(`UPDATE stock_units SET removed = NULL, updated_at = ? WHERE id IN (${ph(unitIds.length)}) AND removed IS NOT NULL`).run(now(), ...unitIds);
  eventSync(db, unitIds, "restored", { actor: opts.actor });
  return Number(r.changes);
}

/** Entered by mistake: the rows vanish (history too). Units already with the customer cannot be deleted. */
export function deleteUnitsSync(db: DatabaseSync, unitIds: number[]): { deleted: number; refused: number } {
  if (!unitIds.length) return { deleted: 0, refused: 0 };
  const rows = db.prepare(`SELECT id, status FROM stock_units WHERE id IN (${ph(unitIds.length)})`).all(...unitIds) as Array<{ id: number; status: string }>;
  const ok = rows.filter((r) => purchaseIndex(statusOf(r.status)) < purchaseIndex("shipped_to_customer")).map((r) => r.id);
  if (ok.length) {
    db.prepare(`DELETE FROM stock_unit_events WHERE unit_id IN (${ph(ok.length)})`).run(...ok);
    db.prepare(`DELETE FROM stock_units WHERE id IN (${ph(ok.length)})`).run(...ok);
  }
  return { deleted: ok.length, refused: rows.length - ok.length };
}

/** Units into a packing run (only those sitting at Kho Nhật, not boxed yet). */
export function packUnitsSync(db: DatabaseSync, shipmentId: number, unitIds: number[], opts: { actor?: string } = {}): number {
  if (!unitIds.length) return 0;
  const ok = (db.prepare(`SELECT id FROM stock_units WHERE id IN (${ph(unitIds.length)}) AND removed IS NULL AND status = 'bought' AND shipment_id IS NULL`).all(...unitIds) as Array<{ id: number }>).map((r) => r.id);
  if (!ok.length) return 0;
  db.prepare(`UPDATE stock_units SET shipment_id = ?, updated_at = ? WHERE id IN (${ph(ok.length)})`).run(shipmentId, now(), ...ok);
  const code = (db.prepare("SELECT code FROM shipments WHERE id = ?").get(shipmentId) as { code: string } | undefined)?.code ?? "";
  eventSync(db, ok, "packed", { actor: opts.actor, note: code });
  return ok.length;
}
export function unpackUnitsSync(db: DatabaseSync, unitIds: number[], opts: { actor?: string } = {}): number {
  if (!unitIds.length) return 0;
  const r = db.prepare(`UPDATE stock_units SET shipment_id = NULL, updated_at = ? WHERE id IN (${ph(unitIds.length)}) AND shipment_id IS NOT NULL`).run(now(), ...unitIds);
  eventSync(db, unitIds, "unpacked", { actor: opts.actor });
  return Number(r.changes);
}

// =====================================================================================================================
// who holds which unit

interface LineRow {
  id: number;
  order_id: string;
  product_id: number;
  quantity: number;
  auto_hold: number;
  stock_committed_at: string | null;
}
const OPEN_LINES = `SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.auto_hold, o.stock_committed_at FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = ? AND o.status IN ('pending','processing') ORDER BY (o.stock_committed_at IS NULL), o.created_at, o.id, oi.id`;

function heldMap(db: DatabaseSync, productId: number): Map<number, Set<number>> {
  const m = new Map<number, Set<number>>();
  for (const r of db.prepare("SELECT id, order_item_id FROM stock_units WHERE product_id = ? AND order_item_id IS NOT NULL AND removed IS NULL").all(productId) as Array<{ id: number; order_item_id: number }>) {
    if (!m.has(r.order_item_id)) m.set(r.order_item_id, new Set());
    m.get(r.order_item_id)!.add(r.id);
  }
  return m;
}

/**
 * Re-serve every open line of a product, oldest order first: holds that may still move (not deducted, not pinned by the
 * admin, not boxed in a packing run) are released, then each line takes the best free units (place → expiry → bill
 * date). Idempotent; returns the lines whose units changed.
 */
export function rebalanceProductSync(db: DatabaseSync, productId: number): number[] {
  const lines = db.prepare(OPEN_LINES).all(productId) as unknown as LineRow[];
  const before = heldMap(db, productId);
  const ts = now();
  if (lines.length) {
    const auto = lines.filter((l) => l.auto_hold === 1).map((l) => l.id);
    if (auto.length) db.prepare(`UPDATE stock_units SET order_item_id = NULL WHERE product_id = ? AND order_item_id IN (${ph(auto.length)}) AND committed_at IS NULL AND manual = 0 AND shipment_id IS NULL AND removed IS NULL AND status IN (${SERVING_SQL})`).run(productId, ...auto);
  }
  // units held by lines that are no longer open (cancelled / completed while still "serving") go back too
  db.prepare(`UPDATE stock_units SET order_item_id = NULL, manual = 0, committed_at = NULL WHERE product_id = ? AND order_item_id IS NOT NULL AND removed IS NULL AND status IN (${SERVING_SQL})
              AND order_item_id IN (SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status = 'cancelled')`).run(productId);
  const today = ts.slice(0, 10);
  const free = sortUnits(
    (db.prepare(`SELECT id, status, expiry, bought_at FROM stock_units WHERE product_id = ? AND order_item_id IS NULL AND removed IS NULL AND status IN (${SERVING_SQL})`).all(productId) as Array<{ id: number; status: string; expiry: string | null; bought_at: string | null }>)
      .filter((u) => !unitExpired(u.expiry, today))
      .map((u) => ({ id: u.id, status: statusOf(u.status), expiry: u.expiry, boughtAt: u.bought_at })),
  );
  const count = db.prepare("SELECT COUNT(*) AS n FROM stock_units WHERE order_item_id = ? AND removed IS NULL");
  const take = db.prepare("UPDATE stock_units SET order_item_id = ?, committed_at = ?, updated_at = ? WHERE id = ?");
  let k = 0;
  for (const l of lines) {
    if (l.auto_hold !== 1) continue;
    let need = l.quantity - Number((count.get(l.id) as { n: number }).n);
    while (need > 0 && k < free.length) {
      take.run(l.id, l.stock_committed_at ? ts : null, ts, free[k].id);
      k++;
      need--;
    }
  }
  // a paid / COD line still short takes units already packed for unpaid orders (newest unpaid order first) —
  // boxed holds otherwise stay put so a packed box keeps its customer
  const packedForUnpaid = db.prepare(
    `SELECT u.id FROM stock_units u JOIN order_items oi ON oi.id = u.order_item_id JOIN orders o ON o.id = oi.order_id
     WHERE u.product_id = ? AND u.committed_at IS NULL AND u.manual = 0 AND u.removed IS NULL AND u.status IN (${SERVING_SQL})
       AND o.stock_committed_at IS NULL AND o.status IN ('pending','processing') AND oi.auto_hold = 1
     ORDER BY o.created_at DESC, o.id DESC, u.id`,
  );
  for (const l of lines) {
    if (l.auto_hold !== 1 || !l.stock_committed_at) continue;
    let need = l.quantity - Number((count.get(l.id) as { n: number }).n);
    if (need <= 0) continue;
    for (const v of packedForUnpaid.all(productId) as Array<{ id: number }>) {
      if (need <= 0) break;
      take.run(l.id, ts, ts, v.id);
      need--;
    }
  }
  const after = heldMap(db, productId);
  const changed: number[] = [];
  const itemIds = new Set([...before.keys(), ...after.keys()]);
  for (const id of itemIds) {
    const b = before.get(id) ?? new Set<number>();
    const a = after.get(id) ?? new Set<number>();
    const gained = [...a].filter((x) => !b.has(x));
    const lost = [...b].filter((x) => !a.has(x));
    if (gained.length || lost.length) {
      changed.push(id);
      eventSync(db, gained, "held", { itemId: id });
      eventSync(db, lost, "released", { itemId: id });
    }
  }
  return changed;
}

/** The admin picks units for a line (pinned; the line stops auto-serving). Existing movable holds are given back. */
export function pinUnitsToItemSync(db: DatabaseSync, itemId: number, unitIds: number[], opts: { actor?: string } = {}): { taken: number; need: number } {
  const line = db.prepare("SELECT oi.id, oi.product_id, oi.quantity, o.stock_committed_at FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.id = ?").get(itemId) as { id: number; product_id: number; quantity: number; stock_committed_at: string | null } | undefined;
  if (!line) return { taken: 0, need: 0 };
  db.prepare("UPDATE stock_units SET order_item_id = NULL, manual = 0 WHERE order_item_id = ? AND committed_at IS NULL AND shipment_id IS NULL AND removed IS NULL").run(itemId);
  const kept = Number((db.prepare("SELECT COUNT(*) AS n FROM stock_units WHERE order_item_id = ? AND removed IS NULL").get(itemId) as { n: number }).n);
  let need = line.quantity - kept;
  const ts = now();
  const ids: number[] = [];
  for (const id of unitIds) {
    if (need <= 0) break;
    const u = db.prepare(`SELECT id FROM stock_units WHERE id = ? AND product_id = ? AND order_item_id IS NULL AND removed IS NULL AND status IN (${SERVING_SQL})`).get(id, line.product_id) as { id: number } | undefined;
    if (!u) continue;
    db.prepare("UPDATE stock_units SET order_item_id = ?, manual = 1, committed_at = ?, updated_at = ? WHERE id = ?").run(itemId, line.stock_committed_at ? ts : null, ts, id);
    ids.push(id);
    need--;
  }
  db.prepare("UPDATE order_items SET auto_hold = 0 WHERE id = ?").run(itemId);
  eventSync(db, ids, "held", { itemId, actor: opts.actor, note: "chọn tay" });
  return { taken: ids.length, need };
}

/**
 * The line keeps at most `keep` units (order edited: fewer pieces, or the line removed with keep = 0). Units still on
 * their way / in stock go back to free stock — boxed and not-yet-deducted ones last, so a packed box stays packed.
 */
export function releaseItemUnitsSync(db: DatabaseSync, itemId: number, keep: number, opts: { actor?: string } = {}): number {
  const held = db
    .prepare(`SELECT id FROM stock_units WHERE order_item_id = ? AND removed IS NULL AND status IN (${SERVING_SQL}) ORDER BY (shipment_id IS NOT NULL), (committed_at IS NULL), id DESC`)
    .all(itemId) as Array<{ id: number }>;
  const extra = held.length - Math.max(0, keep);
  if (extra <= 0) return 0;
  const ids = held.slice(0, extra).map((r) => r.id);
  db.prepare(`UPDATE stock_units SET order_item_id = NULL, manual = 0, committed_at = NULL, updated_at = ? WHERE id IN (${ph(ids.length)})`).run(now(), ...ids);
  eventSync(db, ids, "released", { itemId, actor: opts.actor, note: "sửa sản phẩm của đơn" });
  return ids.length;
}

/** "Cần mua": the line gives its movable units back and waits for a purchase (no automatic serving). */
export function releaseItemToBuySync(db: DatabaseSync, itemId: number, opts: { actor?: string } = {}): number {
  const ids = (db.prepare("SELECT id FROM stock_units WHERE order_item_id = ? AND committed_at IS NULL AND removed IS NULL AND status IN (" + SERVING_SQL + ")").all(itemId) as Array<{ id: number }>).map((r) => r.id);
  if (ids.length) db.prepare(`UPDATE stock_units SET order_item_id = NULL, manual = 0, updated_at = ? WHERE id IN (${ph(ids.length)})`).run(now(), ...ids);
  db.prepare("UPDATE order_items SET auto_hold = 0 WHERE id = ?").run(itemId);
  eventSync(db, ids, "released", { itemId, actor: opts.actor, note: "đổi về Cần mua" });
  return ids.length;
}

/** "Tự động phân bổ": the order's lines serve automatically again (pins lifted, not the deducted units). */
export function autoServeOrderSync(db: DatabaseSync, orderId: string): void {
  const items = (db.prepare("SELECT id FROM order_items WHERE order_id = ?").all(orderId) as Array<{ id: number }>).map((r) => r.id);
  if (!items.length) return;
  db.prepare(`UPDATE order_items SET auto_hold = 1 WHERE id IN (${ph(items.length)})`).run(...items);
  db.prepare(`UPDATE stock_units SET manual = 0 WHERE order_item_id IN (${ph(items.length)}) AND committed_at IS NULL AND shipment_id IS NULL`).run(...items);
}

/** Payment confirmed / COD granted / goods left: the order's units are deducted for real (they can no longer move to another order). */
export function commitOrderSync(db: DatabaseSync, orderId: string): number {
  const ts = now();
  const r = db.prepare("UPDATE stock_units SET committed_at = ?, updated_at = ? WHERE committed_at IS NULL AND removed IS NULL AND order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)").run(ts, ts, orderId);
  db.prepare("UPDATE orders SET stock_committed_at = COALESCE(stock_committed_at, ?) WHERE id = ?").run(ts, orderId);
  return Number(r.changes);
}

/** Cancel / delete an order: its units go back to stock (except what already left for the customer). */
export function releaseOrderSync(db: DatabaseSync, orderId: string): { released: number; productIds: number[] } {
  const rows = db.prepare(`SELECT u.id, u.product_id, u.order_item_id FROM stock_units u JOIN order_items oi ON oi.id = u.order_item_id WHERE oi.order_id = ? AND u.removed IS NULL AND u.status IN (${SERVING_SQL})`).all(orderId) as Array<{ id: number; product_id: number; order_item_id: number }>;
  if (rows.length) {
    db.prepare(`UPDATE stock_units SET order_item_id = NULL, manual = 0, committed_at = NULL, updated_at = ? WHERE id IN (${ph(rows.length)})`).run(now(), ...rows.map((r) => r.id));
    const number = (db.prepare("SELECT number FROM orders WHERE id = ?").get(orderId) as { number: number } | undefined)?.number;
    eventSync(db, rows.map((r) => r.id), "released", { note: `đơn #${number ?? "?"} huỷ` });
  }
  db.prepare("UPDATE order_items SET batch_id = NULL WHERE order_id = ? AND batch_id IS NOT NULL").run(orderId);
  const productIds = Array.from(new Set([...rows.map((r) => r.product_id), ...(db.prepare("SELECT product_id FROM order_items WHERE order_id = ?").all(orderId) as Array<{ product_id: number }>).map((r) => r.product_id)]));
  return { released: rows.length, productIds };
}

// =====================================================================================================================
// derived state

/** Purchase status (+ bill / source / facts) of an order line from the units it holds. */
export function syncLineSync(db: DatabaseSync, itemId: number): void {
  const line = db.prepare("SELECT id, quantity, purchase_status, batch_id, source_key FROM order_items WHERE id = ?").get(itemId) as { id: number; quantity: number; purchase_status: string | null; batch_id: number | null; source_key: string | null } | undefined;
  if (!line) return;
  const units = db.prepare("SELECT status, receipt_id, batch_id, source_key, expiry, bought_at, unit_cost_jpy FROM stock_units WHERE order_item_id = ? AND removed IS NULL ORDER BY id").all(itemId) as Array<{ status: string; receipt_id: number | null; batch_id: number | null; source_key: string; expiry: string | null; bought_at: string | null; unit_cost_jpy: number | null }>;
  const covered = units.length >= line.quantity && units.length > 0;
  const status: PurchaseStatus = covered ? slowestStatus(units.map((u) => statusOf(u.status))) : "not_bought";
  const f = units[0];
  const ts = now();
  db.prepare(
    `UPDATE order_items SET purchase_status = ?, purchase_updated_at = CASE WHEN COALESCE(purchase_status, '') <> ? THEN ? ELSE purchase_updated_at END,
       receipt_id = ?, batch_id = ?, source_key = ?, purchase_expiry = ?, purchase_bought_at = ?, purchase_cost_jpy = ? WHERE id = ?`,
  ).run(status, status, ts, f?.receipt_id ?? null, f?.batch_id ?? line.batch_id, f?.source_key ?? line.source_key ?? "", f?.expiry ?? null, f?.bought_at ?? null, f?.unit_cost_jpy ?? null, itemId);
}

const stageRank = (s: string) => Math.max(0, SHIP_STAGES.findIndex((x) => x.key === s));
const LEGS: ShippingLeg[] = ["jp_domestic", "jp_vn", "vn_transfer", "vn_domestic"];

/** Leg status the slowest unit of an order proves (legs are only ever advanced automatically). */
function legFromUnits(leg: ShippingLeg, slowest: PurchaseStatus): LegStatus {
  const t = LEG_PURCHASE[leg];
  if (t.arrived && purchaseIndex(slowest) >= purchaseIndex(t.arrived)) return "arrived";
  if (t.sent && purchaseIndex(slowest) >= purchaseIndex(t.sent)) return "sent";
  return "pending";
}

/**
 * Order stage + legs follow the order's units (advance only). The customer-facing stage moves only once the payment is
 * settled (paid, or COD granted) — a prepaid order waits for its money even when the goods are already in Vietnam.
 */
export function syncOrderFromUnitsSync(db: DatabaseSync, orderId: string): void {
  const o = db.prepare("SELECT id, status, ship_stage, paid_at, payment_method FROM orders WHERE id = ?").get(orderId) as { id: string; status: string; ship_stage: string | null; paid_at: string | null; payment_method: string } | undefined;
  if (!o || o.status === "cancelled" || o.status === "completed") return;
  const lines = db.prepare("SELECT id, quantity FROM order_items WHERE order_id = ?").all(orderId) as Array<{ id: number; quantity: number }>;
  if (!lines.length) return;
  const units = db.prepare(`SELECT u.status, u.order_item_id, u.shipment_id, s.status AS ship_status FROM stock_units u LEFT JOIN shipments s ON s.id = u.shipment_id WHERE u.removed IS NULL AND u.order_item_id IN (${ph(lines.length)})`).all(...lines.map((l) => l.id)) as Array<{ status: string; order_item_id: number; shipment_id: number | null; ship_status: string | null }>;
  const byLine = new Map<number, number>();
  for (const u of units) byLine.set(u.order_item_id, (byLine.get(u.order_item_id) ?? 0) + 1);
  if (lines.some((l) => (byLine.get(l.id) ?? 0) < l.quantity)) return; // something still to buy: the goods prove nothing yet
  const slowest = slowestStatus(units.map((u) => statusOf(u.status)));
  const allBoxed = units.every((u) => u.shipment_id !== null && u.ship_status !== null && u.ship_status !== "packing");
  const derived = stageFromUnits(slowest, allBoxed) as ShipStage;
  const cur = o.ship_stage ?? "ordered";
  const ts = now();
  const settled = !!o.paid_at || o.payment_method === "cod";
  if (settled && stageRank(derived) > stageRank(cur)) {
    db.prepare("UPDATE orders SET ship_stage = ?, updated_at = ? WHERE id = ?").run(derived, ts, orderId);
    db.prepare("INSERT INTO order_stage_log (order_id, stage, note, created_at) VALUES (?, ?, 'Tự động theo hàng', ?)").run(orderId, derived, ts);
    if (derived === "delivered") db.prepare("UPDATE orders SET status = CASE WHEN paid_at IS NOT NULL THEN 'completed' ELSE 'processing' END WHERE id = ? AND status <> 'cancelled'").run(orderId);
    else db.prepare("UPDATE orders SET status = 'processing' WHERE id = ? AND status = 'pending'").run(orderId);
  }
  // the four legs of the order (Vận chuyển sheets) follow too
  for (const leg of LEGS) {
    const want = legFromUnits(leg, slowest);
    if (want === "pending") continue;
    const row = db.prepare("SELECT status FROM order_legs WHERE order_id = ? AND leg = ?").get(orderId, leg) as { status: string | null } | undefined;
    const have = (row?.status ?? "pending") as LegStatus;
    if ((LEG_STATUS_RANK[want] ?? 0) <= (LEG_STATUS_RANK[have] ?? 0)) continue;
    if (!row) db.prepare("INSERT INTO order_legs (order_id, leg, method_id, zone_id, label, fee, tracking, note, status, updated_at) VALUES (?, ?, NULL, NULL, '', 0, '', '', 'pending', ?)").run(orderId, leg, ts);
    db.prepare("UPDATE order_legs SET status = ?, sent_at = COALESCE(sent_at, ?), arrived_at = CASE WHEN ? = 'arrived' THEN COALESCE(arrived_at, ?) ELSE arrived_at END, updated_at = ? WHERE order_id = ? AND leg = ?").run(want, ts, want, ts, ts, orderId, leg);
    db.prepare("INSERT INTO order_leg_events (order_id, leg, status, tracking, note, actor, created_at) VALUES (?, ?, ?, '', 'Tự động theo hàng', '', ?)").run(orderId, leg, want, ts);
  }
}

/**
 * products.stock = free units in hand (bought → at the shop); products.stock_vn = the free ones already at Kho Việt Nam
 * (shop) — what the storefront shows as "Có sẵn". Only products that have had goods in hand are tracked — units still
 * planned / ordered online do not turn a "hàng order" product into an out-of-stock one.
 */
export function syncProductStockSync(db: DatabaseSync, productId: number): void {
  const any = db.prepare("SELECT 1 FROM stock_units WHERE product_id = ? AND (status NOT IN ('not_bought','ordered') OR removed IS NOT NULL) LIMIT 1").get(productId);
  if (!any) return;
  const n = Number((db.prepare("SELECT COUNT(*) AS n FROM stock_units WHERE product_id = ? AND order_item_id IS NULL AND removed IS NULL AND status IN ('bought','to_carrier_jp','shipped_jp_vn','at_carrier_vn','to_shop','at_shop')").get(productId) as { n: number }).n);
  const vn = Number((db.prepare("SELECT COUNT(*) AS n FROM stock_units WHERE product_id = ? AND order_item_id IS NULL AND removed IS NULL AND status = 'at_shop'").get(productId) as { n: number }).n);
  db.prepare("UPDATE products SET stock = ?, stock_vn = ?, updated_at = ? WHERE id = ? AND (stock IS NULL OR stock <> ? OR stock_vn IS NULL OR stock_vn <> ?)").run(n, vn, now(), productId, n, vn);
}

/** A purchase batch shows its slowest unit (capped at the shop); a batch without units keeps its status. */
export function syncBatchStatusSync(db: DatabaseSync, batchId: number): void {
  const b = db.prepare("SELECT status, bought_at, shipped_at FROM purchase_batches WHERE id = ?").get(batchId) as { status: string; bought_at: string | null; shipped_at: string | null } | undefined;
  if (!b) return;
  const st = (db.prepare("SELECT status FROM stock_units WHERE batch_id = ? AND removed IS NULL").all(batchId) as Array<{ status: string }>).map((r) => statusOf(r.status));
  if (!st.length) return;
  let s = slowestStatus(st);
  if (purchaseIndex(s) > purchaseIndex("at_shop")) s = "at_shop";
  if (s === b.status) return;
  const today = now().slice(0, 10);
  db.prepare("UPDATE purchase_batches SET status = ?, bought_at = COALESCE(bought_at, CASE WHEN ? THEN ? END), shipped_at = COALESCE(shipped_at, CASE WHEN ? THEN ? END), updated_at = ? WHERE id = ?").run(
    s,
    purchaseIndex(s) >= purchaseIndex("bought") ? 1 : 0,
    today,
    purchaseIndex(s) >= purchaseIndex("shipped_jp_vn") ? 1 : 0,
    today,
    now(),
    batchId,
  );
}

export interface Touch {
  unitIds?: number[];
  productIds?: number[];
  itemIds?: number[];
  orderIds?: string[];
  batchIds?: number[];
}

/** Re-derive everything after units changed: holds, lines, orders (stage + legs), batches, product stock. */
export function touchSync(db: DatabaseSync, t: Touch): void {
  const products = new Set(t.productIds ?? []);
  const items = new Set(t.itemIds ?? []);
  const orders = new Set(t.orderIds ?? []);
  const batches = new Set(t.batchIds ?? []);
  if (t.unitIds?.length) {
    for (let i = 0; i < t.unitIds.length; i += 500) {
      const chunk = t.unitIds.slice(i, i + 500);
      for (const r of db.prepare(`SELECT product_id, order_item_id, batch_id FROM stock_units WHERE id IN (${ph(chunk.length)})`).all(...chunk) as Array<{ product_id: number; order_item_id: number | null; batch_id: number | null }>) {
        products.add(r.product_id);
        if (r.order_item_id) items.add(r.order_item_id);
        if (r.batch_id) batches.add(r.batch_id);
      }
    }
  }
  for (const id of items) {
    const r = db.prepare("SELECT product_id, order_id FROM order_items WHERE id = ?").get(id) as { product_id: number; order_id: string } | undefined;
    if (r) products.add(r.product_id);
  }
  for (const oid of orders) for (const r of db.prepare("SELECT id, product_id FROM order_items WHERE order_id = ?").all(oid) as Array<{ id: number; product_id: number }>) {
    items.add(r.id);
    products.add(r.product_id);
  }
  for (const p of products) {
    for (const id of rebalanceProductSync(db, p)) items.add(id);
    // every open line of the product may have moved in the queue
    for (const r of db.prepare(OPEN_LINES).all(p) as unknown as LineRow[]) items.add(r.id);
  }
  for (const id of items) {
    syncLineSync(db, id);
    const r = db.prepare("SELECT order_id FROM order_items WHERE id = ?").get(id) as { order_id: string } | undefined;
    if (r) orders.add(r.order_id);
    for (const b of db.prepare("SELECT DISTINCT batch_id FROM stock_units WHERE order_item_id = ? AND batch_id IS NOT NULL").all(id) as Array<{ batch_id: number }>) batches.add(b.batch_id);
  }
  for (const oid of orders) syncOrderFromUnitsSync(db, oid);
  for (const b of batches) syncBatchStatusSync(db, b);
  for (const p of products) syncProductStockSync(db, p);
}

/** Convenience: run `fn` and re-derive in one transaction. */
export function withUnits<T>(fn: (db: DatabaseSync) => { result: T; touch: Touch }): T {
  const db = getDb();
  return withTransaction(db, () => {
    const { result, touch } = fn(db);
    touchSync(db, touch);
    return result;
  });
}

/** Units the order's lines hold, raised to `status` (manual stage / leg change on the order — the goods follow). */
export function raiseOrderUnitsSync(db: DatabaseSync, orderId: string, status: PurchaseStatus, opts: { actor?: string; note?: string } = {}): number[] {
  const ids = (db.prepare("SELECT u.id FROM stock_units u JOIN order_items oi ON oi.id = u.order_item_id WHERE oi.order_id = ? AND u.removed IS NULL").all(orderId) as Array<{ id: number }>).map((r) => r.id);
  moveUnitsSync(db, ids, status, { ...opts, raiseOnly: true });
  return ids;
}

/** Full re-derivation of every product with units (startup safety net / "Cập nhật theo đơn hàng"). */
export function resyncAllUnitsSync(db: DatabaseSync): { products: number } {
  const products = (db.prepare("SELECT DISTINCT product_id FROM stock_units UNION SELECT DISTINCT oi.product_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status IN ('pending','processing')").all() as Array<{ product_id: number }>).map((r) => r.product_id);
  const orders = (db.prepare("SELECT id FROM orders WHERE status IN ('pending','processing')").all() as Array<{ id: string }>).map((r) => r.id);
  touchSync(db, { productIds: products, orderIds: orders });
  return { products: products.length };
}

// =====================================================================================================================
// read side

export interface UnitView {
  id: number;
  code: string;
  productId: number;
  productName: string;
  productSku: string | null;
  productThumb: string;
  groupId: number | null;
  groupCode: string;
  receiptId: number | null;
  receiptCode: string;
  batchId: number | null;
  batchCode: string;
  shipmentId: number | null;
  shipmentCode: string;
  shipmentStatus: string;
  itemId: number | null;
  orderId: string | null;
  orderNumber: number | null;
  customerName: string;
  orderStatus: string;
  committed: boolean;
  manual: boolean;
  status: PurchaseStatus;
  removed: UnitRemoved | null;
  sourceKey: string;
  store: string;
  boughtAt: string | null;
  expiry: string | null;
  unitCostJpy: number | null;
  unitCostVnd: number | null;
  origin: UnitOrigin;
  note: string;
  createdAt: string;
  updatedAt: string;
}

const VIEW_SELECT = `SELECT u.*, p.name AS p_name, p.sku AS p_sku, p.thumb AS p_thumb, p.group_id AS g_id, g.code AS g_code, r.code AS r_code, b.code AS b_code, s.code AS s_code, s.status AS s_status,
  oi.order_id AS o_id, o.number AS o_number, o.first_name AS o_first, o.last_name AS o_last, o.status AS o_status
  FROM stock_units u JOIN products p ON p.id = u.product_id LEFT JOIN product_groups g ON g.id = p.group_id LEFT JOIN purchase_receipts r ON r.id = u.receipt_id
  LEFT JOIN purchase_batches b ON b.id = u.batch_id LEFT JOIN shipments s ON s.id = u.shipment_id LEFT JOIN order_items oi ON oi.id = u.order_item_id LEFT JOIN orders o ON o.id = oi.order_id`;

type ViewRow = UnitRow & { p_name: string; p_sku: string | null; p_thumb: string | null; g_id: number | null; g_code: string | null; r_code: string | null; b_code: string | null; s_code: string | null; s_status: string | null; o_id: string | null; o_number: number | null; o_first: string | null; o_last: string | null; o_status: string | null };
const ORIGINS: UnitOrigin[] = ["bill", "order", "count", "manual", "return", "legacy"];
const toView = (r: ViewRow): UnitView => ({
  id: r.id,
  code: r.code,
  productId: r.product_id,
  productName: r.p_name,
  productSku: r.p_sku,
  productThumb: r.p_thumb ?? "",
  groupId: r.g_id ?? null,
  groupCode: r.g_code ?? "",
  receiptId: r.receipt_id,
  receiptCode: r.r_code ?? "",
  batchId: r.batch_id,
  batchCode: r.b_code ?? "",
  shipmentId: r.shipment_id,
  shipmentCode: r.s_code ?? "",
  shipmentStatus: r.s_status ?? "",
  itemId: r.order_item_id,
  orderId: r.o_id,
  orderNumber: r.o_number,
  customerName: `${r.o_last ?? ""} ${r.o_first ?? ""}`.trim(),
  orderStatus: r.o_status ?? "",
  committed: !!r.committed_at,
  manual: r.manual === 1,
  status: statusOf(r.status),
  removed: isUnitRemoved(r.removed) ? r.removed : null,
  sourceKey: r.source_key,
  store: r.store ?? "",
  boughtAt: r.bought_at,
  expiry: r.expiry,
  unitCostJpy: r.unit_cost_jpy,
  unitCostVnd: r.unit_cost_vnd,
  origin: (ORIGINS as string[]).includes(r.origin) ? (r.origin as UnitOrigin) : "bill",
  note: r.note ?? "",
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface UnitFilter {
  ids?: number[];
  productId?: number;
  productIds?: number[];
  batchId?: number;
  batchIds?: number[];
  receiptId?: number;
  shipmentId?: number;
  shipmentIds?: number[];
  itemIds?: number[];
  orderId?: string;
  statuses?: PurchaseStatus[];
  /** Include written-off units (default: no). */
  withRemoved?: boolean;
  onlyRemoved?: boolean;
  /** Only units not held by any order. */
  free?: boolean;
  /** Units that left for the customer are excluded unless asked. */
  withDelivered?: boolean;
}

export function listUnits(db: DatabaseSync, f: UnitFilter = {}): UnitView[] {
  const where: string[] = [];
  const args: unknown[] = [];
  const inList = (col: string, vals: unknown[] | undefined) => {
    if (!vals) return;
    if (!vals.length) {
      where.push("0");
      return;
    }
    where.push(`${col} IN (${ph(vals.length)})`);
    args.push(...vals);
  };
  inList("u.id", f.ids);
  if (f.productId !== undefined) inList("u.product_id", [f.productId]);
  inList("u.product_id", f.productIds);
  if (f.batchId !== undefined) inList("u.batch_id", [f.batchId]);
  inList("u.batch_id", f.batchIds);
  if (f.receiptId !== undefined) inList("u.receipt_id", [f.receiptId]);
  if (f.shipmentId !== undefined) inList("u.shipment_id", [f.shipmentId]);
  inList("u.shipment_id", f.shipmentIds);
  inList("u.order_item_id", f.itemIds);
  if (f.orderId !== undefined) {
    where.push("oi.order_id = ?");
    args.push(f.orderId);
  }
  inList("u.status", f.statuses);
  if (f.onlyRemoved) where.push("u.removed IS NOT NULL");
  else if (!f.withRemoved) where.push("u.removed IS NULL");
  if (f.free) where.push("u.order_item_id IS NULL");
  if (!f.withDelivered && !f.statuses) where.push("u.status NOT IN ('shipped_to_customer','delivered')");
  const rows = db.prepare(`${VIEW_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY p.name COLLATE NOCASE, u.receipt_id, u.id`).all(...(args as never[])) as unknown as ViewRow[];
  return rows.map(toView);
}

export function getUnitByCode(db: DatabaseSync, code: string): UnitView | null {
  const r = db.prepare(`${VIEW_SELECT} WHERE u.code = ?`).get(code.trim().toUpperCase()) as ViewRow | undefined;
  return r ? toView(r) : null;
}

export interface UnitEvent {
  id: number;
  kind: string;
  from: string | null;
  to: string | null;
  itemId: number | null;
  orderNumber: number | null;
  actor: string;
  note: string;
  at: string;
}
export function listUnitEvents(db: DatabaseSync, unitId: number): UnitEvent[] {
  return (db.prepare("SELECT e.*, o.number FROM stock_unit_events e LEFT JOIN order_items oi ON oi.id = e.order_item_id LEFT JOIN orders o ON o.id = oi.order_id WHERE e.unit_id = ? ORDER BY e.id").all(unitId) as Array<{ id: number; kind: string; from_status: string | null; to_status: string | null; order_item_id: number | null; number: number | null; actor: string; note: string; created_at: string }>).map((e) => ({ id: e.id, kind: e.kind, from: e.from_status, to: e.to_status, itemId: e.order_item_id, orderNumber: e.number, actor: e.actor, note: e.note, at: e.created_at }));
}

/** Units in hand per product, by where they are and whether an order holds them (inventory tiles / product table). */
export function unitCountsByProduct(db: DatabaseSync): Map<number, { byStatus: Partial<Record<PurchaseStatus, number>>; free: number; held: number; inHand: number }> {
  const out = new Map<number, { byStatus: Partial<Record<PurchaseStatus, number>>; free: number; held: number; inHand: number }>();
  for (const r of db.prepare("SELECT product_id, status, order_item_id IS NULL AS free, COUNT(*) AS n FROM stock_units WHERE removed IS NULL AND status NOT IN ('shipped_to_customer','delivered') GROUP BY product_id, status, order_item_id IS NULL").all() as Array<{ product_id: number; status: string; free: number; n: number }>) {
    const c = out.get(r.product_id) ?? { byStatus: {}, free: 0, held: 0, inHand: 0 };
    const s = statusOf(r.status);
    c.byStatus[s] = (c.byStatus[s] ?? 0) + Number(r.n);
    if (unitInHand(s)) {
      c.inHand += Number(r.n);
      if (r.free) c.free += Number(r.n);
      else c.held += Number(r.n);
    }
    out.set(r.product_id, c);
  }
  return out;
}

/** The stock-check bill of a day (KK-yymmdd) — the paper trail for units found in excess during a count. */
export function countReceiptIdSync(db: DatabaseSync, date = now().slice(0, 10)): number {
  const code = `KK-${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}`;
  const ex = db.prepare("SELECT id FROM purchase_receipts WHERE code = ?").get(code) as { id: number } | undefined;
  if (ex) return ex.id;
  const ts = now();
  const r = db.prepare("INSERT INTO purchase_receipts (code, source_key, bought_at, order_ref, total_jpy, shipped_at, tracking, note, status, raw_text, created_at, updated_at) VALUES (?, 'manual', ?, '', NULL, NULL, '', 'Kiểm kê: hàng thừa so với sổ', 'bought', '', ?, ?)").run(code, date, ts, ts);
  return Number(r.lastInsertRowid);
}

const PLACE_STATUSES: Record<string, PurchaseStatus[]> = { jp: ["bought"], jp_carrier: ["to_carrier_jp", "shipped_jp_vn"], carrier: ["at_carrier_vn", "to_shop"], vn: ["at_shop"] };
const PLACE_NEW_STATUS: Record<string, PurchaseStatus> = { jp: "bought", jp_carrier: "to_carrier_jp", carrier: "at_carrier_vn", vn: "at_shop" };

/**
 * Stock count: make the FREE units of a product (at one warehouse, or everywhere in hand) number `target`.
 * Extra → new units on today's KK bill; missing → the nearest-expiry free units are written off as "thất lạc".
 */
export function adjustUnitsToTotalSync(db: DatabaseSync, productId: number, target: number, opts: { warehouse?: string; actor?: string } = {}): { added: number; removed: number } {
  const statuses = opts.warehouse ? (PLACE_STATUSES[opts.warehouse] ?? ["at_shop"]) : (["bought", "to_carrier_jp", "shipped_jp_vn", "at_carrier_vn", "to_shop", "at_shop"] as PurchaseStatus[]);
  const free = sortUnits(
    (db.prepare(`SELECT id, status, expiry, bought_at FROM stock_units WHERE product_id = ? AND order_item_id IS NULL AND removed IS NULL AND shipment_id IS NULL AND status IN (${ph(statuses.length)})`).all(productId, ...statuses) as Array<{ id: number; status: string; expiry: string | null; bought_at: string | null }>).map((u) => ({ id: u.id, status: statusOf(u.status), expiry: u.expiry, boughtAt: u.bought_at })),
  );
  const want = Math.max(0, Math.floor(target));
  if (want > free.length) {
    const ids = createUnitsSync(db, { productId, qty: want - free.length, status: PLACE_NEW_STATUS[opts.warehouse ?? "vn"] ?? "at_shop", receiptId: countReceiptIdSync(db), sourceKey: "manual", origin: "count", note: "Kiểm kê (+)", actor: opts.actor });
    return { added: ids.length, removed: 0 };
  }
  if (want < free.length) {
    const ids = free.slice(0, free.length - want).map((u) => u.id);
    removeUnitsSync(db, ids, "lost", { actor: opts.actor, note: "Kiểm kê (−)" });
    return { added: 0, removed: ids.length };
  }
  return { added: 0, removed: 0 };
}
