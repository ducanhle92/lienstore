import type { StockLot } from "@/types/shop";

/**
 * Stock lots ("lô hàng"): every unit at the shop warehouse belongs to a lot that remembers when it arrived, from which
 * source, at what cost, its expiry date and where it is shelved. Pure helpers (no DB).
 */
export type ExpiryState = "expired" | "soon" | "ok" | "none";

/** Days until the lot expires (negative = already expired); null when no expiry. */
export function daysToExpiry(expiry: string | null, today = new Date()): number | null {
  if (!expiry) return null;
  const t = Date.parse(`${expiry}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const d0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((t - d0) / 86400000);
}

/** Warning level: expired · within `soonDays` (default 90) · fine · no date. */
export function expiryState(expiry: string | null, soonDays = 90, today = new Date()): ExpiryState {
  const d = daysToExpiry(expiry, today);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= soonDays) return "soon";
  return "ok";
}

export const EXPIRY_LABEL: Record<ExpiryState, string> = { expired: "Hết hạn", soon: "Sắp hết hạn", ok: "Còn hạn", none: "Không có HSD" };

/** FEFO order: earliest expiry first (no expiry last), then oldest receipt, then id. */
export function fefo<T extends Pick<StockLot, "expiry" | "receivedAt" | "id">>(lots: T[]): T[] {
  return [...lots].sort((a, b) => {
    if (a.expiry && b.expiry && a.expiry !== b.expiry) return a.expiry < b.expiry ? -1 : 1;
    if (!!a.expiry !== !!b.expiry) return a.expiry ? -1 : 1;
    if (a.receivedAt !== b.receivedAt) return a.receivedAt < b.receivedAt ? -1 : 1;
    return a.id - b.id;
  });
}

/** Plan how `qty` units leave the lots (FEFO); returns [lotId, take] pairs and the shortfall that no lot could cover. */
export function planConsumption<T extends Pick<StockLot, "expiry" | "receivedAt" | "id" | "qtyLeft">>(lots: T[], qty: number): { takes: Array<[number, number]>; short: number } {
  const takes: Array<[number, number]> = [];
  let left = Math.max(0, Math.floor(qty));
  for (const l of fefo(lots)) {
    if (left <= 0) break;
    const take = Math.min(l.qtyLeft, left);
    if (take > 0) {
      takes.push([l.id, take]);
      left -= take;
    }
  }
  return { takes, short: left };
}

/** Accepts "2027-03-31", "31/03/2027", "2027-03" (→ last day of month), "03/2027"; returns ISO date or null. */
export function parseExpiry(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = /^(\d{4})[-/](\d{1,2})$/.exec(s);
  if (m) return iso(+m[1], +m[2], lastDay(+m[1], +m[2]));
  m = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return iso(+m[2], +m[1], lastDay(+m[2], +m[1]));
  // Japanese style 2027.03 / 2027年3月
  m = /^(\d{4})[.年](\d{1,2})月?$/.exec(s);
  if (m) return iso(+m[1], +m[2], lastDay(+m[1], +m[2]));
  return null;
}
const lastDay = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > lastDay(y, mo)) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export const todayIso = (d = new Date()) => d.toISOString().slice(0, 10);
