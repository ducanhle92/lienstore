import type { DatabaseSync } from "node:sqlite";
import type { PurchaseStatus } from "./purchase";
import { getDb } from "./sqlite";
import { billLineKey, expiryEnd } from "./units";
import { listUnits, type UnitFilter, type UnitView } from "./units-db";

/**
 * Stock groups: units of one bill line that sit at the same place (and in the same packing run) — the rows of
 * Tồn kho / Đóng hàng / Mua theo đợt. Every group expands to its units (codes H…). Read side only.
 */

export interface GroupHolder {
  orderId: string;
  orderNumber: number;
  customer: string;
  itemId: number;
  qty: number;
  /** The order paid / COD-granted (deducted). */
  committed: boolean;
}

export interface StockGroup {
  key: string;
  units: UnitView[];
  unitIds: number[];
  codes: string[];
  productId: number;
  productName: string;
  productSku: string | null;
  productThumb: string;
  productWeightG: number | null;
  groupCode: string;
  status: PurchaseStatus;
  receiptId: number | null;
  receiptCode: string;
  batchId: number | null;
  batchCode: string;
  shipmentId: number | null;
  shipmentCode: string;
  shipmentStatus: string;
  sourceKey: string;
  store: string;
  boughtAt: string | null;
  expiry: string | null;
  unitCostJpy: number | null;
  unitCostVnd: number | null;
  qty: number;
  holders: GroupHolder[];
  /** Units held for orders (reserved or deducted). */
  heldQty: number;
  /** Of which deducted (paid / COD). */
  committedQty: number;
  free: number;
}

/** Statuses shown on each side of Tồn kho. */
export const SIDE_STATUSES: Record<"jp" | "vn", PurchaseStatus[]> = { jp: ["bought", "to_carrier_jp", "shipped_jp_vn"], vn: ["at_carrier_vn", "to_shop", "at_shop"] };

/** Group units (already loaded) by bill line + place + packing run; FEFO within a product. */
export function groupUnits(units: UnitView[]): StockGroup[] {
  const map = new Map<string, UnitView[]>();
  for (const u of units) {
    const k = `${billLineKey(u)}|${u.status}|${u.shipmentId ?? "-"}`;
    const g = map.get(k);
    if (g) g.push(u);
    else map.set(k, [u]);
  }
  const out: StockGroup[] = [];
  for (const [key, us] of map) {
    const u = us[0];
    const holders = new Map<number, GroupHolder>();
    for (const x of us) {
      if (!x.itemId || !x.orderId) continue;
      const h = holders.get(x.itemId) ?? { orderId: x.orderId, orderNumber: x.orderNumber ?? 0, customer: x.customerName, itemId: x.itemId, qty: 0, committed: false };
      h.qty++;
      h.committed = h.committed || x.committed;
      holders.set(x.itemId, h);
    }
    const heldQty = us.filter((x) => x.itemId).length;
    out.push({
      key,
      units: us,
      unitIds: us.map((x) => x.id),
      codes: us.map((x) => x.code),
      productId: u.productId,
      productName: u.productName,
      productSku: u.productSku,
      productThumb: u.productThumb,
      productWeightG: u.productWeightG,
      groupCode: u.groupCode,
      status: u.status,
      receiptId: u.receiptId,
      receiptCode: u.receiptCode,
      batchId: u.batchId,
      batchCode: u.batchCode,
      shipmentId: u.shipmentId,
      shipmentCode: u.shipmentCode,
      shipmentStatus: u.shipmentStatus,
      sourceKey: u.sourceKey,
      store: u.store,
      boughtAt: u.boughtAt,
      expiry: u.expiry,
      unitCostJpy: u.unitCostJpy,
      unitCostVnd: u.unitCostVnd,
      qty: us.length,
      holders: [...holders.values()].sort((a, b) => a.orderNumber - b.orderNumber),
      heldQty,
      committedQty: us.filter((x) => x.itemId && x.committed).length,
      free: us.length - heldQty,
    });
  }
  const exp = (g: StockGroup) => (g.expiry ? expiryEnd(g.expiry) : "9999-12-31");
  return out.sort((a, b) => a.productName.localeCompare(b.productName, "vi") || exp(a).localeCompare(exp(b)) || (a.boughtAt ?? "").localeCompare(b.boughtAt ?? "") || a.unitIds[0] - b.unitIds[0]);
}

export function listStockGroups(db: DatabaseSync, f: UnitFilter & { side?: "jp" | "vn" } = {}): StockGroup[] {
  const { side, ...rest } = f;
  return groupUnits(listUnits(db, side ? { ...rest, statuses: rest.statuses ?? SIDE_STATUSES[side] } : rest));
}

export async function listAllStockGroups(f: UnitFilter & { side?: "jp" | "vn" } = {}): Promise<StockGroup[]> {
  return listStockGroups(getDb(), f);
}

export interface GroupTotals {
  groups: number;
  /** Units at the shop's own warehouse of that side (Kho Nhật / Kho VN). */
  atShop: number;
  /** Units with the carrier on that side (kho ĐVVC, in the air, on the truck). */
  atCarrier: number;
  held: number;
  free: number;
  costVnd: number;
}
/** Tiles for one side of Tồn kho. */
export function groupTotals(groups: StockGroup[], side: "jp" | "vn"): GroupTotals {
  const shop: PurchaseStatus = side === "jp" ? "bought" : "at_shop";
  const t: GroupTotals = { groups: 0, atShop: 0, atCarrier: 0, held: 0, free: 0, costVnd: 0 };
  for (const g of groups) {
    if (!SIDE_STATUSES[side].includes(g.status)) continue;
    t.groups++;
    if (g.status === shop) t.atShop += g.qty;
    else t.atCarrier += g.qty;
    t.held += g.heldQty;
    t.free += g.free;
    t.costVnd += (g.unitCostVnd ?? 0) * g.free;
  }
  return t;
}

export interface OrderReadyToShip {
  orderId: string;
  orderNumber: number;
  customerName: string;
  paymentMethod: string;
  units: number;
  codes: string[];
}

/** Paid / COD orders whose every unit is at Kho Việt Nam (shop) and that have not left for the customer yet. */
export function listOrdersReadyToShip(db: DatabaseSync): OrderReadyToShip[] {
  const rows = db
    .prepare(
      `SELECT o.id, o.number, o.first_name, o.last_name, o.payment_method, oi.id AS item_id, oi.quantity,
              (SELECT COUNT(*) FROM stock_units u WHERE u.order_item_id = oi.id AND u.removed IS NULL AND u.status = 'at_shop') AS at_shop,
              (SELECT GROUP_CONCAT(u.code, ' ') FROM stock_units u WHERE u.order_item_id = oi.id AND u.removed IS NULL) AS codes
       FROM orders o JOIN order_items oi ON oi.order_id = o.id
       WHERE o.status IN ('pending','processing') AND o.stock_committed_at IS NOT NULL AND o.ship_stage NOT IN ('delivering','delivered')
       ORDER BY o.created_at, o.id`,
    )
    .all() as unknown as Array<{ id: string; number: number; first_name: string; last_name: string; payment_method: string; item_id: number; quantity: number; at_shop: number; codes: string | null }>;
  const byOrder = new Map<string, { o: OrderReadyToShip; ok: boolean }>();
  for (const r of rows) {
    const g = byOrder.get(r.id) ?? { o: { orderId: r.id, orderNumber: r.number, customerName: `${r.last_name} ${r.first_name}`.trim(), paymentMethod: r.payment_method, units: 0, codes: [] }, ok: true };
    if (Number(r.at_shop) < r.quantity) g.ok = false;
    g.o.units += r.quantity;
    g.o.codes.push(...(r.codes ?? "").split(" ").filter(Boolean));
    byOrder.set(r.id, g);
  }
  return [...byOrder.values()].filter((g) => g.ok).map((g) => g.o);
}
