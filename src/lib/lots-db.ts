import type { DatabaseSync } from "node:sqlite";
import { getDb } from "./sqlite";
import { DEFAULT_WAREHOUSE, isWarehouse, WAREHOUSE_SIDE, type Warehouse } from "./warehouses";

/**
 * Lot-level view of Kho hàng: one row per lot with its product, reservations, free units and shipment.
 * Read side only; moves / splits / batch membership live in db.ts and purchase-batches-db.ts.
 */

export interface LotReservation {
  orderId: string;
  orderNumber: number;
  qty: number;
  /** The order paid / COD-granted (its units must travel with the lot). */
  committed: boolean;
  consumed: boolean;
}

export interface LotView {
  id: number;
  productId: number;
  productName: string;
  productSku: string | null;
  productThumb: string;
  qtyIn: number;
  qtyLeft: number;
  receivedAt: string;
  boughtAt: string | null;
  sourceKey: string;
  unitCostJpy: number | null;
  unitCostVnd: number | null;
  expiry: string | null;
  warehouse: Warehouse;
  inTransit: boolean;
  location: string;
  note: string;
  batchId: number | null;
  batchCode: string;
  batchStatus: string;
  parentLotId: number | null;
  purchaseId: number | null;
  /** Bill the lot was bought on (via its slip), if any. */
  receiptId: number | null;
  receiptCode: string;
  reserved: LotReservation[];
  /** Units reserved but not deducted. */
  reservedQty: number;
  /** Units already deducted for paid / COD orders that are still physically in the lot (order not handed over yet). */
  heldQty: number;
  /** qty_left + heldQty — what is actually on the shelf. */
  physical: number;
  /** qty_left − reserved (what a new order could still take). */
  free: number;
}

interface Row {
  id: number;
  product_id: number;
  name: string;
  sku: string | null;
  thumb: string | null;
  qty_in: number;
  qty_left: number;
  received_at: string;
  bought_at: string | null;
  source_key: string;
  unit_cost_jpy: number | null;
  unit_cost_vnd: number | null;
  expiry: string | null;
  warehouse: string;
  in_transit: number | null;
  location: string;
  note: string;
  batch_id: number | null;
  batch_code: string | null;
  batch_status: string | null;
  parent_lot_id: number | null;
  purchase_id: number | null;
  receipt_id: number | null;
  receipt_code: string | null;
}

/** Every lot with units left (or of one product / one side), FEFO, with who holds them. */
export function listLotViews(db: DatabaseSync, opts: { productId?: number; side?: "jp" | "vn"; includeEmpty?: boolean } = {}): LotView[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.productId !== undefined) {
    where.push("l.product_id = ?");
    args.push(opts.productId);
  }
  // a lot whose unsold units are gone still shows while it holds goods of paid orders that have not left the shop
  if (!opts.includeEmpty) where.push(`(l.qty_left > 0 OR EXISTS (SELECT 1 FROM order_item_allocations a JOIN order_items oi ON oi.id = a.order_item_id JOIN orders o ON o.id = oi.order_id WHERE a.source_type = 'lot' AND a.source_id = l.id AND a.consumed_at IS NOT NULL AND o.status <> 'cancelled' AND o.ship_stage NOT IN ('delivering','delivered')))`);
  const rows = db
    .prepare(
      `SELECT l.*, p.name, p.sku, p.thumb, b.code AS batch_code, b.status AS batch_status,
              (SELECT r.id FROM stock_purchases sp JOIN purchase_receipts r ON r.id = sp.receipt_id WHERE sp.lot_id = l.id LIMIT 1) AS receipt_id,
              (SELECT r.code FROM stock_purchases sp JOIN purchase_receipts r ON r.id = sp.receipt_id WHERE sp.lot_id = l.id LIMIT 1) AS receipt_code
       FROM stock_lots l JOIN products p ON p.id = l.product_id LEFT JOIN purchase_batches b ON b.id = l.batch_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY CASE WHEN l.expiry IS NULL THEN 1 ELSE 0 END, l.expiry, l.received_at, l.id`,
    )
    .all(...(args as never[])) as unknown as Row[];
  const ids = rows.map((r) => r.id);
  const res = new Map<number, LotReservation[]>();
  if (ids.length) {
    const ph = ids.map(() => "?").join(",");
    const rr = db
      .prepare(
        `SELECT a.source_id, a.qty, a.consumed_at, o.id AS order_id, o.number, o.stock_committed_at FROM order_item_allocations a
         JOIN order_items oi ON oi.id = a.order_item_id JOIN orders o ON o.id = oi.order_id
         WHERE a.source_type = 'lot' AND a.source_id IN (${ph}) AND o.status <> 'cancelled' AND (a.consumed_at IS NULL OR o.ship_stage NOT IN ('delivering','delivered')) ORDER BY o.number`,
      )
      .all(...ids) as unknown as Array<{ source_id: number; qty: number; consumed_at: string | null; order_id: string; number: number; stock_committed_at: string | null }>;
    for (const r of rr) res.set(r.source_id, [...(res.get(r.source_id) ?? []), { orderId: r.order_id, orderNumber: r.number, qty: r.qty, committed: !!r.stock_committed_at, consumed: !!r.consumed_at }]);
  }
  const out: LotView[] = rows.map((r) => {
    const wh = isWarehouse(r.warehouse) ? r.warehouse : DEFAULT_WAREHOUSE;
    const reserved = res.get(r.id) ?? [];
    const reservedQty = reserved.filter((x) => !x.consumed).reduce((n, x) => n + x.qty, 0);
    const heldQty = reserved.filter((x) => x.consumed).reduce((n, x) => n + x.qty, 0);
    return {
      id: r.id,
      productId: r.product_id,
      productName: r.name,
      productSku: r.sku,
      productThumb: r.thumb ?? "",
      qtyIn: r.qty_in,
      qtyLeft: r.qty_left,
      receivedAt: r.received_at,
      boughtAt: r.bought_at,
      sourceKey: r.source_key,
      unitCostJpy: r.unit_cost_jpy,
      unitCostVnd: r.unit_cost_vnd,
      expiry: r.expiry,
      warehouse: wh,
      inTransit: (r.in_transit ?? 0) === 1,
      location: r.location ?? "",
      note: r.note ?? "",
      batchId: r.batch_id,
      batchCode: r.batch_code ?? "",
      batchStatus: r.batch_status ?? "",
      parentLotId: r.parent_lot_id,
      purchaseId: r.purchase_id,
      receiptId: r.receipt_id ?? null,
      receiptCode: r.receipt_code ?? "",
      reserved,
      reservedQty,
      heldQty,
      physical: r.qty_left + heldQty,
      free: Math.max(0, r.qty_left - reservedQty),
    };
  });
  return opts.side ? out.filter((l) => WAREHOUSE_SIDE[l.warehouse] === opts.side) : out;
}

export interface LotTotals {
  lots: number;
  atShop: number;
  atCarrier: number;
  reserved: number;
  free: number;
  costVnd: number;
}
/** Tiles for one side of Kho hàng (shop warehouse vs carrier warehouse of that side). */
export function lotTotals(lots: LotView[], side: "jp" | "vn"): LotTotals {
  const shop: Warehouse = side === "jp" ? "jp" : "vn";
  const t: LotTotals = { lots: 0, atShop: 0, atCarrier: 0, reserved: 0, free: 0, costVnd: 0 };
  for (const l of lots) {
    if (WAREHOUSE_SIDE[l.warehouse] !== side) continue;
    t.lots++;
    if (l.warehouse === shop) t.atShop += l.physical;
    else t.atCarrier += l.physical;
    t.reserved += l.reservedQty + l.heldQty;
    t.free += l.free;
    t.costVnd += (l.unitCostVnd ?? 0) * l.qtyLeft;
  }
  return t;
}

export async function listAllLotViews(opts: { productId?: number; side?: "jp" | "vn"; includeEmpty?: boolean } = {}): Promise<LotView[]> {
  return listLotViews(getDb(), opts);
}

export interface OrderReadyToShip {
  orderId: string;
  orderNumber: number;
  customerName: string;
  paymentMethod: string;
  units: number;
  lots: number[];
}

/** Paid / COD orders whose every unit sits in a lot at Kho Việt Nam (shop) and that have not left for the customer yet. */
export function listOrdersReadyToShip(db: DatabaseSync): OrderReadyToShip[] {
  const rows = db
    .prepare(
      `SELECT o.id, o.number, o.first_name, o.last_name, o.payment_method, a.qty, a.source_id, l.warehouse, l.in_transit, a.source_type
       FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN order_item_allocations a ON a.order_item_id = oi.id
       LEFT JOIN stock_lots l ON l.id = a.source_id AND a.source_type = 'lot'
       WHERE o.status IN ('pending','processing') AND o.stock_committed_at IS NOT NULL AND o.ship_stage NOT IN ('delivering','delivered')
       ORDER BY o.created_at, o.id`,
    )
    .all() as unknown as Array<{ id: string; number: number; first_name: string; last_name: string; payment_method: string; qty: number; source_id: number | null; warehouse: string | null; in_transit: number | null; source_type: string }>;
  const byOrder = new Map<string, { o: OrderReadyToShip; ok: boolean }>();
  for (const r of rows) {
    const g = byOrder.get(r.id) ?? { o: { orderId: r.id, orderNumber: r.number, customerName: `${r.last_name} ${r.first_name}`.trim(), paymentMethod: r.payment_method, units: 0, lots: [] }, ok: true };
    const atShop = r.source_type === "lot" && (r.warehouse === "vn" || r.warehouse === null) && !r.in_transit;
    if (!atShop) g.ok = false;
    g.o.units += r.qty;
    if (r.source_id && !g.o.lots.includes(r.source_id)) g.o.lots.push(r.source_id);
    byOrder.set(r.id, g);
  }
  return [...byOrder.values()].filter((g) => g.ok).map((g) => g.o);
}
