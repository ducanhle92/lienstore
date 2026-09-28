import type { DatabaseSync } from "node:sqlite";
import { listLotViews } from "./lots-db";
import { shipmentEditable, isShipmentStatus } from "./shipments";

/**
 * The import flow the owner works through, left to right:
 * ① Quản lý mua hàng → ② Tồn kho Nhật → ③ Đóng hàng → ④ Vận chuyển → ⑤ Tồn kho VN.
 * One number per step (units physically at that step) for the step bar on top of those pages.
 */
export type FlowStep = "buy" | "jp" | "pack" | "transit" | "vn";

export interface FlowCounts {
  /** Order lines (open orders) not bought yet — units. */
  toBuy: number;
  /** Purchase batches not yet at the VN shop. */
  openBatches: number;
  /** On the shelf of Kho Nhật (shop), not boxed. */
  jp: number;
  /** Boxed in a packing run that has not left the shop. */
  pack: number;
  /** With the carrier: JP carrier warehouse, flying, carrier warehouse in VN. */
  transit: number;
  /** At the VN shop. */
  vn: number;
  /** Open packing runs / runs on the way. */
  packRuns: number;
  transitRuns: number;
}

export function flowCounts(db: DatabaseSync): FlowCounts {
  const c: FlowCounts = { toBuy: 0, openBatches: 0, jp: 0, pack: 0, transit: 0, vn: 0, packRuns: 0, transitRuns: 0 };
  for (const l of listLotViews(db)) {
    if (l.warehouse === "vn") c.vn += l.physical;
    else if (l.warehouse === "jp") {
      if (l.shipmentId && isShipmentStatus(l.shipmentStatus) && shipmentEditable(l.shipmentStatus)) c.pack += l.physical;
      else c.jp += l.physical;
    } else c.transit += l.physical;
  }
  const buy = db
    .prepare("SELECT COALESCE(SUM(oi.quantity), 0) AS n FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status IN ('pending','processing') AND COALESCE(oi.purchase_status, 'not_bought') IN ('not_bought','ordered')")
    .get() as { n: number };
  c.toBuy = Number(buy.n);
  c.openBatches = Number((db.prepare("SELECT COUNT(*) AS n FROM purchase_batches WHERE status <> 'at_shop'").get() as { n: number }).n);
  const runs = db.prepare("SELECT status, COUNT(*) AS n FROM shipments WHERE status <> 'done' GROUP BY status").all() as Array<{ status: string; n: number }>;
  for (const r of runs) {
    if (r.status === "packing" || r.status === "packed") c.packRuns += Number(r.n);
    else c.transitRuns += Number(r.n);
  }
  return c;
}
