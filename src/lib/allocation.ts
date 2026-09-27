/**
 * Which stock serves an order line ("Phân bổ nguồn hàng"). Pure planner shared by the DB layer and the node:test suite.
 *
 * Priority (owner's rule): everything ALREADY BOUGHT first — lots in any warehouse (VN, ĐVVC, Nhật) and stock purchases
 * that are bought but not yet booked as lots — ordered FEFO (nearest expiry first); same / unknown expiry → the place
 * closest to Vietnam first (VN → ĐVVC → Nhật → purchase slip, slips closer to VN first). Then slips still to buy inside
 * a gathering batch, then plain "mua lưu kho" slips not bought yet. Whatever is left is "Cần mua".
 */
import { type PurchaseStatus, purchaseIndex } from "./purchase";
import type { Warehouse } from "./warehouses";

export type AllocSourceType = "lot" | "stock_purchase" | "batch" | "buy";

export interface AllocCandidate {
  type: "lot" | "stock_purchase";
  id: number;
  /** Units not reserved by any other line. */
  available: number;
  expiry: string | null;
  /** Lots only. */
  warehouse: Warehouse | null;
  /** Lots only: on the plane / truck between two warehouses. */
  inTransit?: boolean;
  /** Stock purchases only (lots are implicitly "at their warehouse"). */
  status: PurchaseStatus | null;
  /** Stock purchases only: the gathering batch they belong to. */
  batchId: number | null;
  /** Bought / received date — earlier bills serve orders first. */
  boughtAt?: string | null;
}

export interface AllocTake {
  type: "lot" | "stock_purchase";
  id: number;
  qty: number;
}

const WH_RANK: Record<Warehouse, number> = { vn: 0, carrier: 1, jp_carrier: 2, jp: 3 };
const FAR = "9999-12-31";

/** 0 = already bought (lots + bought slips), 1 = slip waiting in a batch, 2 = slip waiting outside a batch. */
export function candidateTier(c: AllocCandidate): 0 | 1 | 2 {
  if (c.type === "lot") return 0;
  if (c.status && purchaseIndex(c.status) >= purchaseIndex("bought")) return 0;
  return c.batchId ? 1 : 2;
}

/** Lower = served first. Tier, then FEFO (bought tier only), then nearer to Vietnam, then bought earlier, then oldest id. */
export function candidateRank(c: AllocCandidate): [number, string, number, string, number] {
  const tier = candidateTier(c);
  const expiry = tier === 0 ? (c.expiry ?? FAR) : FAR;
  const place = c.type === "lot" ? WH_RANK[c.warehouse ?? "jp"] : 3 + Math.max(0, purchaseIndex("at_shop") - purchaseIndex(c.status ?? "not_bought"));
  return [tier, expiry, place, c.boughtAt ?? FAR, c.id];
}

export function sortCandidates<T extends AllocCandidate>(cands: T[]): T[] {
  return [...cands].sort((a, b) => {
    const ka = candidateRank(a);
    const kb = candidateRank(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });
}

/** Serve `need` units from the candidates in priority order; `short` is what has to be bought. */
export function planAllocation(need: number, cands: AllocCandidate[]): { takes: AllocTake[]; short: number } {
  const takes: AllocTake[] = [];
  let left = Math.max(0, Math.floor(need));
  for (const c of sortCandidates(cands)) {
    if (left <= 0) break;
    const avail = Math.max(0, Math.floor(c.available));
    if (avail <= 0) continue;
    const qty = Math.min(avail, left);
    takes.push({ type: c.type, id: c.id, qty });
    left -= qty;
  }
  return { takes, short: left };
}

/** Purchase status an order line inherits from one of its sources. */
export function statusFromSource(src: { type: AllocSourceType; warehouse?: Warehouse | null; inTransit?: boolean; status?: PurchaseStatus | null; consumed?: boolean }): PurchaseStatus {
  if (src.type === "buy") return "not_bought";
  if (src.type === "lot") {
    if (!src.warehouse) return "at_shop"; // legacy row: the lot was deducted at order time
    if (src.warehouse === "vn") return "at_shop";
    if (src.warehouse === "carrier") return src.inTransit ? "to_shop" : "at_carrier_vn";
    if (src.warehouse === "jp_carrier") return src.inTransit ? "shipped_jp_vn" : "to_carrier_jp";
    return "bought";
  }
  const s = src.status ?? "not_bought";
  return purchaseIndex(s) > purchaseIndex("at_shop") ? "at_shop" : s;
}

/** A line with several sources shows the least advanced one (the part still on its way). */
export function combineStatuses(statuses: PurchaseStatus[]): PurchaseStatus {
  if (!statuses.length) return "not_bought";
  return statuses.reduce((min, s) => (purchaseIndex(s) < purchaseIndex(min) ? s : min));
}
