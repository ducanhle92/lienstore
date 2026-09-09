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
