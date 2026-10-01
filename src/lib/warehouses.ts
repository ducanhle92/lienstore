import { PURCHASE_STAGES, type PurchaseStatus } from "./purchase";

/**
 * The four places a stock lot can physically be (Kho hàng), in the order goods travel:
 *   jp (Kho Nhật — shop) → jp_carrier (Kho ĐVVC Nhật, Kiến Express) → carrier (Kho ĐVVC VN, Hà Nội) → vn (Kho Việt Nam — shop).
 * A lot at jp_carrier or carrier may also be `inTransit` (on the plane NB→VN, or on the truck to the shop).
 * Pure helpers (no DB).
 */
export type Warehouse = "jp" | "jp_carrier" | "carrier" | "vn";
export const WAREHOUSES: readonly Warehouse[] = ["jp", "jp_carrier", "carrier", "vn"];
export const WAREHOUSE_LABEL: Record<Warehouse, string> = { jp: "Kho Nhật (shop)", jp_carrier: "Kho ĐVVC Nhật", carrier: "Kho ĐVVC VN", vn: "Kho Việt Nam (shop)" };
export const WAREHOUSE_SHORT: Record<Warehouse, string> = { jp: "Nhật", jp_carrier: "ĐVVC Nhật", carrier: "ĐVVC VN", vn: "VN" };
export const WAREHOUSE_HINT: Record<Warehouse, string> = {
  jp: "Kho của shop tại Nhật (Chiba) — hàng đã cầm, chờ đưa vào chuyến gửi về",
  jp_carrier: "Kho đơn vị vận chuyển tại Nhật (Kiến Express) — đã giao cho ĐVVC, chờ bay",
  carrier: "Kho đơn vị vận chuyển tại Hà Nội — đã về Việt Nam, chưa tới kho shop",
  vn: "Kho shop tại Việt Nam (Hoằng Hóa, Thanh Hóa) — hàng giao cho khách từ đây",
};
/** Country side of a warehouse, for the two tabs of Kho hàng. */
export const WAREHOUSE_SIDE: Record<Warehouse, "jp" | "vn"> = { jp: "jp", jp_carrier: "jp", carrier: "vn", vn: "vn" };
/** Default warehouse for a lot when none is given: the shop warehouse in Vietnam. */
export const DEFAULT_WAREHOUSE: Warehouse = "vn";

export function isWarehouse(v: unknown): v is Warehouse {
  return typeof v === "string" && (WAREHOUSES as readonly string[]).includes(v);
}

/** Accepts a key ("jp"), a label ("Kho Nhật"), or a short form ("Nhật", "VN", "ĐVVC VN"); null when unknown. */
export function parseWarehouse(raw: string): Warehouse | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (isWarehouse(v)) return v;
  const carrierWord = /[dđ]vvc|carrier|ki[eế]n|v[aậ]n chuy[eể]n|logistic/.test(v);
  if (/nh[aậ]t|japan|jp\b|日本/.test(v)) return carrierWord ? "jp_carrier" : "jp";
  if (carrierWord) return "carrier";
  if (/vi[eệ]t|\bvn\b|shop|thanh h[oó]a|h[aà] n[oộ]i/.test(v)) return "vn";
  return null;
}

/** Where a lot sits for a given purchase status (the shipment chain drives both). */
export function locationForStatus(status: PurchaseStatus): { warehouse: Warehouse; inTransit: boolean } | null {
  switch (status) {
    case "bought":
      return { warehouse: "jp", inTransit: false };
    case "to_carrier_jp":
      return { warehouse: "jp_carrier", inTransit: false };
    case "shipped_jp_vn":
      return { warehouse: "jp_carrier", inTransit: true };
    case "at_carrier_vn":
      return { warehouse: "carrier", inTransit: false };
    case "to_shop":
      return { warehouse: "carrier", inTransit: true };
    case "at_shop":
    case "shipped_to_customer":
    case "delivered":
      return { warehouse: "vn", inTransit: false };
    default:
      return null; // not bought / ordered online: no lot yet
  }
}

/** Purchase status implied by a lot's location (the inverse of locationForStatus). */
export function statusForLocation(warehouse: Warehouse, inTransit: boolean): PurchaseStatus {
  if (warehouse === "jp") return "bought";
  if (warehouse === "jp_carrier") return inTransit ? "shipped_jp_vn" : "to_carrier_jp";
  if (warehouse === "carrier") return inTransit ? "to_shop" : "at_carrier_vn";
  return "at_shop";
}

/** "Kho ĐVVC Nhật · đang bay" — location label with the transit flag. */
export function describeLocation(warehouse: Warehouse, inTransit: boolean): string {
  if (!inTransit) return WAREHOUSE_LABEL[warehouse];
  return warehouse === "jp_carrier" ? "Đang vận chuyển JP→VN" : warehouse === "carrier" ? "Đang về kho shop VN" : WAREHOUSE_LABEL[warehouse];
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

export const emptyByWarehouse = (): Record<Warehouse, number> => ({ jp: 0, jp_carrier: 0, carrier: 0, vn: 0 });
export const emptyByTransit = (): Record<TransitWhere, number> => ({ jp: 0, transit: 0, carrier: 0 });

/** "Kho VN 5 · Kho Nhật 2" — non-zero warehouses only, biggest first. */
export function describeByWarehouse(by: Record<Warehouse, number>): string {
  return WAREHOUSES.filter((w) => by[w] > 0)
    .sort((a, b) => by[b] - by[a])
    .map((w) => `${WAREHOUSE_LABEL[w]} ${by[w]}`)
    .join(" · ");
}
