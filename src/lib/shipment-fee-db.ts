import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { isDimsConfidence, billableProductWeightG } from "./shipping";
import { splitByWeight } from "./shipment-fee";
import { getDb, withTransaction } from "./sqlite";

/**
 * ⑤ "Phí ship ĐVVC → shop VN" (migration 74): the amount the shop paid for one run's carrier VN warehouse → shop leg.
 * Saving it splits the fee over the run's units by billable weight and freezes the split in shipment_fee_shares
 * (one row per order holding units of the run; order_id '' = units with no order). Re-saving re-splits from the run's
 * current units. Accounting reads the shares: an order's share replaces its estimated ③ leg fee, the stock share is
 * a cost of the month the fee was paid.
 */

export interface ShopFeeFile {
  path: string;
  url: string;
  name: string;
  mime: string;
}

export interface ShopFeeShare {
  /** "" = units of the run that no order holds (stock). */
  orderId: string;
  orderNumber: number | null;
  customer: string;
  units: number;
  grams: number;
  fee: number;
}

export interface ShopFee {
  shipmentId: number;
  fee: number;
  /** Day the transfer was made (YYYY-MM-DD). */
  paidAt: string;
  note: string;
  files: ShopFeeFile[];
  by: string;
  shares: ShopFeeShare[];
}

const parseFiles = (s: string | null | undefined): ShopFeeFile[] => {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v.filter((f) => f && typeof f.path === "string") : [];
  } catch {
    return [];
  }
};

/** The run's units right now, grouped by the order holding them ('' = no order, or a cancelled one). */
function partsOf(db: DatabaseSync, shipmentId: number): Array<{ key: string; units: number; grams: number }> {
  const rows = db
    .prepare(
      `SELECT CASE WHEN o.id IS NULL OR o.status = 'cancelled' THEN '' ELSE o.id END AS order_id, p.weight_g, p.dims_cm, p.dims_confidence
         FROM stock_units u
         LEFT JOIN order_items oi ON oi.id = u.order_item_id
         LEFT JOIN orders o ON o.id = oi.order_id
         LEFT JOIN products p ON p.id = u.product_id
        WHERE u.shipment_id = ? AND u.removed IS NULL`,
    )
    .all(shipmentId) as Array<{ order_id: string; weight_g: number | null; dims_cm: string | null; dims_confidence: string | null }>;
  const by = new Map<string, { key: string; units: number; grams: number }>();
  for (const r of rows) {
    const g = billableProductWeightG(r.weight_g ?? null, r.dims_cm ?? null, isDimsConfidence(r.dims_confidence) ? r.dims_confidence : null);
    const cur = by.get(r.order_id) ?? { key: r.order_id, units: 0, grams: 0 };
    cur.units++;
    cur.grams += Math.round(g);
    by.set(r.order_id, cur);
  }
  // orders first (by key), stock last — a stable order for the rounding
  return [...by.values()].sort((a, b) => (a.key === "" ? 1 : b.key === "" ? -1 : a.key.localeCompare(b.key)));
}

/** Records (or replaces) the fee of a run and re-splits it over the run's current units. */
export function saveShopFee(shipmentId: number, input: { fee: number; paidAt: string; note: string; by: string }, db: DatabaseSync = getDb()): ShopFee | null {
  const exists = db.prepare("SELECT 1 FROM shipments WHERE id = ?").get(shipmentId);
  if (!exists) return null;
  withTransaction(db, () => {
    const parts = partsOf(db, shipmentId);
    const shares = splitByWeight(input.fee, parts);
    db.prepare("UPDATE shipments SET shop_fee = ?, shop_fee_at = ?, shop_fee_note = ?, shop_fee_by = ?, updated_at = ? WHERE id = ?").run(Math.round(input.fee), input.paidAt, input.note.slice(0, 300), input.by.slice(0, 80), new Date().toISOString(), shipmentId);
    db.prepare("DELETE FROM shipment_fee_shares WHERE shipment_id = ?").run(shipmentId);
    const ins = db.prepare("INSERT INTO shipment_fee_shares (shipment_id, order_id, units, grams, fee) VALUES (?, ?, ?, ?, ?)");
    for (const p of parts) ins.run(shipmentId, p.key, p.units, p.grams, shares.get(p.key) ?? 0);
    // an empty run still keeps its fee: all of it is a stock cost
    if (!parts.length) ins.run(shipmentId, "", 0, 0, Math.round(input.fee));
  });
  return getShopFees([shipmentId], db).get(shipmentId) ?? null;
}

/** Removes the fee of a run (and its split); returns the receipt files so the caller deletes them. */
export function clearShopFee(shipmentId: number, db: DatabaseSync = getDb()): ShopFeeFile[] | null {
  const r = db.prepare("SELECT shop_fee_files FROM shipments WHERE id = ?").get(shipmentId) as { shop_fee_files: string } | undefined;
  if (!r) return null;
  withTransaction(db, () => {
    db.prepare("UPDATE shipments SET shop_fee = NULL, shop_fee_at = NULL, shop_fee_note = '', shop_fee_files = '[]', shop_fee_by = '', updated_at = ? WHERE id = ?").run(new Date().toISOString(), shipmentId);
    db.prepare("DELETE FROM shipment_fee_shares WHERE shipment_id = ?").run(shipmentId);
  });
  return parseFiles(r.shop_fee_files);
}

export function addShopFeeFiles(shipmentId: number, files: ShopFeeFile[], db: DatabaseSync = getDb()): void {
  const r = db.prepare("SELECT shop_fee_files FROM shipments WHERE id = ?").get(shipmentId) as { shop_fee_files: string } | undefined;
  if (!r) return;
  db.prepare("UPDATE shipments SET shop_fee_files = ? WHERE id = ?").run(JSON.stringify([...parseFiles(r.shop_fee_files), ...files]), shipmentId);
}

export function removeShopFeeFile(shipmentId: number, path: string, db: DatabaseSync = getDb()): ShopFeeFile | null {
  const r = db.prepare("SELECT shop_fee_files FROM shipments WHERE id = ?").get(shipmentId) as { shop_fee_files: string } | undefined;
  const files = parseFiles(r?.shop_fee_files);
  const f = files.find((x) => x.path === path) ?? null;
  if (!r || !f) return null;
  db.prepare("UPDATE shipments SET shop_fee_files = ? WHERE id = ?").run(JSON.stringify(files.filter((x) => x.path !== path)), shipmentId);
  return f;
}

/** Fees (with their split) of the given runs that have one. */
export function getShopFees(shipmentIds: number[], db: DatabaseSync = getDb()): Map<number, ShopFee> {
  const out = new Map<number, ShopFee>();
  const ids = [...new Set(shipmentIds)].filter((n) => Number.isInteger(n));
  if (!ids.length) return out;
  const ph = ids.map(() => "?").join(",");
  const runs = db.prepare(`SELECT id, shop_fee, shop_fee_at, shop_fee_note, shop_fee_files, shop_fee_by FROM shipments WHERE id IN (${ph}) AND shop_fee IS NOT NULL`).all(...ids) as Array<{ id: number; shop_fee: number; shop_fee_at: string | null; shop_fee_note: string; shop_fee_files: string; shop_fee_by: string }>;
  if (!runs.length) return out;
  const shares = db
    .prepare(
      `SELECT s.shipment_id, s.order_id, s.units, s.grams, s.fee, o.number, TRIM(COALESCE(o.last_name, '') || ' ' || COALESCE(o.first_name, '')) AS customer
         FROM shipment_fee_shares s LEFT JOIN orders o ON o.id = s.order_id
        WHERE s.shipment_id IN (${ph}) ORDER BY s.shipment_id, CASE WHEN s.order_id = '' THEN 1 ELSE 0 END, o.number`,
    )
    .all(...ids) as Array<{ shipment_id: number; order_id: string; units: number; grams: number; fee: number; number: number | null; customer: string | null }>;
  for (const r of runs)
    out.set(r.id, {
      shipmentId: r.id,
      fee: Number(r.shop_fee),
      paidAt: r.shop_fee_at ?? "",
      note: r.shop_fee_note ?? "",
      files: parseFiles(r.shop_fee_files),
      by: r.shop_fee_by ?? "",
      shares: shares
        .filter((s) => s.shipment_id === r.id)
        .map((s) => ({ orderId: s.order_id, orderNumber: s.order_id ? (s.number ?? null) : null, customer: s.order_id ? (s.customer ?? "") : "", units: Number(s.units), grams: Number(s.grams), fee: Number(s.fee) })),
    });
  return out;
}

/** Per order: its actual ③ fee (Σ shares over every run with a recorded fee) and the runs it came from. */
export function orderShopFees(orderIds: string[], db: DatabaseSync = getDb()): Map<string, { fee: number; runs: string[] }> {
  const out = new Map<string, { fee: number; runs: string[] }>();
  const ids = [...new Set(orderIds)].filter(Boolean);
  if (!ids.length) return out;
  const rows = db
    .prepare(`SELECT s.order_id, s.fee, sh.code FROM shipment_fee_shares s JOIN shipments sh ON sh.id = s.shipment_id WHERE sh.shop_fee IS NOT NULL AND s.order_id IN (${ids.map(() => "?").join(",")}) ORDER BY sh.id`)
    .all(...ids) as Array<{ order_id: string; fee: number; code: string }>;
  for (const r of rows) {
    const cur = out.get(r.order_id) ?? { fee: 0, runs: [] };
    cur.fee += Number(r.fee);
    cur.runs.push(r.code);
    out.set(r.order_id, cur);
  }
  return out;
}

/** The stock part of the recorded fees paid between two shop days (inclusive), in total and by month (YYYY-MM). */
export function stockShopFees(fromDay: string, toDay: string, db: DatabaseSync = getDb()): { total: number; byMonth: Map<string, number> } {
  const rows = db
    .prepare(`SELECT sh.shop_fee_at AS at, s.fee FROM shipment_fee_shares s JOIN shipments sh ON sh.id = s.shipment_id WHERE sh.shop_fee IS NOT NULL AND s.order_id = '' AND sh.shop_fee_at >= ? AND sh.shop_fee_at <= ?`)
    .all(fromDay, toDay) as Array<{ at: string; fee: number }>;
  const byMonth = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    total += Number(r.fee);
    const k = r.at.slice(0, 7);
    byMonth.set(k, (byMonth.get(k) ?? 0) + Number(r.fee));
  }
  return { total, byMonth };
}
