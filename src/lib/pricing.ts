/**
 * Selling-price formula (Admin › Kho hàng › Công thức giá):
 *   giá bán = giá vốn × (1 + lãi %) + phí vận chuyển 3 chặng nhập hàng (nội địa Nhật → Nhật–Việt → kho ĐVVC về kho shop),
 * rounded up to the nearest step. Pure module shared by the admin pages and the product form.
 */
import { billableProductWeightG, type DimsConfidence, isTiered, type LegQuote, quoteImportLegs, type QuoteMethod, type ShippingLeg, type ShippingQuoteConfig } from "./shipping";

export interface PricingConfig {
  /** Profit on top of the cost price, in percent of the cost price (owner's range: 20–32 %). */
  marginPct: number;
  /** Suggested prices are rounded up to a multiple of this (VND). */
  roundTo: number;
}

export const DEFAULT_PRICING: PricingConfig = { marginPct: 25, roundTo: 1000 };
export const MARGIN_RANGE = { min: 0, max: 100, suggestedMin: 20, suggestedMax: 32 };

export function parsePricing(raw: string | null | undefined): PricingConfig {
  if (!raw) return { ...DEFAULT_PRICING };
  try {
    const o = JSON.parse(raw) as Partial<PricingConfig>;
    const marginPct = typeof o.marginPct === "number" && Number.isFinite(o.marginPct) ? Math.min(MARGIN_RANGE.max, Math.max(MARGIN_RANGE.min, o.marginPct)) : DEFAULT_PRICING.marginPct;
    const roundTo = typeof o.roundTo === "number" && [1, 100, 500, 1000, 5000, 10000].includes(o.roundTo) ? o.roundTo : DEFAULT_PRICING.roundTo;
    return { marginPct, roundTo };
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
 * Import legs for ONE product inside a consolidated shipment: "/kg" tariffs are charged pro-rata by grams
 * (the carrier's whole-kg rounding applies to the whole lot, not to each item); tiered / flat zones stay as quoted.
 */
export function quoteImportLegsProRata(quote: ShippingQuoteConfig, weightG: number): LegQuote[] {
  const methods: Partial<Record<ShippingLeg, QuoteMethod | null>> = { jp_domestic: quote.jpDomestic, jp_vn: quote.jpVn, vn_transfer: quote.vnTransfer };
  return quoteImportLegs(quote, weightG, 0).map((q) => {
    const zone = methods[q.leg]?.zones.find((z) => z.id === q.zoneId);
    if (!zone || isTiered(zone) || !/kg/i.test(zone.unit)) return q;
    const feeRaw = Math.round(zone.fee * (weightG / 1000));
    const isJpy = /¥|jpy|yen/i.test(q.currency);
    return { ...q, feeRaw, fee: isJpy ? Math.round(feeRaw * quote.jpyRate) : feeRaw };
  });
}

/** Suggested selling price for one unit; null when the cost price is unknown. */
export function suggestPrice(p: PriceInput, quote: ShippingQuoteConfig, pricing: PricingConfig): PriceBreakdown | null {
  if (p.costPrice === null || !Number.isFinite(p.costPrice) || p.costPrice <= 0) return null;
  const weightG = billableProductWeightG(p.weightG, p.dimsCm, p.dimsConfidence);
  const legs = quoteImportLegsProRata(quote, weightG);
  const shipping = legs.reduce((s, l) => s + l.fee, 0);
  const margin = Math.round((p.costPrice * pricing.marginPct) / 100);
  const raw = p.costPrice + margin + shipping;
  const step = Math.max(1, pricing.roundTo);
  return { cost: p.costPrice, marginPct: pricing.marginPct, margin, weightG, legs, shipping, raw, suggested: Math.ceil(raw / step) * step };
}
