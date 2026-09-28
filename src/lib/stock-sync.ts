import type { DatabaseSync } from "node:sqlite";
import { syncProductStockSync } from "./units-db";

/**
 * products.stock = what the storefront may still sell: units in hand (Kho Nhật → Kho VN, bought is bought) that no
 * open order holds. Only products that have units are tracked; others keep NULL ("Hàng order"). See lib/units-db.ts.
 */
export function syncProductStock(db: DatabaseSync, productId: number, now?: string): void {
  void now;
  syncProductStockSync(db, productId);
}
