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
export function cheapestQuote<T extends CostQuote>(rows: T[], preferred: string, fees: Record<string, number> = {}): T | null {
  if (!rows.length) return null;
  const landed = (r: T) => r.priceJpy + landedFeeJpy(r.source, fees);
  return [...rows].sort((a, b) => landed(a) - landed(b) || (a.source === preferred ? -1 : b.source === preferred ? 1 : 0))[0];
}

/** Per-unit ¥ surcharge of a purchase source (Nguồn nhập › Phụ phí), 0 when none. */
export function landedFeeJpy(source: string, fees: Record<string, number> = {}): number {
  const f = fees[source];
  return Number.isFinite(f) && f > 0 ? f : 0;
}

/** VND cost price of a quote: (¥ quote + source surcharge) × rate. */
export function costPriceFromJpy(priceJpy: number, source: string, rate: number, fees: Record<string, number> = {}): number {
  return Math.round((priceJpy + landedFeeJpy(source, fees)) * rate);
}
