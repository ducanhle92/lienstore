/** Shipping legs, labels and fee estimation (pure; used by server and client components). */
import type { ShippingMethod, ShippingZone } from "@/types/shop";

export type ShippingLeg = "jp_domestic" | "jp_vn" | "vn_transfer" | "vn_domestic";

export const SHIPPING_LEGS: Array<{ key: ShippingLeg; label: string; description: string }> = [
  { key: "jp_domestic", label: "Ship nội địa Nhật", description: "Từ nơi mua (cửa hàng, Amazon) tới kho gom hàng tại Nhật." },
  { key: "jp_vn", label: "Ship Nhật → Việt Nam", description: "Từ kho Nhật về kho Việt Nam (đường bay / đường biển / EMS / xách tay)." },
  { key: "vn_transfer", label: "Kho ĐVVC → kho shop", description: "Từ kho đơn vị vận chuyển tại Việt Nam (Hà Nội) về kho LienStore Thanh Hóa. Mặc định Kiến Express, admin chọn hãng khác nếu muốn." },
  { key: "vn_domestic", label: "Ship nội địa Việt Nam", description: "Từ kho Việt Nam giao tới tận nhà khách." },
];

export const LEG_LABEL: Record<ShippingLeg, string> = Object.fromEntries(SHIPPING_LEGS.map((l) => [l.key, l.label])) as Record<ShippingLeg, string>;

export function isShippingLeg(v: unknown): v is ShippingLeg {
  return v === "jp_domestic" || v === "jp_vn" || v === "vn_transfer" || v === "vn_domestic";
}

/** Zones whose unit is per kilogram ("/kg", "đ/kg"…). */
export function isPerKg(zone: Pick<ShippingZone, "unit">): boolean {
  return /kg/i.test(zone.unit);
}

/** Billable kilograms: carriers round every started kilogram up (0.1–0.9 → 1). */
export function billableKg(weightG: number): number {
  return Math.max(1, Math.ceil(weightG / 1000));
}

/** Products tagged as liquids / aerosols / bulky pay the zone surcharge (admin adds the tag on the product). */
export const SPECIAL_TAG_RE = /(hàng lỏng|chất lỏng|liquid|bình xịt|spray|cồng kềnh|bulky|dễ vỡ|fragile)/i;
export function isSpecialHandling(tags: string[]): boolean {
  return tags.some((t) => SPECIAL_TAG_RE.test(t));
}

/** Zone priced as "first N g, then X per started M g" (the way Vietnamese carriers publish their tariffs). */
export function isTiered(zone: Pick<ShippingZone, "baseG" | "stepG" | "stepFee">): boolean {
  return zone.baseG !== null && zone.stepG !== null && zone.stepFee !== null && zone.stepG > 0;
}

/** Fee of a zone for a billable weight: weight steps, per-kg, or flat per order. */
export function zoneFeeForWeight(zone: Pick<ShippingZone, "fee" | "unit" | "baseG" | "stepG" | "stepFee">, weightG: number): number {
  if (isTiered(zone)) {
    const extra = Math.max(0, weightG - (zone.baseG as number));
    return zone.fee + Math.ceil(extra / (zone.stepG as number)) * (zone.stepFee as number);
  }
  if (isPerKg(zone)) return zone.fee * billableKg(weightG);
  return zone.fee;
}

/** Estimated fee of one zone for a product weight (null when the zone is a flat per-order price). */
export function estimateZoneFee(zone: ShippingZone, weightG: number | null): number | null {
  if (weightG === null || weightG <= 0) return null;
  if (!isTiered(zone) && !isPerKg(zone)) return null;
  return zoneFeeForWeight(zone, weightG);
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

/** How much we trust a product's weight/dimensions (set in the admin, harvested or inferred). */
export type DimsConfidence = "high" | "medium" | "low";

export const CONFIDENCE_LABEL: Record<DimsConfidence, string> = { high: "Cao", medium: "Trung bình", low: "Thấp" };

/** Multiplier applied to the chargeable weight so shipping is never under-quoted: sure → 1.2, unsure → 2. */
export const SAFETY_FACTOR: Record<DimsConfidence, number> = { high: 1.2, medium: 1.5, low: 2 };

export function isDimsConfidence(v: unknown): v is DimsConfidence {
  return v === "high" || v === "medium" || v === "low";
}

export function safetyFactor(confidence: DimsConfidence | null | undefined): number {
  return confidence ? SAFETY_FACTOR[confidence] : SAFETY_FACTOR.low;
}

/** Grams a product costs to ship: max(actual, volumetric) × safety factor; 500 g assumed when nothing is known. */
export const DEFAULT_ITEM_WEIGHT_G = 500;
export function billableProductWeightG(weightG: number | null, dims: string | null, confidence: DimsConfidence | null | undefined): number {
  const base = chargeableWeightG(weightG, dims) ?? DEFAULT_ITEM_WEIGHT_G;
  return Math.round(base * safetyFactor(confidence));
}

// ---------------------------------------------------------------------------------------------------------------------
// Checkout quote for the Japan-side legs (the VN-domestic leg is the zone the customer picks)

/** Legs that bring goods from the seller in Japan to the shop warehouse in Thanh Hóa — the cost built into the selling price. */
export const IMPORT_LEGS: ShippingLeg[] = ["jp_domestic", "jp_vn", "vn_transfer"];

/** "per_order" = customer pays all import legs on top of the product prices; "included" = only VN delivery (prices cover the rest). */
export type ShippingPricingMode = "per_order" | "included";

export interface QuoteZone {
  id: number;
  name: string;
  fee: number;
  unit: string;
  baseG: number | null;
  stepG: number | null;
  stepFee: number | null;
  freeOver: number | null;
  /** Upper weight bound parsed from the name ("≤ 5 kg", "Size 80 (≤5 kg)"), null when the zone is not weight-tiered. */
  capKg: number | null;
}
export interface QuoteMethod {
  id: number;
  name: string;
  carrierName: string | null;
  currency: string;
  zones: QuoteZone[];
}
/** Everything the checkout page (server and client) needs to price the JP legs of an order. */
export interface ShippingQuoteConfig {
  mode: ShippingPricingMode;
  /** VND per 1 JPY, for methods priced in ¥. */
  jpyRate: number;
  jpDomestic: QuoteMethod | null;
  jpVn: QuoteMethod | null;
  /** Carrier warehouse (Hà Nội) → shop warehouse (Thanh Hóa). */
  vnTransfer: QuoteMethod | null;
}
export interface LegQuote {
  leg: ShippingLeg;
  methodId: number;
  zoneId: number;
  label: string;
  /** Fee in VND (converted when the method is priced in ¥). */
  fee: number;
  /** Fee in the method's own currency. */
  feeRaw: number;
  currency: string;
}

const CAP_RE = /(?:≤|<=|dưới|đến|tới|~)\s*(\d+(?:[.,]\d+)?)\s*kg/i;
export function zoneCapKg(name: string): number | null {
  const m = CAP_RE.exec(name);
  return m ? Number.parseFloat(m[1].replace(",", ".")) : null;
}

/** Turn full shipping methods into the lean quote config: first active method per JP leg is the default. */
export function buildQuoteConfig(methods: ShippingMethod[], mode: ShippingPricingMode, jpyRate: number): ShippingQuoteConfig {
  const pick = (leg: ShippingLeg): QuoteMethod | null => {
    const m = methods.filter((x) => x.leg === leg && x.active && x.zones.some((z) => z.active)).sort((a, b) => a.position - b.position || a.id - b.id)[0];
    if (!m) return null;
    return {
      id: m.id,
      name: m.name,
      carrierName: m.carrierName ?? null,
      currency: m.currency,
      zones: m.zones.filter((z) => z.active).map((z) => ({ id: z.id, name: z.name, fee: z.fee, unit: z.unit, baseG: z.baseG, stepG: z.stepG, stepFee: z.stepFee, freeOver: z.freeOver, capKg: zoneCapKg(z.name) })),
    };
  };
  return { mode, jpyRate, jpDomestic: pick("jp_domestic"), jpVn: pick("jp_vn"), vnTransfer: pick("vn_transfer") };
}

/** Fee of one method for a billable weight: tiered zone by weight cap, else per-kg × kg, else flat first zone. */
export function quoteMethod(m: QuoteMethod, leg: ShippingLeg, weightG: number, subtotal: number, jpyRate: number): LegQuote | null {
  if (m.zones.length === 0) return null;
  const kg = billableKg(weightG);
  const tiered = m.zones.filter((z) => z.capKg !== null).sort((a, b) => (a.capKg ?? 0) - (b.capKg ?? 0));
  let zone = tiered.find((z) => (z.capKg ?? 0) >= weightG / 1000) ?? (tiered.length ? tiered[tiered.length - 1] : m.zones[0]);
  if (!tiered.length) zone = m.zones.find((z) => /kg/i.test(z.unit)) ?? m.zones[0];
  const isJpy = /¥|jpy|yen/i.test(m.currency);
  let raw = isTiered(zone) ? zoneFeeForWeight(zone, weightG) : zone.fee * (/kg/i.test(zone.unit) ? kg : 1);
  if (!isJpy && zone.freeOver !== null && subtotal >= zone.freeOver) raw = 0;
  const fee = isJpy ? Math.round(raw * jpyRate) : raw;
  return {
    leg,
    methodId: m.id,
    zoneId: zone.id,
    label: `${m.name} · ${zone.name}${m.carrierName && !m.name.includes(m.carrierName) ? ` (${m.carrierName})` : ""}`,
    fee,
    feeRaw: raw,
    currency: m.currency,
  };
}

/** Import legs (JP domestic → JP→VN → carrier warehouse → shop) for a billable weight, whatever the pricing mode. */
export function quoteImportLegs(cfg: ShippingQuoteConfig, weightG: number, subtotal: number): LegQuote[] {
  const out: LegQuote[] = [];
  const pairs: Array<[QuoteMethod | null, ShippingLeg]> = [
    [cfg.jpDomestic, "jp_domestic"],
    [cfg.jpVn, "jp_vn"],
    [cfg.vnTransfer, "vn_transfer"],
  ];
  for (const [m, leg] of pairs) {
    if (!m) continue;
    const q = quoteMethod(m, leg, weightG, subtotal, cfg.jpyRate);
    if (q) out.push(q);
  }
  return out;
}

/** Import legs the customer pays at checkout (empty in "included" mode — the selling price already covers them). */
export function quoteJpLegs(cfg: ShippingQuoteConfig, weightG: number, subtotal: number): LegQuote[] {
  if (cfg.mode !== "per_order") return [];
  return quoteImportLegs(cfg, weightG, subtotal);
}

/** Where an order is on its way (shown to the customer as a progress bar, set by the admin step by step). */
export type ShipStage = "ordered" | "paid" | "in_transit" | "vn_warehouse" | "delivering" | "delivered";

export const SHIP_STAGES: Array<{ key: ShipStage; label: string; short: string; hint: string }> = [
  { key: "ordered", label: "Đã đặt hàng", short: "Đặt hàng", hint: "Đơn đã được ghi nhận, LienStore sẽ xác nhận sớm." },
  { key: "paid", label: "Đã xác nhận thanh toán", short: "Đã thanh toán", hint: "LienStore đã nhận thanh toán và tiến hành mua hàng tại Nhật." },
  { key: "in_transit", label: "Đang vận chuyển", short: "Vận chuyển", hint: "Hàng đang trên đường từ Nhật về Việt Nam." },
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
