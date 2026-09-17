import type { PurchaseStatus } from "./purchase";
import { SHIP_STAGES, type ShippingLeg, type ShipStage } from "./shipping";
import type { Warehouse } from "./warehouses";

/**
 * Per-leg shipment status of an order (Vận chuyển › 4 chặng): each leg is "chưa gửi" → "đã gửi" → "đã đến". The
 * furthest leg reached tells where the goods physically are (which warehouse / in transit), and every change also
 * advances the order's line-level purchase status and the customer-facing order stage. Pure helpers (no DB).
 */
export type LegStatus = "pending" | "sent" | "arrived";
export const LEG_STATUSES: readonly LegStatus[] = ["pending", "sent", "arrived"];
export const LEG_STATUS_LABEL: Record<LegStatus, string> = { pending: "Chưa gửi", sent: "Đã gửi", arrived: "Đã đến" };
export const LEG_STATUS_CLS: Record<LegStatus, string> = { pending: "bg-gray-200 text-gray-700", sent: "bg-sky-100 text-sky-800", arrived: "bg-green-100 text-green-800" };
export const LEG_STATUS_RANK: Record<LegStatus, number> = { pending: 0, sent: 1, arrived: 2 };

export function isLegStatus(v: unknown): v is LegStatus {
  return typeof v === "string" && (LEG_STATUSES as readonly string[]).includes(v);
}

/** Purchase status every line of the order has at least reached when a leg is sent / has arrived (null = no change). */
export const LEG_PURCHASE: Record<ShippingLeg, { sent: PurchaseStatus | null; arrived: PurchaseStatus | null }> = {
  jp_domestic: { sent: "to_carrier_jp", arrived: "to_carrier_jp" },
  jp_vn: { sent: "shipped_jp_vn", arrived: "at_carrier_vn" },
  vn_transfer: { sent: "to_shop", arrived: "at_shop" },
  vn_domestic: { sent: "shipped_to_customer", arrived: "delivered" },
};

/** Customer-facing order stage implied by a leg status (null = the stage does not move). */
export const LEG_ORDER_STAGE: Record<ShippingLeg, { sent: ShipStage | null; arrived: ShipStage | null }> = {
  jp_domestic: { sent: null, arrived: null },
  jp_vn: { sent: "in_transit", arrived: null },
  vn_transfer: { sent: null, arrived: "vn_warehouse" },
  vn_domestic: { sent: "delivering", arrived: "delivered" },
};

export const stageRank = (s: ShipStage): number => Math.max(0, SHIP_STAGES.findIndex((x) => x.key === s));

/** Where the goods of an order are right now, derived from the furthest leg that moved. */
export type GoodsWhere = "jp_home" | "jp_to_carrier" | "jp_carrier" | "transit" | "vn_carrier" | "to_shop" | "shop" | "to_customer" | "customer";
export const GOODS_WHERE: Array<{ key: GoodsWhere; label: string; warehouse: Warehouse | null; cls: string }> = [
  { key: "jp_home", label: "Chưa gửi (đang ở Nhật)", warehouse: null, cls: "bg-gray-200 text-gray-700" },
  { key: "jp_to_carrier", label: "Đang tới kho ĐVVC Nhật", warehouse: null, cls: "bg-orange-100 text-orange-800" },
  { key: "jp_carrier", label: "Kho ĐVVC Nhật", warehouse: "jp", cls: "bg-amber-100 text-amber-800" },
  { key: "transit", label: "Đang bay NB → VN", warehouse: null, cls: "bg-sky-100 text-sky-800" },
  { key: "vn_carrier", label: "Kho ĐVVC Việt Nam (Hà Nội)", warehouse: "carrier", cls: "bg-cyan-100 text-cyan-800" },
  { key: "to_shop", label: "Đang về kho shop", warehouse: null, cls: "bg-indigo-100 text-indigo-800" },
  { key: "shop", label: "Kho Việt Nam (shop)", warehouse: "vn", cls: "bg-green-100 text-green-800" },
  { key: "to_customer", label: "Đang giao khách", warehouse: null, cls: "bg-lime-100 text-lime-800" },
  { key: "customer", label: "Khách đã nhận", warehouse: null, cls: "bg-emerald-100 text-emerald-800" },
];
export const GOODS_WHERE_LABEL: Record<GoodsWhere, string> = Object.fromEntries(GOODS_WHERE.map((w) => [w.key, w.label])) as Record<GoodsWhere, string>;
export function isGoodsWhere(v: unknown): v is GoodsWhere {
  return typeof v === "string" && GOODS_WHERE.some((w) => w.key === v);
}

const LEG_ORDER: ShippingLeg[] = ["jp_domestic", "jp_vn", "vn_transfer", "vn_domestic"];
const WHERE_OF: Record<ShippingLeg, { sent: GoodsWhere; arrived: GoodsWhere }> = {
  jp_domestic: { sent: "jp_to_carrier", arrived: "jp_carrier" },
  jp_vn: { sent: "transit", arrived: "vn_carrier" },
  vn_transfer: { sent: "to_shop", arrived: "shop" },
  vn_domestic: { sent: "to_customer", arrived: "customer" },
};

export function goodsWhere(legs: Array<{ leg: ShippingLeg; status: LegStatus }>): GoodsWhere {
  let where: GoodsWhere = "jp_home";
  for (const leg of LEG_ORDER) {
    const l = legs.find((x) => x.leg === leg);
    if (!l || l.status === "pending") continue;
    where = WHERE_OF[leg][l.status];
  }
  return where;
}
