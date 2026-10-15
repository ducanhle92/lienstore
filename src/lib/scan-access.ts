import { DomainError } from "@/lib/service-error";

/**
 * Which shop warehouses an account may WRITE to from the scan screen / API (pure). Kho Nhật needs the "③ Kho Nhật"
 * screen permission (kho_jp), Kho VN "⑥ Kho VN" (kho_vn); owner/admin hold both. Picking for delivery needs "delivery".
 */
export type ShopWarehouse = "jp" | "vn";
export const SHOP_WAREHOUSES: ShopWarehouse[] = ["vn", "jp"];
export const WAREHOUSE_MODULE: Record<ShopWarehouse, string> = { jp: "kho_jp", vn: "kho_vn" };

export const isShopWarehouse = (v: unknown): v is ShopWarehouse => v === "jp" || v === "vn";

export function allowedWarehouses(permissions: string[]): ShopWarehouse[] {
  return SHOP_WAREHOUSES.filter((w) => permissions.includes(WAREHOUSE_MODULE[w]));
}

export function requireWarehouse(permissions: string[], w: unknown): ShopWarehouse {
  if (!isShopWarehouse(w)) throw new DomainError(422, "VALIDATION_FAILED", 'Kho: "vn" (Kho Việt Nam) hoặc "jp" (Kho Nhật).', { fields: { warehouse: "vn | jp" } });
  if (!permissions.includes(WAREHOUSE_MODULE[w])) throw new DomainError(403, "WAREHOUSE_FORBIDDEN", `Tài khoản không có quyền ghi ở ${w === "vn" ? "Kho VN" : "Kho Nhật"}.`, { warehouse: w });
  return w;
}

export function requireDelivery(permissions: string[]): void {
  if (!permissions.includes("delivery")) throw new DomainError(403, "FORBIDDEN", "Tài khoản không có quyền ⑦ Giao hàng VN.");
}
