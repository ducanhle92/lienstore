import { regionOfZoneName, type VnRegion } from "./vn-regions";

/**
 * Shop policy "hỗ trợ phí vận chuyển": above an order value (per region) the shop pays the Vietnam delivery fee.
 * Managed in admin (Sales › Chính sách vận chuyển). Off by default — nothing about free shipping is shown or applied
 * until the owner switches it on.
 */
export interface ShipPolicy {
  enabled: boolean;
  title: string;
  text: string;
  /** Minimum order value (đ) per region; null = the region is not supported. */
  thresholds: Record<VnRegion, number | null>;
}

export const DEFAULT_SHIP_POLICY: ShipPolicy = {
  enabled: false,
  title: "Hỗ trợ phí vận chuyển",
  text: "LienStore hỗ trợ toàn bộ phí giao hàng nội địa Việt Nam cho đơn đạt giá trị tối thiểu theo khu vực. Khoản hỗ trợ được trừ ngay trong đơn hàng khi thanh toán.",
  thresholds: { thanh_hoa: 500000, north: 1000000, central: 1000000, south: 1000000 },
};

export function parseShipPolicy(raw: string | null | undefined): ShipPolicy {
  if (!raw) return DEFAULT_SHIP_POLICY;
  try {
    const v = JSON.parse(raw) as Partial<ShipPolicy>;
    const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.round(x) : null);
    return {
      enabled: v.enabled === true,
      title: typeof v.title === "string" && v.title.trim() ? v.title.trim() : DEFAULT_SHIP_POLICY.title,
      text: typeof v.text === "string" ? v.text : DEFAULT_SHIP_POLICY.text,
      thresholds: {
        thanh_hoa: num(v.thresholds?.thanh_hoa),
        north: num(v.thresholds?.north),
        central: num(v.thresholds?.central),
        south: num(v.thresholds?.south),
      },
    };
  } catch {
    return DEFAULT_SHIP_POLICY;
  }
}

/** Order value from which a zone (by its name) is shipped for free under the policy; null when not applicable. */
export function policyFreeOver(policy: ShipPolicy, zoneName: string): number | null {
  if (!policy.enabled) return null;
  const region = regionOfZoneName(zoneName);
  return region ? policy.thresholds[region] : null;
}

/** Copy of the methods with `freeOver` of every Vietnam-domestic zone set from the policy (the DB column is ignored). */
export function applyShipPolicy<Z extends { name: string; freeOver: number | null }, M extends { leg: string; zones: Z[] }>(methods: M[], policy: ShipPolicy): M[] {
  return methods.map((m) => (m.leg === "vn_domestic" ? { ...m, zones: m.zones.map((z) => ({ ...z, freeOver: policyFreeOver(policy, z.name) })) } : m));
}

/** Human summary for admin screens: "Thanh Hóa từ 500.000đ · Miền Bắc từ 1.000.000đ · …". */
export function describeShipPolicy(policy: ShipPolicy): string {
  const labels: Record<VnRegion, string> = { thanh_hoa: "Thanh Hóa", north: "Miền Bắc", central: "Miền Trung", south: "Miền Nam" };
  const parts = (Object.keys(labels) as VnRegion[]).filter((r) => policy.thresholds[r]).map((r) => `${labels[r]} từ ${policy.thresholds[r]!.toLocaleString("vi-VN")}đ`);
  return parts.length ? parts.join(" · ") : "chưa đặt mức nào";
}
