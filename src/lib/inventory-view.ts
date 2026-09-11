import type { InventoryLine, StockState } from "./inventory";

/**
 * Filter + sort of the inventory table, shared by the admin page and the CSV export so "xuất CSV" prints exactly what
 * is on screen. Pure: works on `InventoryLine[]` and a plain params record.
 */
export type Track = "all" | "tracked" | "untracked";
export type Need = "all" | "order" | "restock";
export type SortKey = "id" | "sku" | "name" | "state" | "stock" | "pipeline" | "orders" | "need" | "cost" | "value" | "supplier";

export interface InventoryView {
  track: Track;
  state: StockState | "";
  need: Need;
  q: string;
  category: string;
  sort: SortKey;
  dir: "asc" | "desc";
}

const STATE_RANK: Record<StockState, number> = { out: 0, low: 1, ok: 2, untracked: 3 };
const pick = <T extends string>(v: string, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** Read the view from query params; legacy `view=` links (stat cards, bookmarks) still work. */
export function parseInventoryView(sp: Record<string, string | string[] | undefined>): InventoryView {
  const first = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const legacy = first("view");
  const track = pick(first("track"), ["all", "tracked", "untracked"] as const, legacy === "tracked" || legacy === "low" || legacy === "out" ? "tracked" : legacy === "untracked" ? "untracked" : "all");
  const state = pick(first("state"), ["out", "low", "ok"] as const, legacy === "low" || legacy === "out" ? (legacy as StockState) : ("" as StockState | "")) as StockState | "";
  const need = pick(first("need"), ["all", "order", "restock"] as const, legacy === "order" ? "order" : "all");
  const sort = pick(first("sort"), ["id", "sku", "name", "state", "stock", "pipeline", "orders", "need", "cost", "value", "supplier"] as const, "state");
  const dir = pick(first("dir"), ["asc", "desc"] as const, sort === "state" || sort === "name" || sort === "id" || sort === "sku" ? "asc" : "desc");
  return { track, state: track === "tracked" ? state : "", need, q: first("q").trim().toLowerCase(), category: first("category"), sort, dir };
}

export function inventoryHref(v: InventoryView, over: Partial<InventoryView> = {}, base = "/admin/inventory/"): string {
  const n = { ...v, ...over };
  if (over.track && over.track !== "tracked" && over.state === undefined) n.state = "";
  const qs = new URLSearchParams();
  if (n.track !== "all") qs.set("track", n.track);
  if (n.state) qs.set("state", n.state);
  if (n.need !== "all") qs.set("need", n.need);
  if (n.q) qs.set("q", n.q);
  if (n.category) qs.set("category", n.category);
  if (n.sort !== "state") qs.set("sort", n.sort);
  if (n.sort !== "state" && n.dir !== "desc") qs.set("dir", n.dir);
  const s = qs.toString();
  return `${base}${s ? `?${s}` : ""}`;
}

/** Link for a header click: same column → flip direction, other column → that column with its natural direction. */
export function sortHref(v: InventoryView, key: SortKey): string {
  const natural: "asc" | "desc" = key === "name" || key === "id" || key === "sku" || key === "state" || key === "supplier" ? "asc" : "desc";
  const dir = v.sort === key ? (v.dir === "asc" ? "desc" : "asc") : natural;
  return inventoryHref(v, { sort: key, dir });
}

const cmpStr = (a: string, b: string) => a.localeCompare(b, "vi");
const num = (n: number | null | undefined) => (n === null || n === undefined ? Number.NEGATIVE_INFINITY : n);

export function applyInventoryView(lines: InventoryLine[], v: InventoryView): InventoryLine[] {
  const out = lines
    .filter((l) => !v.q || `${l.product.name} ${l.product.slug} ${l.product.sku ?? ""} #${l.product.id}`.toLowerCase().includes(v.q))
    .filter((l) => !v.category || l.product.categories.includes(v.category))
    .filter((l) => (v.track === "tracked" ? l.product.stock !== null : v.track === "untracked" ? l.product.stock === null : true))
    .filter((l) => !v.state || (v.track === "tracked" && l.state === v.state))
    .filter((l) => (v.need === "order" ? l.demand > 0 && l.toBuy > 0 : v.need === "restock" ? l.toBuy > 0 && l.demand === 0 : true));
  const dirMul = v.dir === "asc" ? 1 : -1;
  const cmp = (a: InventoryLine, b: InventoryLine): number => {
    switch (v.sort) {
      case "id":
        return a.product.id - b.product.id;
      case "sku":
        return cmpStr(a.product.sku ?? "￿", b.product.sku ?? "￿");
      case "name":
        return cmpStr(a.product.name, b.product.name);
      case "stock":
        return num(a.product.stock) - num(b.product.stock);
      case "pipeline":
        return a.pipeline.pipeline - b.pipeline.pipeline;
      case "orders":
        return a.demand - b.demand;
      case "need":
        return a.toBuy - b.toBuy;
      case "cost":
        return num(a.product.costPrice) - num(b.product.costPrice);
      case "value":
        return a.stockValue - b.stockValue;
      case "supplier":
        return cmpStr(a.product.supplierUrl ?? "￿", b.product.supplierUrl ?? "￿");
      case "state":
      default:
        return STATE_RANK[a.state] - STATE_RANK[b.state];
    }
  };
  return out.sort((a, b) => cmp(a, b) * dirMul || cmpStr(a.product.name, b.product.name));
}
