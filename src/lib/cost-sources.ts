/**
 * Purchase sources of a product's Japanese price (giá vốn ¥): the same item can be bought from Amazon, Rakuten, the
 * brand shop, Yahoo, Mercari… Each product keeps every quote the seller entered; one of them is the "primary" that feeds
 * `products.cost_jpy` and the price formula. "Tối ưu" picks the cheapest for every product. Pure helpers (no DB).
 */
export const COST_SOURCES = ["amazon", "rakuten", "official", "yahoo", "mercari", "yodobashi", "other", "manual"] as const;
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
export function cheapestQuote<T extends CostQuote>(rows: T[], preferred: string): T | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => a.priceJpy - b.priceJpy || (a.source === preferred ? -1 : b.source === preferred ? 1 : 0))[0];
}
