/**
 * Selling-price formula (Admin › Kho hàng › Công thức giá):
 *   giá bán = giá vốn × (1 + lãi %) + phí vận chuyển 3 chặng nhập hàng (nội địa Nhật → Nhật–Việt → kho ĐVVC về kho shop),
 * rounded up to the nearest step. Pure module shared by the admin pages and the product form.
 */
import { billableProductWeightG, type DimsConfidence, type LegQuote, type QuoteMethod, quoteMethod, type ShippingLeg, type ShippingQuoteConfig } from "./shipping";

export interface PricingConfig {
  /** Profit on top of the cost price, in percent of the cost price (owner's range: 20–32 %). */
  marginPct: number;
  /** Suggested prices are rounded up to a multiple of this (VND). */
  roundTo: number;
  /** Typical consolidated shipment (grams); every import leg is priced for this lot and shared out per gram. */
  lotWeightG: number;
}

export const DEFAULT_PRICING: PricingConfig = { marginPct: 25, roundTo: 1000, lotWeightG: 10000 };
export const MARGIN_RANGE = { min: 0, max: 100, suggestedMin: 20, suggestedMax: 32 };

export function parsePricing(raw: string | null | undefined): PricingConfig {
  if (!raw) return { ...DEFAULT_PRICING };
  try {
    const o = JSON.parse(raw) as Partial<PricingConfig>;
    const marginPct = typeof o.marginPct === "number" && Number.isFinite(o.marginPct) ? Math.min(MARGIN_RANGE.max, Math.max(MARGIN_RANGE.min, o.marginPct)) : DEFAULT_PRICING.marginPct;
    const roundTo = typeof o.roundTo === "number" && [1, 100, 500, 1000, 5000, 10000].includes(o.roundTo) ? o.roundTo : DEFAULT_PRICING.roundTo;
    const lotWeightG = typeof o.lotWeightG === "number" && Number.isFinite(o.lotWeightG) ? Math.min(100000, Math.max(1000, Math.round(o.lotWeightG))) : DEFAULT_PRICING.lotWeightG;
    return { marginPct, roundTo, lotWeightG };
  } catch {
    return { ...DEFAULT_PRICING };
  }
}

export interface PriceInput {
  costPrice: number | null;
  weightG: number | null;
  dimsCm: string | null;
  dimsConfidence: DimsConfidence | null;
}

export interface PriceBreakdown {
  cost: number;
  marginPct: number;
  /** Profit in VND (cost × margin %). */
  margin: number;
  /** Billable grams used for the shipping legs (max(actual, volumetric) × safety factor). */
  weightG: number;
  legs: LegQuote[];
  /** Sum of the import legs, VND. */
  shipping: number;
  /** Before rounding. */
  raw: number;
  suggested: number;
}

/**
 * Import legs for ONE product inside a consolidated shipment: each leg is quoted for the whole lot (`lotWeightG`,
 * the way the goods really travel: one parcel to Kiến, one Kiến shipment, one Viettel parcel to Thanh Hóa) and the
 * lot price is shared out per gram of the product. Works the same for /kg, weight-tiered and size-tiered tariffs.
 */
export function quoteImportLegsProRata(quote: ShippingQuoteConfig, weightG: number, lotWeightG = DEFAULT_PRICING.lotWeightG): LegQuote[] {
  const lot = Math.max(1000, lotWeightG);
  const share = Math.max(0, weightG) / lot;
  const pairs: Array<[QuoteMethod | null, ShippingLeg]> = [
    [quote.jpDomestic, "jp_domestic"],
    [quote.jpVn, "jp_vn"],
    [quote.vnTransfer, "vn_transfer"],
  ];
  const out: LegQuote[] = [];
  for (const [m, leg] of pairs) {
    if (!m) continue;
    const q = quoteMethod(m, leg, lot, 0, quote.jpyRate);
    if (!q) continue;
    out.push({ ...q, label: `${q.label} · lô ${lot / 1000} kg`, feeRaw: Math.round(q.feeRaw * share), fee: Math.round(q.fee * share) });
  }
  return out;
}

/** Suggested selling price for one unit; null when the cost price is unknown. */
export function suggestPrice(p: PriceInput, quote: ShippingQuoteConfig, pricing: PricingConfig): PriceBreakdown | null {
  if (p.costPrice === null || !Number.isFinite(p.costPrice) || p.costPrice <= 0) return null;
  const weightG = billableProductWeightG(p.weightG, p.dimsCm, p.dimsConfidence);
  const legs = quoteImportLegsProRata(quote, weightG, pricing.lotWeightG);
  const shipping = legs.reduce((s, l) => s + l.fee, 0);
  const margin = Math.round((p.costPrice * pricing.marginPct) / 100);
  const raw = p.costPrice + margin + shipping;
  const step = Math.max(1, pricing.roundTo);
  return { cost: p.costPrice, marginPct: pricing.marginPct, margin, weightG, legs, shipping, raw, suggested: Math.ceil(raw / step) * step };
}
