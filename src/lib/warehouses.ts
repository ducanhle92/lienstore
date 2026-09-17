import { PURCHASE_STAGES, type PurchaseStatus } from "./purchase";

/**
 * Physical warehouses the shop's goods sit in (Kho hàng): the shop's own warehouse in Japan (Chiba), the forwarding
 * carrier's warehouse (Kiến Express — Japan side before the flight, Hà Nội after it) and the shop warehouse in Vietnam
 * (Hoằng Hóa, Thanh Hóa). Every stock lot belongs to one of them; goods on the way are placed by their purchase status.
 * Pure helpers (no DB).
 */
export type Warehouse = "jp" | "carrier" | "vn";
export const WAREHOUSES: readonly Warehouse[] = ["jp", "carrier", "vn"];
export const WAREHOUSE_LABEL: Record<Warehouse, string> = { jp: "Kho Nhật", carrier: "Kho ĐVVC", vn: "Kho Việt Nam" };
export const WAREHOUSE_SHORT: Record<Warehouse, string> = { jp: "Nhật", carrier: "ĐVVC", vn: "VN" };
export const WAREHOUSE_HINT: Record<Warehouse, string> = {
  jp: "Kho của shop tại Nhật (Chiba) — hàng gom chờ gửi về",
  carrier: "Kho đơn vị vận chuyển (Kiến Express) — đã giao cho ĐVVC, chưa về kho shop",
  vn: "Kho shop tại Việt Nam (Hoằng Hóa, Thanh Hóa) — hàng bán ra từ đây",
};
/** Default warehouse for a lot when none is given: the shop warehouse in Vietnam. */
export const DEFAULT_WAREHOUSE: Warehouse = "vn";

export function isWarehouse(v: unknown): v is Warehouse {
  return typeof v === "string" && (WAREHOUSES as readonly string[]).includes(v);
}

/** Accepts a key ("jp"), a label ("Kho Nhật"), or a short form ("Nhật", "VN", "ĐVVC"); null when unknown. */
export function parseWarehouse(raw: string): Warehouse | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (isWarehouse(v)) return v;
  if (/nh[aậ]t|japan|jp\b|日本/.test(v)) return "jp";
  if (/[dđ]vvc|carrier|ki[eế]n|v[aậ]n chuy[eể]n|logistic/.test(v)) return "carrier";
  if (/vi[eệ]t|\bvn\b|shop|thanh h[oó]a/.test(v)) return "vn";
  return null;
}

/** Where goods bought for stock physically are while on the way: the shop's Japan side, in the air/sea, or at the carrier's Vietnam warehouse. */
export type TransitWhere = "jp" | "transit" | "carrier";
export const TRANSIT_LABEL: Record<TransitWhere, string> = { jp: "tại Nhật", transit: "NB → VN", carrier: "kho ĐVVC VN" };

/** In-transit location of a purchase status; null when the goods are not on the way (not bought / at the shop / with the customer). */
export function transitWhereOf(status: PurchaseStatus): TransitWhere | null {
  const w = PURCHASE_STAGES.find((s) => s.key === status)?.where;
  if (w === "jp") return "jp";
  if (w === "transit") return "transit";
  if (w === "vn_carrier") return "carrier";
  return null;
}

export const emptyByWarehouse = (): Record<Warehouse, number> => ({ jp: 0, carrier: 0, vn: 0 });
export const emptyByTransit = (): Record<TransitWhere, number> => ({ jp: 0, transit: 0, carrier: 0 });

/** "Kho VN 5 · Kho Nhật 2" — non-zero warehouses only, biggest first. */
export function describeByWarehouse(by: Record<Warehouse, number>): string {
  return WAREHOUSES.filter((w) => by[w] > 0)
    .sort((a, b) => by[b] - by[a])
    .map((w) => `${WAREHOUSE_LABEL[w]} ${by[w]}`)
    .join(" · ");
}
