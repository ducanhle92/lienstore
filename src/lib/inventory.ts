import "server-only";
import type { CatalogProduct, StockLot } from "@/types/shop";
import { getAllProducts, getOpenOrderDemand, getPipelineUnits, getRecentUnitsSold, listStockLots, type DemandLine, type PipelineUnits } from "./db";
import { expiryState } from "./lots";

/** Default reorder threshold when a product has no `minStock`. */
export const DEFAULT_MIN_STOCK = Number.parseInt(process.env.LIEN_MIN_STOCK ?? "0", 10) || 0;
/** Sales-pace window for the restock-planning columns (Bán ra gần đây / Dự trữ dự kiến). */
export const SALES_PACE_DAYS = 30;

export type StockState = "untracked" | "out" | "low" | "ok";

export interface InventoryLine {
  product: CatalogProduct;
  state: StockState;
  minStock: number;
  /** Units reserved by open orders, net of what is already bought for them (on the way / at the shop). */
  demand: number;
  demandOrders: DemandLine["orders"];
  /** Units to buy now: open-order demand not covered by stock + pipeline, plus top-up to the minimum when tracked. */
  toBuy: number;
  /** Units already bought for open orders: on the way from Japan / at the shop (see lib/purchase.ts). */
  pipeline: PipelineUnits;
  /** (stock + pipeline) × cost price — capital tied up in goods bought at Japan, in transit and in Vietnam. */
  stockValue: number;
  /** Warehouse lots with units left (ngày nhập · SL · nguồn · HSD · vị trí), FEFO order. */
  lots: StockLot[];
  /** Stock on hand + everything already bought and not yet delivered to a customer — total goods currently in circulation. */
  totalGoods: number;
  /** Units sold in the last `SALES_PACE_DAYS` days (non-cancelled orders). */
  soldRecent: number;
  /** (stock + in transit) − recent sales — a rough "how much cushion is left at the current sales pace" figure; can go negative. */
  reserveForecast: number | null;
  /** Target stock level for this product (same field as `minStock` today — see Kho hàng › Tồn kho). */
  standardStock: number;
}

export interface InventorySummary {
  tracked: number;
  untracked: number;
  out: number;
  low: number;
  units: number;
  stockValue: number;
  stockProfit: number;
  toBuyLines: number;
  toBuyUnits: number;
  toBuyCost: number;
  /** Units bought and still outside the shop (Japan, in transit, carrier warehouse) and their cost. */
  inTransitUnits: number;
  inTransitValue: number;
  /** Units bought for open orders already sitting at the shop. */
  atShopUnits: number;
  /** Lots expiring within 90 days / already expired (units). */
  expiringSoonUnits: number;
  expiredUnits: number;
}

export function stockStateOf(p: CatalogProduct, minStock: number): StockState {
  if (p.stock === null) return p.stockStatus === "discontinued" ? "out" : "untracked";
  if (p.stock <= 0) return "out";
  if (p.stock <= minStock) return "low";
  return "ok";
}

/**
 * Units to buy now for one product — pure so the formula can be unit-tested without a database.
 *   supply = stock + pipeline (on hand or already bought and not yet delivered to a customer)
 *   shortfall = raw open-order demand not covered by supply
 *   topUp = restock buffer, computed on what is LEFT of supply after covering demand (nguyên tắc 1: ưu tiên lấy từ
 *     kho / hàng đang về trước khi đi mua thêm — a big inbound purchase must not be ignored just because it hasn't
 *     landed yet, otherwise the reorder point re-triggers a purchase that is already on the way)
 *   `stock === null` (not tracked): every open-order unit not already bought must be sourced individually, no buffer.
 */
export function computeToBuy(stock: number | null, minStock: number, rawDemand: number, pipelineUnits: number): number {
  const need = Math.max(0, rawDemand - pipelineUnits);
  if (stock === null) return need;
  const supply = stock + pipelineUnits;
  const shortfall = Math.max(0, rawDemand - supply);
  const leftover = Math.max(0, supply - rawDemand);
  const topUp = leftover < minStock ? minStock - leftover : 0;
  return shortfall + topUp;
}

export async function getInventory(): Promise<{ lines: InventoryLine[]; summary: InventorySummary }> {
  const [products, demand, pipe, allLots] = await Promise.all([getAllProducts(true), getOpenOrderDemand(), getPipelineUnits(), listStockLots()]);
  const soldRecentMap = getRecentUnitsSold(SALES_PACE_DAYS);
  const lotsByProduct = new Map<number, StockLot[]>();
  for (const l of allLots) lotsByProduct.set(l.productId, [...(lotsByProduct.get(l.productId) ?? []), l]);
  const lines: InventoryLine[] = products.map((p) => {
    const minStock = p.minStock ?? DEFAULT_MIN_STOCK;
    const state = stockStateOf(p, minStock);
    const d = demand.get(p.id);
    const pipeline = pipe.get(p.id) ?? { inTransit: 0, atShop: 0, pipeline: 0 };
    const rawDemand = d?.needed ?? 0;
    // open-order units still to source = demand minus what is already bought for those orders (nguyên tắc 2: chờ hàng
    // đã mua về, không gọi mua thêm cho phần đã có người lo)
    const need = Math.max(0, rawDemand - pipeline.pipeline);
    const toBuy = computeToBuy(p.stock, minStock, rawDemand, pipeline.pipeline);
    const soldRecent = soldRecentMap.get(p.id) ?? 0;
    return {
      product: p,
      state,
      minStock,
      demand: need,
      demandOrders: d?.orders ?? [],
      toBuy,
      pipeline,
      stockValue: ((p.stock ?? 0) + pipeline.pipeline) * (p.costPrice ?? 0),
      lots: lotsByProduct.get(p.id) ?? [],
      totalGoods: (p.stock ?? 0) + pipeline.pipeline,
      soldRecent,
      reserveForecast: p.stock === null ? null : p.stock + pipeline.inTransit - soldRecent,
      standardStock: minStock,
    };
  });
  const summary: InventorySummary = {
    tracked: lines.filter((l) => l.product.stock !== null).length,
    untracked: lines.filter((l) => l.product.stock === null).length,
    out: lines.filter((l) => l.state === "out").length,
    low: lines.filter((l) => l.state === "low").length,
    units: lines.reduce((s, l) => s + (l.product.stock ?? 0), 0),
    stockValue: lines.reduce((s, l) => s + l.stockValue, 0),
    stockProfit: lines.reduce((s, l) => s + ((l.product.stock ?? 0) + l.pipeline.pipeline) * (l.product.costPrice !== null ? l.product.price - l.product.costPrice : 0), 0),
    toBuyLines: lines.filter((l) => l.toBuy > 0).length,
    toBuyUnits: lines.reduce((s, l) => s + l.toBuy, 0),
    toBuyCost: lines.reduce((s, l) => s + l.toBuy * (l.product.costPrice ?? 0), 0),
    inTransitUnits: lines.reduce((s, l) => s + l.pipeline.inTransit, 0),
    inTransitValue: lines.reduce((s, l) => s + l.pipeline.inTransit * (l.product.costPrice ?? 0), 0),
    atShopUnits: lines.reduce((s, l) => s + l.pipeline.atShop, 0),
    expiringSoonUnits: allLots.filter((l) => expiryState(l.expiry) === "soon").reduce((s, l) => s + l.qtyLeft, 0),
    expiredUnits: allLots.filter((l) => expiryState(l.expiry) === "expired").reduce((s, l) => s + l.qtyLeft, 0),
  };
  return { lines, summary };
}
