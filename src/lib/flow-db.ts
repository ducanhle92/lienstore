import type { DatabaseSync } from "node:sqlite";
import { listOrdersReadyToShip } from "./lots-db";

/**
 * The import flow the owner works through, left to right:
 * ① Đơn hàng → ② Quản lý mua hàng → ③ Tồn kho Nhật → ④ Đóng hàng JP → ⑤ Vận chuyển JP-VN → ⑥ Tồn kho VN → ⑦ Giao hàng VN.
 * One number per step (units physically at that step) for the step bar on top of those pages.
 */
export type FlowStep = "orders" | "buy" | "jp" | "pack" | "transit" | "vn" | "deliver";

export interface FlowCounts {
  /** Orders being handled (pending + processing) and, of them, those still waiting ("Chờ xử lý"). */
  openOrders: number;
  pendingOrders: number;
  /** Units open orders still need bought (lines not fully covered by units). */
  toBuy: number;
  /** Purchase batches not yet at the VN shop. */
  openBatches: number;
  /** On the shelf of Kho Nhật (shop), not boxed. */
  jp: number;
  /** Boxed in a packing run that has not left the shop. */
  pack: number;
  /** With the carrier: JP carrier warehouse, flying, carrier warehouse in VN, on the truck. */
  transit: number;
  /** At the VN shop. */
  vn: number;
  packRuns: number;
  transitRuns: number;
  /** ⑦ Giao hàng VN: paid / COD orders with every unit at Kho VN (shop), and orders out for delivery. */
  deliverReady: number;
  delivering: number;
}

export function flowCounts(db: DatabaseSync): FlowCounts {
  const c: FlowCounts = { openOrders: 0, pendingOrders: 0, toBuy: 0, openBatches: 0, jp: 0, pack: 0, transit: 0, vn: 0, packRuns: 0, transitRuns: 0, deliverReady: 0, delivering: 0 };
  const rows = db
    .prepare("SELECT u.status, (u.shipment_id IS NOT NULL AND s.status IN ('packing','packed')) AS boxed, COUNT(*) AS n FROM stock_units u LEFT JOIN shipments s ON s.id = u.shipment_id WHERE u.removed IS NULL GROUP BY u.status, boxed")
    .all() as Array<{ status: string; boxed: number; n: number }>;
  for (const r of rows) {
    const n = Number(r.n);
    if (r.status === "bought") {
      if (r.boxed) c.pack += n;
      else c.jp += n;
    } else if (["to_carrier_jp", "shipped_jp_vn", "at_carrier_vn", "to_shop"].includes(r.status)) c.transit += n;
    else if (r.status === "at_shop") c.vn += n;
  }
  c.toBuy = Number(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(oi.quantity - (SELECT COUNT(*) FROM stock_units u WHERE u.order_item_id = oi.id AND u.removed IS NULL)), 0) AS n
           FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status IN ('pending','processing')
           AND oi.quantity > (SELECT COUNT(*) FROM stock_units u WHERE u.order_item_id = oi.id AND u.removed IS NULL)`,
        )
        .get() as { n: number }
    ).n,
  );
  const o = db.prepare("SELECT COUNT(*) AS n, SUM(status = 'pending') AS p FROM orders WHERE status IN ('pending','processing')").get() as { n: number; p: number | null };
  c.openOrders = Number(o.n);
  c.pendingOrders = Number(o.p ?? 0);
  c.openBatches = Number((db.prepare("SELECT COUNT(*) AS n FROM purchase_batches WHERE status <> 'at_shop'").get() as { n: number }).n);
  for (const r of db.prepare("SELECT status, COUNT(*) AS n FROM shipments WHERE status <> 'done' GROUP BY status").all() as Array<{ status: string; n: number }>) {
    if (r.status === "packing" || r.status === "packed") c.packRuns += Number(r.n);
    else c.transitRuns += Number(r.n);
  }
  c.deliverReady = listOrdersReadyToShip(db).length;
  c.delivering = Number((db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status IN ('pending','processing') AND ship_stage = 'delivering'").get() as { n: number }).n);
  return c;
}
