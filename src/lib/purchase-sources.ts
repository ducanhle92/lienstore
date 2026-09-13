import type { PurchaseSource, PurchaseSourceKind } from "@/types/shop";

/**
 * Registry of purchase sources ("Nguồn nhập"): where a ¥ price / a purchase can come from. Built-in web shops keep the
 * legacy keys used by `product_cost_sources.source`; the owner adds physical stores (with address / branch), auction
 * sites, second-hand shops… in Admin › Kho hàng › Nguồn nhập. Pure helpers (no DB).
 */
export const PURCHASE_SOURCE_KINDS: readonly PurchaseSourceKind[] = ["website", "store", "auction", "secondhand", "other"];
export const PURCHASE_KIND_LABEL: Record<PurchaseSourceKind, string> = {
  website: "Website",
  store: "Cửa hàng",
  auction: "Đấu giá",
  secondhand: "Đồ cũ / second-hand",
  other: "Khác",
};

/** Key of the pseudo-source used when the owner has not decided yet. */
export const UNKNOWN_SOURCE = "unknown";

export const BUILTIN_SOURCES: Array<Pick<PurchaseSource, "key" | "name" | "kind" | "url">> = [
  { key: "amazon", name: "Amazon.co.jp", kind: "website", url: "https://www.amazon.co.jp/" },
  { key: "rakuten", name: "Rakuten", kind: "website", url: "https://www.rakuten.co.jp/" },
  { key: "official", name: "Web chính hãng", kind: "website", url: "" },
  { key: "yahoo", name: "Yahoo! Shopping", kind: "website", url: "https://shopping.yahoo.co.jp/" },
  { key: "mercari", name: "Mercari", kind: "secondhand", url: "https://jp.mercari.com/" },
  { key: "yodobashi", name: "Yodobashi", kind: "website", url: "https://www.yodobashi.com/" },
  { key: "other", name: "Nguồn khác", kind: "other", url: "" },
  { key: "manual", name: "Nhập tay", kind: "other", url: "" },
  { key: UNKNOWN_SOURCE, name: "Chưa xác định — thêm sau", kind: "other", url: "" },
];

export function isPurchaseSourceKind(v: unknown): v is PurchaseSourceKind {
  return typeof v === "string" && (PURCHASE_SOURCE_KINDS as readonly string[]).includes(v);
}

/** Stable key from a display name: "Don Quijote Shibuya" → "don-quijote-shibuya". */
export function sourceKeyFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** Registered source whose website matches the pasted link (by host), else null. */
export function matchSourceByUrl<T extends Pick<PurchaseSource, "key" | "url">>(url: string, sources: T[]): T | null {
  const h = hostOf(url);
  if (!h) return null;
  let best: T | null = null;
  for (const s of sources) {
    const sh = hostOf(s.url);
    if (!sh) continue;
    if (h === sh || h.endsWith(`.${sh}`) || sh.endsWith(`.${h}`)) {
      if (!best || sh.length > hostOf(best.url).length) best = s;
    }
  }
  return best;
}

/** Display name of a source key against the registry (falls back to the raw key). */
export function purchaseSourceName(key: string, sources: Array<Pick<PurchaseSource, "key" | "name">>): string {
  return sources.find((s) => s.key === key)?.name ?? BUILTIN_SOURCES.find((s) => s.key === key)?.name ?? (key || "—");
}

/** Resolve a CSV value ("amazon", "Amazon.co.jp", "Don Quijote Shibuya") to a registry key; null when unknown. */
export function resolvePurchaseSourceKey(value: string, sources: Array<Pick<PurchaseSource, "key" | "name">>): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  const byKey = sources.find((s) => s.key.toLowerCase() === v);
  if (byKey) return byKey.key;
  const byName = sources.find((s) => s.name.toLowerCase() === v);
  if (byName) return byName.key;
  if (/^chưa xác định|^chua xac dinh|^unknown/.test(v)) return UNKNOWN_SOURCE;
  return null;
}

/** One-line description for lists: kind + address / branch / url. */
export function purchaseSourceDetail(s: Pick<PurchaseSource, "kind" | "url" | "address" | "branch">): string {
  const parts = [PURCHASE_KIND_LABEL[s.kind]];
  if (s.branch) parts.push(s.branch);
  if (s.address) parts.push(s.address);
  if (s.url) parts.push(hostOf(s.url) || s.url);
  return parts.join(" · ");
}
