/**
 * Từng cái (stock units) — pure helpers shared by the DB layer, the admin screens and the node:test suite.
 *
 * Every physical item the shop buys gets its own short code, e.g. `H0001235`:
 *   "H" (hàng) + the running number zero-padded to 6 digits + one Damm check digit.
 * The check digit catches every single-digit typo and every swap of two neighbouring digits, so a code read off a
 * label or typed during a stock check is either right or rejected. Short, all caps + digits: fits Code 128 / QR.
 *
 * The levels above a unit are derived, never stored twice: the bill line (same product bought on the same bill at the
 * same price / expiry), the bill (purchase_receipts.code), the product (SKU) and the variant group (product_groups.code).
 */
import { type PurchaseStatus, purchaseIndex } from "./purchase";

// ---------- codes ----------

/** Damm quasigroup (order 10, weakly totally anti-symmetric). */
const DAMM: number[][] = [
  [0, 3, 1, 7, 5, 9, 8, 6, 4, 2],
  [7, 0, 9, 2, 1, 5, 4, 8, 6, 3],
  [4, 2, 0, 6, 8, 7, 1, 3, 5, 9],
  [1, 7, 5, 0, 9, 8, 3, 4, 2, 6],
  [6, 1, 2, 3, 0, 4, 5, 9, 7, 8],
  [3, 6, 7, 4, 2, 0, 9, 5, 8, 1],
  [5, 8, 6, 9, 7, 2, 0, 1, 3, 4],
  [8, 9, 4, 5, 3, 6, 2, 0, 1, 7],
  [9, 4, 3, 8, 6, 1, 7, 2, 0, 5],
  [2, 5, 8, 1, 4, 3, 6, 7, 9, 0],
];

export function dammDigit(digits: string): number {
  let interim = 0;
  for (const ch of digits) interim = DAMM[interim][ch.charCodeAt(0) - 48];
  return interim;
}

export const UNIT_PREFIX = "H";

/** Code of the unit with this id: H + 6+ digits + check digit. */
export function unitCode(id: number): string {
  const body = String(Math.max(0, Math.floor(id))).padStart(6, "0");
  return `${UNIT_PREFIX}${body}${dammDigit(body)}`;
}

/** Normalises what was typed / scanned ("h 000123-5", "H0001235") → "H0001235", or null when it is not a valid code. */
export function parseUnitCode(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  const m = s.match(/^H(\d{7,})$/);
  if (!m) return null;
  const body = m[1].slice(0, -1);
  return dammDigit(body) === Number(m[1].slice(-1)) ? `H${m[1]}` : null;
}

/** Unit id encoded in a (valid) code. */
export function unitIdOf(code: string): number | null {
  const c = parseUnitCode(code);
  return c ? Number.parseInt(c.slice(1, -1), 10) : null;
}

// ---------- status of a unit ----------

/** Units that physically exist (in the shop's hands or on the way) — "not_bought" (dự định mua) and "ordered" do not yet. */
export function unitInHand(s: PurchaseStatus): boolean {
  return purchaseIndex(s) >= purchaseIndex("bought") && purchaseIndex(s) <= purchaseIndex("at_shop");
}
/** Units that left the shop for the customer. */
export function unitDelivered(s: PurchaseStatus): boolean {
  return purchaseIndex(s) >= purchaseIndex("shipped_to_customer");
}

export type UnitRemoved = "lost" | "damaged" | "written_off";
export const UNIT_REMOVED_LABEL: Record<UnitRemoved, string> = { lost: "Thất lạc", damaged: "Hỏng / vỡ", written_off: "Loại bỏ (hết hạn…)" };
export function isUnitRemoved(v: unknown): v is UnitRemoved {
  return v === "lost" || v === "damaged" || v === "written_off";
}

export type UnitOrigin = "bill" | "order" | "count" | "manual" | "return" | "legacy";
export const UNIT_ORIGIN_LABEL: Record<UnitOrigin, string> = { bill: "Theo bill", order: "Mua theo đơn", count: "Kiểm kê (thừa)", manual: "Nhập tay", return: "Khách trả lại", legacy: "Chuyển từ lô cũ" };

// ---------- which unit serves an order line ----------

/**
 * Place rank of a unit, nearest the customer first (owner's rule "vị trí trước, hạn dùng sau"):
 * Kho VN → đang về kho shop → Kho ĐVVC VN → đang bay → Kho ĐVVC Nhật → Kho Nhật → đã đặt mua online → dự định mua trong đợt.
 */
export const PLACE_RANK: Partial<Record<PurchaseStatus, number>> = { at_shop: 0, to_shop: 1, at_carrier_vn: 2, shipped_jp_vn: 3, to_carrier_jp: 4, bought: 5, ordered: 6, not_bought: 7 };

/** A unit that could serve a waiting line (free, alive, not delivered). */
export function unitServes(s: PurchaseStatus): boolean {
  return PLACE_RANK[s] !== undefined;
}

const FAR = "9999-12-31";
/** Last day of an expiry written as YYYY-MM-DD or YYYY-MM. */
export const expiryEnd = (e: string) => (/^\d{4}-\d{2}$/.test(e) ? `${e}-31` : e.slice(0, 10));
export function unitExpired(expiry: string | null, today = new Date().toISOString().slice(0, 10)): boolean {
  return !!expiry && expiryEnd(expiry) < today;
}

export interface RankedUnit {
  id: number;
  status: PurchaseStatus;
  expiry: string | null;
  boughtAt: string | null;
}
/** Lower = served first: place, then nearest expiry (FEFO), then bought earlier, then the oldest code. */
export function unitRank(u: RankedUnit): [number, string, string, number] {
  return [PLACE_RANK[u.status] ?? 99, u.expiry ? expiryEnd(u.expiry) : FAR, u.boughtAt ?? FAR, u.id];
}
export function sortUnits<T extends RankedUnit>(units: T[]): T[] {
  return [...units].sort((a, b) => {
    const ka = unitRank(a);
    const kb = unitRank(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });
}

/** The least advanced status of a set (a line / an order / a bill line shows its slowest unit). */
export function slowestStatus(statuses: PurchaseStatus[]): PurchaseStatus {
  if (!statuses.length) return "not_bought";
  return statuses.reduce((min, s) => (purchaseIndex(s) < purchaseIndex(min) ? s : min));
}

// ---------- the order stage implied by where its units are ----------

export type DerivedStage = "ordered" | "sent" | "in_transit" | "vn_warehouse" | "delivering" | "delivered";
/**
 * `slowest` = slowest unit of the whole order (every line fully covered); `allBoxed` = every unit sits in a packing run
 * that is closed ("Đã đóng xong") or further. Returns the stage the goods prove.
 */
export function stageFromUnits(slowest: PurchaseStatus, allBoxed: boolean): DerivedStage {
  if (slowest === "delivered") return "delivered";
  if (slowest === "shipped_to_customer") return "delivering";
  if (slowest === "at_shop") return "vn_warehouse";
  if (purchaseIndex(slowest) >= purchaseIndex("to_carrier_jp")) return "in_transit";
  if (slowest === "bought" && allBoxed) return "sent";
  return "ordered";
}

/** Unit status a manual order stage stands for (the order's units behind it are moved there). */
export const STAGE_UNIT_STATUS: Partial<Record<string, PurchaseStatus>> = { in_transit: "to_carrier_jp", vn_warehouse: "at_shop", delivering: "shipped_to_customer", delivered: "delivered" };

// ---------- bill line (tầng giữa) ----------

export interface GroupableUnit {
  productId: number;
  receiptId: number | null;
  sourceKey: string;
  store: string;
  boughtAt: string | null;
  expiry: string | null;
  unitCostJpy: number | null;
  batchId: number | null;
}
/** Units bought together on one bill at the same price / expiry = one bill line. */
export function billLineKey(u: GroupableUnit): string {
  return [u.productId, u.receiptId ?? "-", u.sourceKey, u.store, u.boughtAt ?? "-", u.expiry ?? "-", u.unitCostJpy ?? "-", u.batchId ?? "-"].join("|");
}

// ---------- variant group code ----------

const foldAscii = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d");
/** Memorable code from the group name: first meaningful words, ASCII caps, dash-joined, ≤ 24 chars ("HATOMUGI-SUA-TAM"). */
export function groupCodeFromName(name: string): string {
  const words = foldAscii(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let out = "";
  for (const w of words) {
    const next = out ? `${out}-${w}` : w;
    if (next.length > 24) break;
    out = next;
  }
  return out || "NHOM";
}
/** Cleans a typed group code (caps, A–Z 0–9 and dashes). */
export function normalizeGroupCode(raw: string): string {
  return foldAscii(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}
