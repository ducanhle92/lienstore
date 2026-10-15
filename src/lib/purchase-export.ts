import type { DatabaseSync } from "node:sqlite";

export interface PurchaseNeed {
  productId: number;
  orderQuantity: number;
  stockQuantity: number;
  quantity: number;
  orders: string[];
}

/** Actual unbought demand, not automatic stock replenishment.
 * Assigned units still cover an open order after commitment/delivery.
 * Assigned planned units are included in the order deficit, never again as free stock.
 */
export function getCurrentPurchaseNeeds(db: DatabaseSync): PurchaseNeed[] {
  const rows = db.prepare(`SELECT oi.product_id AS productId, o.number,
    MAX(0, oi.quantity - (SELECT COUNT(*) FROM stock_units u
      WHERE u.order_item_id = oi.id AND u.removed IS NULL AND u.status <> 'not_bought')) AS quantity
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status IN ('pending', 'processing') ORDER BY o.number, oi.id
  `).all() as Array<{ productId: number; number: number; quantity: number }>;
  const needs = new Map<number, PurchaseNeed>();
  const entry = (productId: number) => {
    let n = needs.get(productId);
    if (!n) {
      n = { productId, orderQuantity: 0, stockQuantity: 0, quantity: 0, orders: [] };
      needs.set(productId, n);
    }
    return n;
  };
  for (const row of rows) {
    if (row.quantity <= 0) continue;
    const n = entry(row.productId);
    n.orderQuantity += row.quantity;
    n.quantity += row.quantity;
    n.orders.push(`#${row.number}x${row.quantity}`);
  }
  const planned = db.prepare(`SELECT product_id AS productId, COUNT(*) AS quantity
    FROM stock_units WHERE removed IS NULL AND order_item_id IS NULL AND status = 'not_bought'
    GROUP BY product_id`).all() as Array<{ productId: number; quantity: number }>;
  for (const row of planned) {
    const n = entry(row.productId);
    n.stockQuantity = row.quantity;
    n.quantity += row.quantity;
  }
  return [...needs.values()].sort((a, b) => b.quantity - a.quantity || a.productId - b.productId);
}

export function purchaseCsv(rows: unknown[][]): string {
  return "\uFEFF" + rows.map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

/** A barcode-like SKU (only digits, 8+ long) as an Excel text formula ="4901…" — otherwise Excel shows 4.98705E+12. */
export const excelText = (v: string): string => (/^\d{8,}$/.test(v) ? `="${v}"` : v);

export const PURCHASE_CSV_HEADER = ["ID", "Tên sản phẩm", "SKU", "Cần mua theo đơn", "Cần mua lưu kho", "Còn thiếu", "Đơn hàng", "Giá vốn (VNĐ)", "Tổng vốn (VNĐ)", "Link mua"];

/**
 * Rows of "Xuất CSV cần mua": per product what open orders still lack, what is planned for stock, and "Còn thiếu" =
 * the sum of both (what has to be bought); then the orders, cost price, total cost (Còn thiếu × giá vốn) and the link.
 */
export function purchaseCsvRows(needs: PurchaseNeed[], product: (id: number) => { name: string; sku: string; costPrice: number | null; supplierUrl: string } | undefined): unknown[][] {
  return needs.map((n) => {
    const p = product(n.productId);
    return [n.productId, p?.name ?? `Sản phẩm #${n.productId}`, excelText(p?.sku ?? ""), n.orderQuantity, n.stockQuantity, n.quantity, n.orders.join(" "), p?.costPrice ?? "", p?.costPrice == null ? "" : n.quantity * p.costPrice, p?.supplierUrl ?? ""];
  });
}

