import "server-only";
import { getDb } from "./sqlite";

export interface ProductStockStats {
  /** Pieces in hand (bought in Japan … at the shop in VN), not written off. */
  inHand: number;
  /** Of which held for an order line. */
  held: number;
  /** Of which free (nobody's yet). */
  free: number;
  /** Of which free at Kho VN (what the storefront calls "Có sẵn"). */
  freeVn: number;
  /** Pieces in open orders (not cancelled, not delivered yet) and how many orders. */
  selling: number;
  sellingOrders: number;
  /** Pieces in delivered orders (not cancelled) and how many orders. */
  sold: number;
  soldOrders: number;
}

/** Tồn kho · Đang bán · Đã bán of one product, straight from the units and the order lines. */
export function productStockStats(productId: number): ProductStockStats {
  const db = getDb();
  const u = db
    .prepare(
      `SELECT COUNT(*) AS in_hand,
              SUM(CASE WHEN order_item_id IS NOT NULL THEN 1 ELSE 0 END) AS held,
              SUM(CASE WHEN order_item_id IS NULL AND status = 'at_shop' THEN 1 ELSE 0 END) AS free_vn
         FROM stock_units
        WHERE product_id = ? AND removed IS NULL AND status IN ('bought','to_carrier_jp','shipped_jp_vn','at_carrier_vn','to_shop','at_shop')`,
    )
    .get(productId) as { in_hand: number; held: number | null; free_vn: number | null };
  const o = db
    .prepare(
      `SELECT SUM(CASE WHEN o.ship_stage = 'delivered' THEN oi.quantity ELSE 0 END) AS sold,
              COUNT(DISTINCT CASE WHEN o.ship_stage = 'delivered' THEN o.id END) AS sold_orders,
              SUM(CASE WHEN o.ship_stage <> 'delivered' THEN oi.quantity ELSE 0 END) AS selling,
              COUNT(DISTINCT CASE WHEN o.ship_stage <> 'delivered' THEN o.id END) AS selling_orders
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = ? AND o.status <> 'cancelled'`,
    )
    .get(productId) as { sold: number | null; sold_orders: number; selling: number | null; selling_orders: number };
  const held = u.held ?? 0;
  return {
    inHand: u.in_hand,
    held,
    free: u.in_hand - held,
    freeVn: u.free_vn ?? 0,
    selling: o.selling ?? 0,
    sellingOrders: o.selling_orders,
    sold: o.sold ?? 0,
    soldOrders: o.sold_orders,
  };
}
