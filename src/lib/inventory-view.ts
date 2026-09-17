import type { InventoryLine, PipelineStage, StockState } from "./inventory";
import type { TransitWhere, Warehouse } from "./warehouses";

/**
 * Filter + sort of the inventory table, shared by the admin page and the CSV export so "xuất CSV" prints exactly what
 * is on screen. Pure: works on `InventoryLine[]` and a plain params record.
 */
export type Track = "all" | "tracked" | "untracked";
export type Need = "all" | "order" | "restock";
/** "Trạng thái theo dõi": a stage, or a stage narrowed to WHERE — in stock at one warehouse, or on the way at one point of the route. */
export type Pstatus = "" | Exclude<PipelineStage, null> | `in_stock_${Warehouse}` | `incoming_${TransitWhere}`;
export const PSTATUS_VALUES: readonly Pstatus[] = ["", "in_stock", "in_stock_jp", "in_stock_carrier", "in_stock_vn", "incoming", "incoming_jp", "incoming_transit", "incoming_carrier", "unbought"];
/** Warehouse a "in_stock_*" filter points at (for the per-warehouse stocktake CSV); null otherwise. */
export function warehouseOfPstatus(p: Pstatus): Warehouse | null {
  return p === "in_stock_jp" ? "jp" : p === "in_stock_carrier" ? "carrier" : p === "in_stock_vn" ? "vn" : null;
}
export function matchesPstatus(l: InventoryLine, p: Pstatus): boolean {
  if (!p) return true;
  if (p === "in_stock" || p === "incoming" || p === "unbought") return l.pipelineStage === p;
  const wh = warehouseOfPstatus(p);
  if (wh) return l.stockByWarehouse[wh] > 0;
  const where = p.replace(/^incoming_/, "") as TransitWhere;
  return l.incomingWhere[where] > 0;
}
/** Earliest lot expiry within … (from today). */
export type Expiry = "" | "1m" | "3m" | "6m" | "1y";
export const EXPIRY_DAYS: Record<Exclude<Expiry, "">, number> = { "1m": 30, "3m": 90, "6m": 180, "1y": 365 };
/** "Nên lưu kho": sells often enough that buying a lot for the warehouse (instead of per order) is worth considering. */
export type Advice = "" | "suggest";
export const STOCK_SUGGEST_MIN_SOLD = 3;
export type SortKey = "id" | "sku" | "name" | "state" | "stock" | "pipeline" | "orders" | "need" | "cost" | "value" | "supplier" | "sold" | "expiry";

export interface InventoryView {
  track: Track;
  state: StockState | "";
  need: Need;
  /** "Trạng thái theo dõi" (Đang lưu kho / Đang về / Chưa mua) — replaces the old state toggle in the UI. */
  pstatus: Pstatus;
  expiry: Expiry;
  advice: Advice;
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
  const pstatus = pick(first("pstatus"), PSTATUS_VALUES, "");
  const expiry = pick(first("expiry"), ["", "1m", "3m", "6m", "1y"] as const, "");
  const advice = pick(first("advice"), ["", "suggest"] as const, "");
  // "nên lưu kho" reads best fastest-selling first; an expiry filter reads soonest-expiring first
  const defaultSort: SortKey = advice === "suggest" ? "sold" : expiry ? "expiry" : "state";
  const sort = pick(first("sort"), ["id", "sku", "name", "state", "stock", "pipeline", "orders", "need", "cost", "value", "supplier", "sold", "expiry"] as const, defaultSort);
  const dir = pick(first("dir"), ["asc", "desc"] as const, sort === "state" || sort === "name" || sort === "id" || sort === "sku" || sort === "expiry" ? "asc" : "desc");
  return { track, state: track === "tracked" ? state : "", need, pstatus, expiry, advice, q: first("q").trim().toLowerCase(), category: first("category"), sort, dir };
}

export function inventoryHref(v: InventoryView, over: Partial<InventoryView> = {}, base = "/admin/inventory/"): string {
  const n = { ...v, ...over };
  if (over.track && over.track !== "tracked" && over.state === undefined) n.state = "";
  const qs = new URLSearchParams();
  if (n.track !== "all") qs.set("track", n.track);
  if (n.state) qs.set("state", n.state);
  if (n.need !== "all") qs.set("need", n.need);
  if (n.pstatus) qs.set("pstatus", n.pstatus);
  if (n.expiry) qs.set("expiry", n.expiry);
  if (n.advice) qs.set("advice", n.advice);
  if (n.q) qs.set("q", n.q);
  if (n.category) qs.set("category", n.category);
  if (n.sort !== "state") qs.set("sort", n.sort);
  if (n.sort !== "state" && n.dir !== "desc") qs.set("dir", n.dir);
  const s = qs.toString();
  return `${base}${s ? `?${s}` : ""}`;
}

/** Link for a header click: same column → flip direction, other column → that column with its natural direction. */
export function sortHref(v: InventoryView, key: SortKey): string {
  const natural: "asc" | "desc" = key === "name" || key === "id" || key === "sku" || key === "state" || key === "supplier" || key === "expiry" ? "asc" : "desc";
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
    .filter((l) => (v.need === "order" ? l.demand > 0 && l.toBuy > 0 : v.need === "restock" ? l.toBuy > 0 && l.demand === 0 : true))
    .filter((l) => matchesPstatus(l, v.pstatus))
    .filter((l) => !v.expiry || (l.minExpiryDays !== null && l.minExpiryDays <= EXPIRY_DAYS[v.expiry]))
    .filter((l) => v.advice !== "suggest" || l.soldRecent >= STOCK_SUGGEST_MIN_SOLD);
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
      case "sold":
        return a.soldRecent - b.soldRecent;
      case "expiry":
        // products without a dated lot sort after every dated one in the natural (ascending) order
        return (a.minExpiryDays ?? Number.POSITIVE_INFINITY) - (b.minExpiryDays ?? Number.POSITIVE_INFINITY);
      case "state":
      default:
        return STATE_RANK[a.state] - STATE_RANK[b.state];
    }
  };
  return out.sort((a, b) => cmp(a, b) * dirMul || cmpStr(a.product.name, b.product.name));
}
