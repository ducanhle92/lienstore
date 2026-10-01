import type { DatabaseSync } from "node:sqlite";
import { PURCHASE_STAGES, type PurchaseStatus, purchaseIndex } from "./purchase";
import { getDb, withTransaction } from "./sqlite";
import { billLineKey, sortUnits, unitExpired } from "./units";
import { autoServeOrderSync, commitOrderSync as commitUnitsSync, listUnits, pinUnitsToItemSync, releaseItemToBuySync, releaseOrderSync as releaseUnitsSync, resyncAllUnitsSync, touchSync, type UnitView } from "./units-db";

/**
 * Nguồn hàng of order lines — which units (lib/units-db.ts) serve each line, as the order page and the stock screens
 * show it. Serving is automatic (oldest order first; nearest place, then nearest expiry, then the earlier bill); the
 * admin can pin a bill line to a line or send it back to "Cần mua". This module never imports lib/db.ts.
 */

export type AllocSourceType = "unit" | "buy";

// ---------- order life cycle (called by db.ts inside its transactions) ----------

/** A new / re-opened order: its lines take units (and everything that depends on them is re-derived). */
export function allocateOrderSync(db: DatabaseSync, orderId: string, reset = false): void {
  if (reset) autoServeOrderSync(db, orderId);
  touchSync(db, { orderIds: [orderId] });
}
/** Stock deducted for real: the order's units can no longer go to another order. */
export function commitOrderSync(db: DatabaseSync, orderId: string): number {
  return commitUnitsSync(db, orderId);
}
/** Cancel / delete: the order's units return to stock, then waiting orders are served from them. */
export function releaseOrderSync(db: DatabaseSync, orderId: string): { released: number } {
  const r = releaseUnitsSync(db, orderId);
  touchSync(db, { productIds: r.productIds });
  return { released: r.released };
}

// ---------- read side (order page, Hàng theo đơn, Mua theo đặt hàng) ----------

export interface AllocationView {
  /** Stable key of the row (bill line + place, or "buy"). */
  id: string;
  orderItemId: number;
  sourceType: AllocSourceType;
  qty: number;
  manual: boolean;
  /** Deducted for a paid / COD order. */
  consumedAt: string | null;
  /** Short badge text ("Có sẵn · Kho VN", "Đang vận chuyển JP→VN", "Đã đặt mua", "Cần mua"). */
  label: string;
  /** Second line ("bill BILL_… · HSD 03/2027 · đợt DG-…"). */
  detail: string;
  status: PurchaseStatus;
  tone: "green" | "sky" | "amber" | "gray";
  /** Codes of the units (H…). */
  codes: string[];
}

const fmtDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const PLACE_LABEL: Partial<Record<PurchaseStatus, string>> = {
  not_bought: "Dự định mua (trong đợt)",
  ordered: "Đã đặt mua · chưa nhận",
  bought: "Có sẵn · Kho Nhật (shop)",
  to_carrier_jp: "Có sẵn · Kho ĐVVC Nhật",
  shipped_jp_vn: "Có sẵn · Đang vận chuyển JP→VN",
  at_carrier_vn: "Sắp về kho shop · Kho ĐVVC VN",
  to_shop: "Đang về kho shop VN",
  at_shop: "Có sẵn · Kho VN",
  shipped_to_customer: "Đang giao cho khách",
  delivered: "Khách đã nhận",
};
export const placeLabel = (s: PurchaseStatus) => PLACE_LABEL[s] ?? PURCHASE_STAGES[purchaseIndex(s)].label;
const toneOf = (s: PurchaseStatus, committed: boolean): AllocationView["tone"] => (committed || s === "at_shop" || purchaseIndex(s) > purchaseIndex("at_shop") ? "green" : purchaseIndex(s) >= purchaseIndex("bought") ? "sky" : "amber");

export function listAllocationViews(db: DatabaseSync, itemIds: number[]): AllocationView[] {
  if (!itemIds.length) return [];
  const units = listUnits(db, { itemIds, withDelivered: true });
  const lines = db.prepare(`SELECT id, quantity FROM order_items WHERE id IN (${itemIds.map(() => "?").join(",")})`).all(...itemIds) as Array<{ id: number; quantity: number }>;
  const out: AllocationView[] = [];
  for (const l of lines) {
    const mine = units.filter((u) => u.itemId === l.id);
    const groups = new Map<string, UnitView[]>();
    for (const u of mine) {
      const k = `${billLineKey(u)}|${u.status}|${u.committed ? 1 : 0}`;
      groups.set(k, [...(groups.get(k) ?? []), u]);
    }
    for (const [k, g] of groups) {
      const u = g[0];
      const detail = [u.receiptCode ? `bill ${u.receiptCode}` : "chưa có bill", u.expiry ? `HSD ${fmtDate(u.expiry)}` : "", u.batchCode ? `đợt ${u.batchCode}` : "", u.shipmentCode ? `chuyến ${u.shipmentCode}` : ""].filter(Boolean).join(" · ");
      out.push({ id: k, orderItemId: l.id, sourceType: "unit", qty: g.length, manual: g.some((x) => x.manual), consumedAt: u.committed ? u.updatedAt : null, label: `${u.committed && purchaseIndex(u.status) <= purchaseIndex("at_shop") ? "Đã trừ kho · " : ""}${placeLabel(u.status)}`, detail, status: u.status, tone: toneOf(u.status, u.committed), codes: g.map((x) => x.code) });
    }
    const short = l.quantity - mine.length;
    if (short > 0) out.push({ id: `buy:${l.id}`, orderItemId: l.id, sourceType: "buy", qty: short, manual: false, consumedAt: null, label: "Cần mua", detail: "", status: "not_bought", tone: "gray", codes: [] });
  }
  return out;
}

export interface SourceOption {
  /** "grp:<unit id>" — take units of the bill line / place this unit belongs to. */
  value: string;
  label: string;
  available: number;
}

/** Bill lines (by place) with free units of the product — what the admin can pin to a line. */
export function listSourceOptions(db: DatabaseSync, productId: number, itemId: number): SourceOption[] {
  const today = new Date().toISOString().slice(0, 10);
  const free = listUnits(db, { productId, free: true }).filter((u) => purchaseIndex(u.status) <= purchaseIndex("at_shop"));
  const taken = heldByOthers(db, productId, itemId);
  const groups = new Map<string, UnitView[]>();
  for (const u of sortUnits(free)) {
    const k = `${billLineKey(u)}|${u.status}`;
    groups.set(k, [...(groups.get(k) ?? []), u]);
  }
  return [...groups.values()].map((g) => {
    const u = g[0];
    const expired = unitExpired(u.expiry, today);
    return { value: `grp:${u.id}`, label: `${placeLabel(u.status)} · ${u.receiptCode || "chưa có bill"}${u.expiry ? ` · HSD ${fmtDate(u.expiry)}${expired ? " (hết hạn)" : ""}` : ""} · trống ${g.length}`, available: g.length };
  }).concat(
    // units another (not yet paid) order holds: picking one moves them to this line, that order goes back to "Cần mua"
    [...groupHeld(taken).values()].map((g) => {
      const u = g[0];
      return { value: `take:${u.id}`, label: `${placeLabel(u.status)} · ${u.receiptCode || "chưa có bill"} · đang giữ cho #${u.orderNumber} — lấy ${g.length} cho đơn này`, available: g.length };
    }),
  );
}

/** Units of the product that other open, not-yet-paid order lines hold (at most at Kho VN) — what this line could take. */
export function heldByOthers(db: DatabaseSync, productId: number, itemId: number): UnitView[] {
  return listUnits(db, { productId }).filter((u) => u.itemId && u.itemId !== itemId && !u.committed && !u.removed && purchaseIndex(u.status) <= purchaseIndex("at_shop") && (u.orderStatus === "pending" || u.orderStatus === "processing"));
}
function groupHeld(units: UnitView[]): Map<string, UnitView[]> {
  const m = new Map<string, UnitView[]>();
  for (const u of sortUnits(units)) {
    const k = `${billLineKey(u)}|${u.status}|${u.itemId}`;
    m.set(k, [...(m.get(k) ?? []), u]);
  }
  return m;
}

/** Admin override: "buy" (Cần mua) or "grp:<unit id>" (units of that bill line / place). */
export async function setManualAllocation(itemId: number, value: string): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  return withTransaction(db, () => {
    const line = db.prepare("SELECT id, product_id, quantity FROM order_items WHERE id = ?").get(itemId) as { id: number; product_id: number; quantity: number } | undefined;
    if (!line) return { ok: false, message: "Không tìm thấy dòng đơn." };
    if (value === "buy") {
      const n = releaseItemToBuySync(db, itemId);
      touchSync(db, { productIds: [line.product_id], itemIds: [itemId] });
      return { ok: true, message: n ? `Đã trả ${n} cái về tồn — dòng chuyển về “Cần mua”.` : "Dòng đơn chuyển về “Cần mua”." };
    }
    const t = value.match(/^take:(\d+)$/);
    if (t) {
      // take the units of that bill line from the other order (it re-serves from free stock or waits as "Cần mua")
      const pick = heldByOthers(db, line.product_id, itemId).find((u) => u.id === Number(t[1]));
      if (!pick) return { ok: false, message: "Nguồn này không còn (đơn kia đã thanh toán hoặc đã đổi)." };
      const key = `${billLineKey(pick)}|${pick.status}|${pick.itemId}`;
      const ids = [...(groupHeld(heldByOthers(db, line.product_id, itemId)).get(key) ?? [])].map((u) => u.id);
      db.prepare(`UPDATE stock_units SET order_item_id = NULL, manual = 0 WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
      const r = pinUnitsToItemSync(db, itemId, ids);
      touchSync(db, { productIds: [line.product_id], itemIds: [itemId, pick.itemId!] });
      return { ok: true, message: `Đã lấy ${r.taken} cái từ đơn #${pick.orderNumber} cho đơn này${r.need > 0 ? `; ${r.need} cái còn lại là “Cần mua”` : ""}. Đơn #${pick.orderNumber} tự tìm hàng khác hoặc chuyển về “Cần mua”.` };
    }
    const m = value.match(/^grp:(\d+)$/);
    if (!m) return { ok: false, message: "Nguồn không hợp lệ." };
    const pick = listUnits(db, { ids: [Number(m[1])] })[0];
    if (!pick || pick.productId !== line.product_id) return { ok: false, message: "Nguồn này không còn." };
    const key = `${billLineKey(pick)}|${pick.status}`;
    const same = sortUnits(listUnits(db, { productId: line.product_id, free: true }).filter((u) => `${billLineKey(u)}|${u.status}` === key)).map((u) => u.id);
    const r = pinUnitsToItemSync(db, itemId, same);
    touchSync(db, { productIds: [line.product_id], itemIds: [itemId] });
    return { ok: true, message: r.need > 0 ? `Đã giữ ${r.taken} cái từ nguồn đã chọn; ${r.need} cái còn lại là “Cần mua”.` : `Đã giữ ${r.taken} cái từ nguồn đã chọn.` };
  });
}

/** Order-line ids that still need buying (fewer units than ordered) — the "Mua theo đặt hàng" tab. */
export function itemIdsNeedingPurchase(db: DatabaseSync): Set<number> {
  const rows = db
    .prepare(
      `SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status IN ('pending','processing')
       AND oi.quantity > (SELECT COUNT(*) FROM stock_units u WHERE u.order_item_id = oi.id AND u.removed IS NULL)`,
    )
    .all() as Array<{ id: number }>;
  return new Set(rows.map((r) => r.id));
}

// ---------- async wrappers for server actions ----------

/** "Tự động phân bổ" on one order: pins lifted, the order is served again under the current rule. */
export async function reallocateOrder(orderId: string): Promise<void> {
  const db = getDb();
  withTransaction(db, () => allocateOrderSync(db, orderId, true));
}

/** "Cập nhật theo đơn hàng" / "Ghép lại tất cả đơn": everything re-derived (cancelled orders give their units back). */
export async function reallocateOpenOrders(): Promise<{ orders: number; lines: number; released: number }> {
  const db = getDb();
  return withTransaction(db, () => {
    const cancelled = db.prepare("SELECT DISTINCT oi.order_id FROM stock_units u JOIN order_items oi ON oi.id = u.order_item_id JOIN orders o ON o.id = oi.order_id WHERE o.status = 'cancelled' AND u.removed IS NULL AND u.status NOT IN ('shipped_to_customer','delivered')").all() as Array<{ order_id: string }>;
    let released = 0;
    for (const c of cancelled) released += releaseUnitsSync(db, c.order_id).released;
    const orders = Number((db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status IN ('pending','processing')").get() as { n: number }).n);
    const r = resyncAllUnitsSync(db);
    return { orders, lines: r.products, released };
  });
}
