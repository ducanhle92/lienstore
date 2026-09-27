/**
 * "Đợt gửi" — one Japan → shop shipment that carries order lines AND surplus bought for stock
 * (Admin › Kho hàng › Quản lý mua hàng › Đợt gửi). Buying the surplus in the same shipment saves carrier fees;
 * the surplus becomes stock lots (with expiry + purchase date) when the batch reaches the shop.
 * Pure helpers (no DB) shared by the panel, the server actions and the node:test suite.
 */
import { PURCHASE_STAGES, type PurchaseStatus, purchaseIndex } from "./purchase";

/** Stages a batch walks through; it stops at the shop warehouse (order lines continue to the customer on their own). */
export const BATCH_STAGES = PURCHASE_STAGES.filter((s) => purchaseIndex(s.key) <= purchaseIndex("at_shop")).map((s) => (s.key === "not_bought" ? { ...s, label: "Đang gom hàng (chưa mua)", short: "Đang gom" } : s));

/** The batch is finished once everything is at the shop. */
export const BATCH_DONE: PurchaseStatus = "at_shop";

export function isBatchStatus(v: unknown): v is PurchaseStatus {
  return typeof v === "string" && BATCH_STAGES.some((s) => s.key === v);
}

/** DG-YYMMDD-NN (date = the day the batch was opened). */
export function batchCode(date: string, seq: number): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  return `DG-${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}-${String(seq).padStart(2, "0")}`;
}

/**
 * Which surplus rows cover an order line placed after the batch was bought: nearest expiry first (the shop sells the
 * older stock first), then the oldest row. `short` > 0 means the surplus cannot cover the line.
 */
export function planSurplusTake<T extends { id: number; qty: number; expiry: string | null }>(surplus: T[], need: number): { takes: Array<[number, number]>; short: number } {
  const key = (s: T) => s.expiry ?? "9999-12-31";
  const sorted = surplus.filter((s) => s.qty > 0).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.id - b.id));
  const takes: Array<[number, number]> = [];
  let left = Math.max(0, need);
  for (const s of sorted) {
    if (left <= 0) break;
    const take = Math.min(s.qty, left);
    takes.push([s.id, take]);
    left -= take;
  }
  return { takes, short: left };
}

export interface BatchTotals {
  orderUnits: number;
  stockUnits: number;
  units: number;
  /** null when no row has a known unit price. */
  jpy: number | null;
}

/** Units and ¥ of a batch (order lines priced at the catalogue ¥, surplus at its own ¥). */
export function batchTotals(lines: Array<{ quantity: number; costJpy: number | null }>, stock: Array<{ qty: number; unitCostJpy: number | null }>): BatchTotals {
  const orderUnits = lines.reduce((n, l) => n + l.quantity, 0);
  const stockUnits = stock.reduce((n, s) => n + s.qty, 0);
  let jpy: number | null = null;
  for (const l of lines) if (l.costJpy !== null) jpy = (jpy ?? 0) + l.costJpy * l.quantity;
  for (const s of stock) if (s.unitCostJpy !== null) jpy = (jpy ?? 0) + s.unitCostJpy * s.qty;
  return { orderUnits, stockUnits, units: orderUnits + stockUnits, jpy };
}

interface ProductRef {
  productId: number;
  productName: string;
  productSku: string | null;
  productThumb: string;
}
export interface BatchProductRow<L, S> {
  productId: number;
  name: string;
  sku: string | null;
  thumb: string;
  lines: L[];
  stock: S[];
  orderUnits: number;
  stockUnits: number;
}

/** One table row per product: its order lines and its surplus rows side by side. */
export function groupBatchByProduct<L extends ProductRef & { quantity: number }, S extends ProductRef & { qty: number }>(lines: L[], stock: S[]): Array<BatchProductRow<L, S>> {
  const rows = new Map<number, BatchProductRow<L, S>>();
  const rowOf = (p: ProductRef) => {
    let r = rows.get(p.productId);
    if (!r) {
      r = { productId: p.productId, name: p.productName, sku: p.productSku, thumb: p.productThumb, lines: [], stock: [], orderUnits: 0, stockUnits: 0 };
      rows.set(p.productId, r);
    }
    return r;
  };
  for (const l of lines) {
    const r = rowOf(l);
    r.lines.push(l);
    r.orderUnits += l.quantity;
  }
  for (const s of stock) {
    const r = rowOf(s);
    r.stock.push(s);
    r.stockUnits += s.qty;
  }
  return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name, "vi"));
}
