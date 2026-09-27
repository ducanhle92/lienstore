import type { DatabaseSync } from "node:sqlite";

/**
 * products.stock = what the storefront may still sell: units left in every lot (VN, ĐVVC and Nhật — bought is bought)
 * minus units reserved for open orders that have not been deducted yet (order_item_allocations on lots, not consumed,
 * order not cancelled). Only products that have lots are tracked; others keep NULL ("Hàng order").
 */
export function syncProductStock(db: DatabaseSync, productId: number, now: string): void {
  const r = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(qty_left), 0) AS s FROM stock_lots WHERE product_id = ?").get(productId) as { n: number; s: number };
  if (Number(r.n) === 0) return;
  const res = db
    .prepare(
      `SELECT COALESCE(SUM(a.qty), 0) AS q FROM order_item_allocations a
       JOIN order_items oi ON oi.id = a.order_item_id JOIN orders o ON o.id = oi.order_id
       WHERE a.source_type = 'lot' AND a.consumed_at IS NULL AND oi.product_id = ? AND o.status <> 'cancelled'`,
    )
    .get(productId) as { q: number };
  const stock = Math.max(0, Number(r.s) - Number(res.q));
  db.prepare("UPDATE products SET stock = ?, updated_at = ? WHERE id = ? AND (stock IS NULL OR stock <> ?)").run(stock, now, productId, stock);
}
