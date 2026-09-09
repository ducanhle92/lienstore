/** Shipping legs, labels and fee estimation (pure; used by server and client components). */
import type { ShippingMethod, ShippingZone } from "@/types/shop";

export type ShippingLeg = "jp_domestic" | "jp_vn" | "vn_domestic";

export const SHIPPING_LEGS: Array<{ key: ShippingLeg; label: string; description: string }> = [
  { key: "jp_domestic", label: "Ship nội địa Nhật", description: "Từ nơi mua (cửa hàng, Amazon) tới kho gom hàng tại Nhật." },
  { key: "jp_vn", label: "Ship Nhật → Việt Nam", description: "Từ kho Nhật về kho Việt Nam (đường bay / đường biển / EMS / xách tay)." },
  { key: "vn_domestic", label: "Ship nội địa Việt Nam", description: "Từ kho Việt Nam giao tới tận nhà khách." },
];

export const LEG_LABEL: Record<ShippingLeg, string> = Object.fromEntries(SHIPPING_LEGS.map((l) => [l.key, l.label])) as Record<ShippingLeg, string>;

export function isShippingLeg(v: unknown): v is ShippingLeg {
  return v === "jp_domestic" || v === "jp_vn" || v === "vn_domestic";
}

/** Zones whose unit is per kilogram ("/kg", "đ/kg"…). */
export function isPerKg(zone: ShippingZone): boolean {
  return /kg/i.test(zone.unit);
}

/** Billable kilograms: carriers round every started kilogram up (0.1–0.9 → 1). */
export function billableKg(weightG: number): number {
  return Math.max(1, Math.ceil(weightG / 1000));
}

/** Estimated fee of one zone for a product weight (null when the zone is not weight-based). */
export function estimateZoneFee(zone: ShippingZone, weightG: number | null): number | null {
  if (weightG === null || weightG <= 0) return null;
  if (!isPerKg(zone)) return null;
  return zone.fee * billableKg(weightG);
}

/** Cheapest weight-based estimate across a method's active zones. */
export function estimateMethodFee(method: ShippingMethod, weightG: number | null): { zone: ShippingZone; fee: number } | null {
  let best: { zone: ShippingZone; fee: number } | null = null;
  for (const z of method.zones) {
    if (!z.active) continue;
    const fee = estimateZoneFee(z, weightG);
    if (fee !== null && (!best || fee < best.fee)) best = { zone: z, fee };
  }
  return best;
}

/** "12x8x5" → [12, 8, 5] (cm) or null. */
export function parseDims(dims: string | null): [number, number, number] | null {
  if (!dims) return null;
  const m = dims.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Volumetric weight in grams (L×W×H cm / 6000 kg — the air-cargo convention shown on carrier price lists). */
export function volumetricWeightG(dims: string | null): number | null {
  const d = parseDims(dims);
  if (!d) return null;
  return Math.round(((d[0] * d[1] * d[2]) / 6000) * 1000);
}

/** Weight used for the estimate: the larger of actual and volumetric weight. */
export function chargeableWeightG(weightG: number | null, dims: string | null): number | null {
  const vol = volumetricWeightG(dims);
  if (weightG === null && vol === null) return null;
  return Math.max(weightG ?? 0, vol ?? 0);
}

/** Where an order is on its way (shown to the customer as a progress bar, set by the admin step by step). */
export type ShipStage = "ordered" | "purchased" | "jp_warehouse" | "in_transit" | "vn_warehouse" | "delivering" | "delivered";

export const SHIP_STAGES: Array<{ key: ShipStage; label: string; short: string; hint: string }> = [
  { key: "ordered", label: "Đã đặt hàng", short: "Đặt hàng", hint: "Đơn đã được ghi nhận, chờ LienStore xác nhận / thanh toán." },
  { key: "purchased", label: "Đã mua tại Nhật", short: "Đã mua", hint: "Đã đặt mua hàng tại Nhật (xem bill trong đơn)." },
  { key: "jp_warehouse", label: "Đã tới kho Nhật", short: "Kho Nhật", hint: "Hàng đã về kho gom tại Nhật, chờ đóng kiện." },
  { key: "in_transit", label: "Đang về Việt Nam", short: "Đang bay/biển", hint: "Kiện hàng đang trên đường Nhật → Việt Nam." },
  { key: "vn_warehouse", label: "Đã tới kho Việt Nam", short: "Kho VN", hint: "Hàng đã về kho Thanh Hóa, chuẩn bị giao." },
  { key: "delivering", label: "Đang giao", short: "Đang giao", hint: "Đơn vị vận chuyển nội địa đang giao tới bạn." },
  { key: "delivered", label: "Đã nhận hàng", short: "Đã nhận", hint: "Khách đã nhận hàng. Cảm ơn bạn!" },
];

export function isShipStage(v: unknown): v is ShipStage {
  return typeof v === "string" && SHIP_STAGES.some((s) => s.key === v);
}

export function stageIndex(stage: ShipStage): number {
  return Math.max(0, SHIP_STAGES.findIndex((s) => s.key === stage));
}
