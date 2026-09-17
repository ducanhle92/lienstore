/**
 * Purchase sources of a product's Japanese price (giá vốn ¥): the same item can be bought from Amazon, Rakuten, the
 * brand shop, Yahoo, Mercari… Each product keeps every quote the seller entered; one of them is the "primary" that feeds
 * `products.cost_jpy` and the price formula. "Tối ưu" picks the cheapest for every product. Pure helpers (no DB).
 */
export const COST_SOURCES = ["amazon", "rakuten", "official", "yahoo", "mercari", "yodobashi", "other", "manual", "unknown"] as const;
export type CostSourceKind = (typeof COST_SOURCES)[number];

export const COST_SOURCE_LABEL: Record<CostSourceKind, string> = {
  amazon: "Amazon.co.jp",
  rakuten: "Rakuten",
  official: "Web chính hãng",
  yahoo: "Yahoo! Shopping",
  mercari: "Mercari",
  yodobashi: "Yodobashi",
  other: "Nguồn khác",
  manual: "Nhập tay",
  unknown: "Chưa xác định — thêm sau",
};

export function isCostSourceKind(v: unknown): v is CostSourceKind {
  return typeof v === "string" && (COST_SOURCES as readonly string[]).includes(v);
}

export function costSourceLabel(v: string): string {
  return isCostSourceKind(v) ? COST_SOURCE_LABEL[v] : v || "—";
}

/** Guess the source from a shop URL (Amazon / Rakuten / Yahoo / Mercari / Yodobashi, else the brand site). */
export function sourceFromUrl(url: string): CostSourceKind {
  const u = url.toLowerCase();
  if (!u) return "manual";
  if (u.includes("amazon.")) return "amazon";
  if (u.includes("rakuten.")) return "rakuten";
  if (u.includes("yahoo.")) return "yahoo";
  if (u.includes("mercari.")) return "mercari";
  if (u.includes("yodobashi.")) return "yodobashi";
  return "official";
}

export interface CostQuote {
  source: string;
  priceJpy: number;
  url: string;
}

/** Cheapest quote; ties go to the preferred source, then to the first entered. */
export function cheapestQuote<T extends CostQuote>(rows: T[], preferred: string, fees: SourceFees = {}, billableG = 0, lotWeightG = 10000): T | null {
  if (!rows.length) return null;
  const landed = (r: T) => r.priceJpy + landedFeeJpy(r.source, fees, billableG, lotWeightG);
  return [...rows].sort((a, b) => landed(a) - landed(b) || (a.source === preferred ? -1 : b.source === preferred ? 1 : 0))[0];
}

// ---------------------------------------------------------------------------------------------------------------------
// Surcharges of a purchase source (Nguồn nhập › Phụ phí) — part of the landed ¥ cost of every quote from that source.

/** "unit" = ¥ per item · "kg" = ¥ per kg of the item's billable weight · "lot" = ¥ per shipment, shared by weight across the lot. */
export type SourceFeeUnit = "unit" | "kg" | "lot";
export const SOURCE_FEE_UNITS: readonly SourceFeeUnit[] = ["unit", "kg", "lot"];
export const SOURCE_FEE_UNIT_LABEL: Record<SourceFeeUnit, string> = { unit: "¥ / sản phẩm", kg: "¥ / kg", lot: "¥ / lần gửi (chia theo cân)" };
export interface SourceFee {
  label: string;
  amountJpy: number;
  unit: SourceFeeUnit;
  /** For "lot": weight of one shipment the fee is shared over; null = the pricing lot (Công thức giá › cân lô). */
  lotWeightG: number | null;
}
/** source key → its surcharges. */
export type SourceFees = Record<string, SourceFee[]>;

export function isSourceFeeUnit(v: unknown): v is SourceFeeUnit {
  return typeof v === "string" && (SOURCE_FEE_UNITS as readonly string[]).includes(v);
}

/** Parse the JSON column; malformed input → no fees. */
export function parseSourceFees(raw: string | null | undefined): SourceFee[] {
  try {
    const v = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .map((f): SourceFee | null => {
        if (!f || typeof f !== "object") return null;
        const o = f as Record<string, unknown>;
        const amount = Number(o.amountJpy);
        if (!Number.isFinite(amount) || amount <= 0) return null;
        const lot = Number(o.lotWeightG);
        return { label: typeof o.label === "string" ? o.label.slice(0, 80) : "Phụ phí", amountJpy: Math.round(amount), unit: isSourceFeeUnit(o.unit) ? o.unit : "unit", lotWeightG: Number.isFinite(lot) && lot > 0 ? Math.round(lot) : null };
      })
      .filter((f): f is SourceFee => f !== null);
  } catch {
    return [];
  }
}

/** One line per surcharge with the ¥ it adds to THIS item (billable weight in grams) and how it was worked out. */
export function sourceFeeLines(source: string, fees: SourceFees, billableG: number, lotWeightG: number): Array<{ label: string; jpy: number; how: string }> {
  const list = fees[source] ?? [];
  const g = Math.max(0, billableG || 0);
  return list.map((f) => {
    if (f.unit === "kg") {
      const kg = g / 1000;
      return { label: f.label, jpy: f.amountJpy * kg, how: `${f.amountJpy.toLocaleString("vi-VN")}¥/kg × ${kg.toLocaleString("vi-VN", { maximumFractionDigits: 3 })} kg` };
    }
    if (f.unit === "lot") {
      const lot = f.lotWeightG ?? lotWeightG;
      const share = lot > 0 ? g / lot : 0;
      return { label: f.label, jpy: f.amountJpy * share, how: `${f.amountJpy.toLocaleString("vi-VN")}¥/lần × ${g.toLocaleString("vi-VN")} g / ${lot.toLocaleString("vi-VN")} g lô` };
    }
    return { label: f.label, jpy: f.amountJpy, how: `${f.amountJpy.toLocaleString("vi-VN")}¥ mỗi sản phẩm` };
  });
}

/** Total ¥ surcharge of a source for one item (rounded), 0 when the source has none. */
export function landedFeeJpy(source: string, fees: SourceFees = {}, billableG = 0, lotWeightG = 10000): number {
  return Math.round(sourceFeeLines(source, fees, billableG, lotWeightG).reduce((s, l) => s + l.jpy, 0));
}

/** VND cost price of a quote: (¥ quote + source surcharges for this item) × rate. */
export function costPriceFromJpy(priceJpy: number, source: string, rate: number, fees: SourceFees = {}, billableG = 0, lotWeightG = 10000): number {
  return Math.round((priceJpy + landedFeeJpy(source, fees, billableG, lotWeightG)) * rate);
}

/** Short badge text: "+¥300/sp · +¥1.000/kg". */
export function describeSourceFees(list: SourceFee[]): string {
  return list.map((f) => `+¥${f.amountJpy.toLocaleString("ja-JP")}${f.unit === "kg" ? "/kg" : f.unit === "lot" ? "/lần" : "/sp"}`).join(" · ");
}
