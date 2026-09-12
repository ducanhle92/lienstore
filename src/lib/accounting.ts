import "server-only";
import { getAllProducts, getOrderLegs, getOrders } from "./db";
import { IMPORT_LEGS, stageIndex } from "./shipping";
import type { Order } from "@/types/shop";

/**
 * Kế toán › lãi/lỗ theo đơn: revenue (items − discount) + shipping collected from the customer, minus cost of goods
 * (current cost price × qty), the three import legs recorded on the order, and the Vietnam delivery fee paid to the
 * carrier. Cancelled orders are excluded. Pure arithmetic on data the admin already maintains (order legs, cost prices).
 */
export interface AccountingRow {
  id: string;
  number: number;
  createdAt: string;
  status: Order["status"];
  paid: boolean;
  customer: string;
  items: number;
  revenue: number;
  /** Shipping the customer pays with the order (0 when paid to the courier on delivery). */
  shipCollected: number;
  shipOnDelivery: boolean;
  cogs: number;
  /** Lines whose product has no cost price (COGS incomplete). */
  missingCost: number;
  importFees: number;
  vnCarrierFee: number;
  profit: number;
}

export interface AccountingTotals {
  orders: number;
  paidOrders: number;
  revenue: number;
  shipCollected: number;
  cogs: number;
  importFees: number;
  vnCarrierFee: number;
  profit: number;
  missingCost: number;
}

export interface MonthRow extends AccountingTotals {
  month: string;
}

export const emptyTotals = (): AccountingTotals => ({ orders: 0, paidOrders: 0, revenue: 0, shipCollected: 0, cogs: 0, importFees: 0, vnCarrierFee: 0, profit: 0, missingCost: 0 });

function add(t: AccountingTotals, r: AccountingRow): void {
  t.orders++;
  if (r.paid) t.paidOrders++;
  t.revenue += r.revenue;
  t.shipCollected += r.shipCollected;
  t.cogs += r.cogs;
  t.importFees += r.importFees;
  t.vnCarrierFee += r.vnCarrierFee;
  t.profit += r.profit;
  t.missingCost += r.missingCost;
}

/** Shop-local month key (Asia/Ho_Chi_Minh) of an ISO date. */
export const monthKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7);
export const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

export async function getAccounting(fromDay: string, toDay: string): Promise<{ rows: AccountingRow[]; totals: AccountingTotals; byMonth: MonthRow[] }> {
  const [orders, products] = await Promise.all([getOrders(), getAllProducts(true)]);
  const cost = new Map(products.map((p) => [p.id, p.costPrice]));
  const inRange = orders.filter((o) => o.status !== "cancelled" && dayKey(o.createdAt) >= fromDay && dayKey(o.createdAt) <= toDay);
  const legMap = await getOrderLegs(inRange.map((o) => o.id));
  const rows: AccountingRow[] = inRange.map((o) => {
    const legs = legMap.get(o.id) ?? [];
    const importFees = legs.filter((l) => (IMPORT_LEGS as string[]).includes(l.leg)).reduce((s, l) => s + l.fee, 0);
    const vnCarrierFee = legs.find((l) => l.leg === "vn_domestic")?.fee ?? 0;
    let cogs = 0;
    let missingCost = 0;
    for (const it of o.items) {
      const c = cost.get(it.productId);
      if (c === null || c === undefined) missingCost++;
      else cogs += c * it.quantity;
    }
    const revenue = Math.max(0, o.subtotal - o.discount);
    const shipOnDelivery = o.shipFeePayment === "on_delivery";
    const shipCollected = shipOnDelivery ? 0 : o.shippingFee;
    // fee paid to the courier: when the customer pays the courier directly the shop pays nothing for that leg
    const vnPaid = o.delivery === "pickup" ? 0 : shipOnDelivery ? 0 : vnCarrierFee;
    return {
      id: o.id,
      number: o.number,
      createdAt: o.createdAt,
      status: o.status,
      paid: stageIndex(o.shipStage) >= stageIndex("paid"),
      customer: `${o.customer.lastName} ${o.customer.firstName}`.trim(),
      items: o.items.reduce((n, it) => n + it.quantity, 0),
      revenue,
      shipCollected,
      shipOnDelivery,
      cogs,
      missingCost,
      importFees,
      vnCarrierFee: vnPaid,
      profit: revenue + shipCollected - cogs - importFees - vnPaid,
    };
  });
  const totals = emptyTotals();
  const months = new Map<string, MonthRow>();
  for (const r of rows) {
    add(totals, r);
    const k = monthKey(r.createdAt);
    const m = months.get(k) ?? { month: k, ...emptyTotals() };
    add(m, r);
    months.set(k, m);
  }
  return { rows, totals, byMonth: [...months.values()].sort((a, b) => b.month.localeCompare(a.month)) };
}
