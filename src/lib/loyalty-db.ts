import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { type CustomerTier, isTier } from "./customer-tiers";

/**
 * Chính sách điểm thưởng (hậu mãi): delivered orders earn points by the buyer's tier, points are money off later
 * orders. Ledger table `loyalty_points` (earn / redeem / adjust / reverse); the balance is the sum. An order the admin
 * ticks "loại khỏi hậu mãi" (already discounted by hand) earns nothing and does not count for the tier.
 */

export interface LoyaltyRules {
  /** VND one point is worth when redeemed. */
  pointValue: number;
  /** Percent of the goods value (subtotal − discounts) of a delivered order that comes back as points, per tier. */
  earnPct: Record<CustomerTier, number>;
  /** Orders below this goods value earn nothing (0 = all). */
  minOrder: number;
}
export const LOYALTY_DEFAULTS: LoyaltyRules = { pointValue: 1000, earnPct: { "": 0, silver: 1, gold: 2, diamond: 3 }, minOrder: 0 };
const KEY = "loyalty_rules";

export function loadLoyaltyRules(db: DatabaseSync): LoyaltyRules {
  const raw = (db.prepare("SELECT value FROM settings WHERE key = ?").get(KEY) as { value: string } | undefined)?.value;
  if (!raw) return LOYALTY_DEFAULTS;
  try {
    const v = JSON.parse(raw) as Partial<LoyaltyRules>;
    const n = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : d);
    const pct = (t: CustomerTier) => n(v.earnPct?.[t], LOYALTY_DEFAULTS.earnPct[t]);
    return { pointValue: Math.max(1, n(v.pointValue, LOYALTY_DEFAULTS.pointValue)), earnPct: { "": pct(""), silver: pct("silver"), gold: pct("gold"), diamond: pct("diamond") }, minOrder: n(v.minOrder, 0) };
  } catch {
    return LOYALTY_DEFAULTS;
  }
}
export function saveLoyaltyRules(db: DatabaseSync, rules: LoyaltyRules): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(KEY, JSON.stringify(rules));
}

export type LedgerKind = "earn" | "redeem" | "adjust" | "reverse";
export interface LedgerEntry {
  id: number;
  customerId: string;
  orderId: string | null;
  orderNumber: number | null;
  kind: LedgerKind;
  points: number;
  note: string;
  actor: string;
  createdAt: string;
}
const KIND_LABEL: Record<LedgerKind, string> = { earn: "Tích điểm", redeem: "Dùng điểm", adjust: "Điều chỉnh", reverse: "Hoàn / thu hồi" };
export const ledgerKindLabel = (k: string) => KIND_LABEL[k as LedgerKind] ?? k;

export function pointsBalanceSync(db: DatabaseSync, customerId: string): number {
  return (db.prepare("SELECT COALESCE(SUM(points), 0) AS n FROM loyalty_points WHERE customer_id = ?").get(customerId) as { n: number }).n;
}
export function ledgerSync(db: DatabaseSync, customerId: string, limit = 100): LedgerEntry[] {
  return (
    db
      .prepare(
        `SELECT l.id, l.customer_id, l.order_id, o.number AS order_number, l.kind, l.points, l.note, l.actor, l.created_at
           FROM loyalty_points l LEFT JOIN orders o ON o.id = l.order_id WHERE l.customer_id = ? ORDER BY l.id DESC LIMIT ?`,
      )
      .all(customerId, limit) as Array<{ id: number; customer_id: string; order_id: string | null; order_number: number | null; kind: string; points: number; note: string; actor: string; created_at: string }>
  ).map((r) => ({ id: r.id, customerId: r.customer_id, orderId: r.order_id, orderNumber: r.order_number, kind: r.kind as LedgerKind, points: r.points, note: r.note, actor: r.actor, createdAt: r.created_at }));
}
function add(db: DatabaseSync, e: { customerId: string; orderId: string | null; kind: LedgerKind; points: number; note?: string; actor?: string }): void {
  if (!e.points) return;
  db.prepare("INSERT INTO loyalty_points (customer_id, order_id, kind, points, note, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(e.customerId, e.orderId, e.kind, Math.round(e.points), (e.note ?? "").slice(0, 300), (e.actor ?? "").slice(0, 80), new Date().toISOString());
}

type OrderBits = { id: string; customer_id: string | null; status: string; ship_stage: string; subtotal: number; discount: number | null; loyalty_excluded: number | null; loyalty_points_used: number | null; loyalty_discount: number | null };
const orderBits = (db: DatabaseSync, orderId: string) =>
  db.prepare("SELECT id, customer_id, status, ship_stage, subtotal, discount, loyalty_excluded, loyalty_points_used, loyalty_discount FROM orders WHERE id = ?").get(orderId) as OrderBits | undefined;

/** Points a delivered order earns for a tier (goods value after every discount). */
export function pointsForOrder(goodsValue: number, tier: CustomerTier, rules: LoyaltyRules): number {
  if (goodsValue <= 0 || goodsValue < rules.minOrder) return 0;
  const pct = rules.earnPct[isTier(tier) ? tier : ""] ?? 0;
  return Math.floor((goodsValue * pct) / 100 / rules.pointValue);
}

/** Delivered → earn once (idempotent); nothing for cancelled / excluded orders or buyers without a profile. */
export function earnPointsSync(db: DatabaseSync, orderId: string, tier: CustomerTier, rules = loadLoyaltyRules(db)): number {
  const o = orderBits(db, orderId);
  if (!o || !o.customer_id || o.status === "cancelled" || o.ship_stage !== "delivered" || (o.loyalty_excluded ?? 0) === 1) return 0;
  // earned net of any take-back: an order put back into the programme earns again
  const net = (db.prepare("SELECT COALESCE(SUM(points), 0) AS n FROM loyalty_points WHERE order_id = ? AND kind IN ('earn','reverse')").get(orderId) as { n: number }).n;
  if (net > 0) return 0;
  const goods = Math.max(0, o.subtotal - (o.discount ?? 0));
  const pts = pointsForOrder(goods, tier, rules);
  add(db, { customerId: o.customer_id, orderId, kind: "earn", points: pts, note: `${rules.earnPct[tier] ?? 0}% của ${goods.toLocaleString("vi-VN")}đ (hạng ${tier || "chưa xếp"})` });
  return pts;
}

/** Cancelled / excluded afterwards: take the earned points back and refund the ones spent on the order. */
export function reversePointsSync(db: DatabaseSync, orderId: string, reason: string, opts: { refundRedeemed: boolean }): { takenBack: number; refunded: number } {
  const o = orderBits(db, orderId);
  if (!o || !o.customer_id) return { takenBack: 0, refunded: 0 };
  const earned = (db.prepare("SELECT COALESCE(SUM(points), 0) AS n FROM loyalty_points WHERE order_id = ? AND kind IN ('earn','reverse')").get(orderId) as { n: number }).n;
  let takenBack = 0;
  if (earned > 0) {
    add(db, { customerId: o.customer_id, orderId, kind: "reverse", points: -earned, note: reason });
    takenBack = earned;
  }
  let refunded = 0;
  if (opts.refundRedeemed) {
    // what is still spent on the order (redeem − undo − earlier refunds); idempotent
    const spent = (db.prepare("SELECT COALESCE(SUM(points), 0) AS n FROM loyalty_points WHERE order_id = ? AND kind IN ('redeem','adjust')").get(orderId) as { n: number }).n;
    if (spent < 0) {
      add(db, { customerId: o.customer_id, orderId, kind: "adjust", points: -spent, note: `Hoàn điểm đã dùng — ${reason}` });
      refunded = -spent;
      db.prepare("UPDATE orders SET loyalty_points_used = 0 WHERE id = ?").run(orderId);
    }
  }
  return { takenBack, refunded };
}

/**
 * "Dùng điểm" on an order: `points` (capped at the balance and at what the goods are worth) become money off:
 * orders.discount grows, loyalty_points_used / loyalty_discount remember the part that came from points, total follows.
 * `points` = 0 undoes the redemption of this order.
 */
export function redeemPointsSync(db: DatabaseSync, orderId: string, points: number, actor: string, rules = loadLoyaltyRules(db)): { ok: true; points: number; discount: number } | { ok: false; message: string } {
  const o = orderBits(db, orderId);
  if (!o) return { ok: false, message: "Không tìm thấy đơn." };
  if (!o.customer_id) return { ok: false, message: "Đơn chưa gắn hồ sơ khách." };
  if (o.status === "cancelled") return { ok: false, message: "Đơn đã huỷ." };
  if (o.ship_stage === "delivered") return { ok: false, message: "Đơn đã giao — không đổi điểm được nữa." };
  const used = o.loyalty_points_used ?? 0;
  const usedDiscount = o.loyalty_discount ?? 0;
  const balance = pointsBalanceSync(db, o.customer_id) + used; // what the customer could spend on this order
  const baseDiscount = (o.discount ?? 0) - usedDiscount; // voucher part
  const room = Math.max(0, o.subtotal - baseDiscount);
  const maxPts = Math.min(balance, Math.floor(room / rules.pointValue));
  const want = Math.max(0, Math.min(Math.floor(points), maxPts));
  if (points > 0 && want === 0) return { ok: false, message: balance <= 0 ? "Khách chưa có điểm." : "Đơn không còn chỗ để trừ điểm." };
  const delta = want - used;
  if (delta !== 0) add(db, { customerId: o.customer_id, orderId, kind: delta < 0 ? "adjust" : "redeem", points: -delta, note: delta < 0 ? "Bớt điểm đã dùng trên đơn" : `Trừ vào đơn: ${(want * rules.pointValue).toLocaleString("vi-VN")}đ`, actor });
  const discount = want * rules.pointValue;
  const total = recomputeTotalWithDiscount(db, o.id, baseDiscount + discount);
  db.prepare("UPDATE orders SET discount = ?, loyalty_points_used = ?, loyalty_discount = ?, total = ?, updated_at = ? WHERE id = ?").run(baseDiscount + discount, want, discount, total, new Date().toISOString(), o.id);
  return { ok: true, points: want, discount };
}

/** total = goods after discount + the fees already in the total (shipping / Japan legs stay as they are). */
function recomputeTotalWithDiscount(db: DatabaseSync, orderId: string, discount: number): number {
  const o = db.prepare("SELECT subtotal, discount, total FROM orders WHERE id = ?").get(orderId) as { subtotal: number; discount: number | null; total: number };
  const fees = o.total - Math.max(0, o.subtotal - (o.discount ?? 0));
  return Math.max(0, o.subtotal - discount) + Math.max(0, fees);
}

/** Admin tick on an order: out of the programme (already discounted by hand) — points taken back, tier re-derived by the caller. */
export function setOrderLoyaltyExcludedSync(db: DatabaseSync, orderId: string, excluded: boolean): string | null {
  const o = orderBits(db, orderId);
  if (!o) return null;
  db.prepare("UPDATE orders SET loyalty_excluded = ?, updated_at = ? WHERE id = ?").run(excluded ? 1 : 0, new Date().toISOString(), orderId);
  if (excluded) reversePointsSync(db, orderId, "Đơn loại khỏi hậu mãi (đã giảm trực tiếp)", { refundRedeemed: false });
  return o.customer_id;
}

export function adjustPointsSync(db: DatabaseSync, customerId: string, points: number, note: string, actor: string): void {
  add(db, { customerId, orderId: null, kind: "adjust", points, note: note || (points > 0 ? "Tặng điểm" : "Trừ điểm"), actor });
}

export interface LoyaltySummary {
  customerId: string;
  earned: number;
  redeemed: number;
  balance: number;
  firstOrderAt: string | null;
  excludedOrders: number;
}
export function loyaltySummariesSync(db: DatabaseSync): Map<string, LoyaltySummary> {
  const out = new Map<string, LoyaltySummary>();
  const mk = (id: string): LoyaltySummary => out.get(id) ?? { customerId: id, earned: 0, redeemed: 0, balance: 0, firstOrderAt: null, excludedOrders: 0 };
  for (const r of db.prepare("SELECT customer_id, SUM(CASE WHEN kind = 'earn' THEN points ELSE 0 END) AS earned, SUM(CASE WHEN kind = 'redeem' THEN -points ELSE 0 END) AS redeemed, SUM(points) AS balance FROM loyalty_points GROUP BY customer_id").all() as Array<{ customer_id: string; earned: number; redeemed: number; balance: number }>) {
    const s = mk(r.customer_id);
    s.earned = r.earned;
    s.redeemed = r.redeemed;
    s.balance = r.balance;
    out.set(r.customer_id, s);
  }
  for (const r of db.prepare("SELECT customer_id, MIN(created_at) AS first_at, SUM(CASE WHEN loyalty_excluded = 1 THEN 1 ELSE 0 END) AS excluded FROM orders WHERE customer_id IS NOT NULL AND status <> 'cancelled' GROUP BY customer_id").all() as Array<{ customer_id: string; first_at: string; excluded: number }>) {
    const s = mk(r.customer_id);
    s.firstOrderAt = r.first_at;
    s.excludedOrders = r.excluded;
    out.set(r.customer_id, s);
  }
  return out;
}
export function loyaltySummarySync(db: DatabaseSync, customerId: string): LoyaltySummary {
  return loyaltySummariesSync(db).get(customerId) ?? { customerId, earned: 0, redeemed: 0, balance: 0, firstOrderAt: null, excludedOrders: 0 };
}
