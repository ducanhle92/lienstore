import "server-only";
import type { CatalogProduct, StockLot } from "@/types/shop";
import { type DemandLine, emptyPipeline, getAllProducts, getOpenOrderDemand, getPipelineUnits, getPlannedLotUnits, getRecentUnitsSold, listStockLots, type PipelineUnits } from "./db";
import { daysToExpiry, expiryState } from "./lots";
import { DEFAULT_WAREHOUSE, emptyByWarehouse, type TransitWhere, type Warehouse } from "./warehouses";

/** Default reorder threshold when a product has no `minStock`. */
export const DEFAULT_MIN_STOCK = Number.parseInt(process.env.LIEN_MIN_STOCK ?? "0", 10) || 0;
/** Sales-pace window for the restock-planning columns (Bán ra gần đây / Dự trữ dự kiến). */
export const SALES_PACE_DAYS = 30;

export type StockState = "untracked" | "out" | "low" | "ok";

/** Simplified sourcing lifecycle shown as "Trạng thái theo dõi" (Kho hàng › Tồn kho): where the product's supply
 * currently stands. In priority order — a product with some stock already on hand reads "in_stock" even if more is
 * also incoming, since that is the more actionable state for the owner. */
export type PipelineStage = "in_stock" | "incoming" | "unbought" | null;

/** Pure so it can be unit-tested without a database. */
export function pipelineStageOf(stock: number | null, stockIncoming: number, toBuy: number): PipelineStage {
  if (stock !== null && stock > 0) return "in_stock";
  if (stockIncoming > 0) return "incoming";
  if (toBuy > 0) return "unbought";
  return null;
}

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
  /** "Đang lưu kho" / "Đang về" / "Chưa mua" / null (nothing on hand, nothing incoming, nothing needed). */
  pipelineStage: PipelineStage;
  /** Units on "mua lưu kho" slips not bought yet — planned lots the Japan-side buyer still has to purchase. */
  plannedLot: number;
  /** Days until the earliest-expiring lot with units left; null when no lot carries an expiry. */
  minExpiryDays: number | null;
  /** Units on hand per warehouse (from the lots; stock without lots counts as the Vietnam warehouse). */
  stockByWarehouse: Record<Warehouse, number>;
  /** Warehouse lots on the way, by where they are now (tại Nhật · NB → VN · kho ĐVVC VN). */
  incomingWhere: Record<TransitWhere, number>;
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
  /** Units on hand per warehouse. */
  unitsByWarehouse: Record<Warehouse, number>;
  /** Lots expiring within 90 days / already expired (units). */
  expiringSoonUnits: number;
  expiredUnits: number;
  /** Products with at least one unit in the warehouse. */
  inStockProducts: number;
  /** Warehouse-lot purchases on the way ("mua lưu kho", bought but not yet at the shop) and their cost. */
  stockIncomingUnits: number;
  stockIncomingValue: number;
  /** "Mua lưu kho" slips not bought yet. */
  plannedLotUnits: number;
  /** To buy for open orders (not covered by stock / pipeline) vs. to top the warehouse back up to its minimum. */
  orderNeedLines: number;
  orderNeedUnits: number;
  restockNeedLines: number;
  restockNeedUnits: number;
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
  const plannedMap = getPlannedLotUnits();
  const lotsByProduct = new Map<number, StockLot[]>();
  for (const l of allLots) lotsByProduct.set(l.productId, [...(lotsByProduct.get(l.productId) ?? []), l]);
  const lines: InventoryLine[] = products.map((p) => {
    const minStock = p.minStock ?? DEFAULT_MIN_STOCK;
    const state = stockStateOf(p, minStock);
    const d = demand.get(p.id);
    const pipeline = pipe.get(p.id) ?? emptyPipeline();
    const rawDemand = d?.needed ?? 0;
    // open-order units still to source = demand minus what is already bought for those orders (nguyên tắc 2: chờ hàng
    // đã mua về, không gọi mua thêm cho phần đã có người lo)
    const need = Math.max(0, rawDemand - pipeline.pipeline);
    const toBuy = computeToBuy(p.stock, minStock, rawDemand, pipeline.pipeline);
    const soldRecent = soldRecentMap.get(p.id) ?? 0;
    const lotDays = (lotsByProduct.get(p.id) ?? []).map((l) => daysToExpiry(l.expiry)).filter((d): d is number => d !== null);
    const stockByWarehouse = emptyByWarehouse();
    for (const l of lotsByProduct.get(p.id) ?? []) stockByWarehouse[l.warehouse] += l.qtyLeft;
    const lotted = stockByWarehouse.jp + stockByWarehouse.carrier + stockByWarehouse.vn;
    if ((p.stock ?? 0) > lotted) stockByWarehouse[DEFAULT_WAREHOUSE] += (p.stock ?? 0) - lotted;
    return {
      stockByWarehouse,
      incomingWhere: pipeline.stockWhere,
      minExpiryDays: lotDays.length ? Math.min(...lotDays) : null,
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
      pipelineStage: pipelineStageOf(p.stock, pipeline.stockIncoming, toBuy),
      plannedLot: plannedMap.get(p.id) ?? 0,
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
    unitsByWarehouse: lines.reduce((acc, l) => ({ jp: acc.jp + l.stockByWarehouse.jp, carrier: acc.carrier + l.stockByWarehouse.carrier, vn: acc.vn + l.stockByWarehouse.vn }), emptyByWarehouse()),
    expiringSoonUnits: allLots.filter((l) => expiryState(l.expiry) === "soon").reduce((s, l) => s + l.qtyLeft, 0),
    expiredUnits: allLots.filter((l) => expiryState(l.expiry) === "expired").reduce((s, l) => s + l.qtyLeft, 0),
    inStockProducts: lines.filter((l) => (l.product.stock ?? 0) > 0).length,
    stockIncomingUnits: lines.reduce((s, l) => s + l.pipeline.stockIncoming, 0),
    stockIncomingValue: lines.reduce((s, l) => s + l.pipeline.stockIncoming * (l.product.costPrice ?? 0), 0),
    plannedLotUnits: lines.reduce((s, l) => s + l.plannedLot, 0),
    orderNeedLines: lines.filter((l) => l.demand > 0 && l.toBuy > 0).length,
    orderNeedUnits: lines.filter((l) => l.demand > 0 && l.toBuy > 0).reduce((s, l) => s + l.toBuy, 0),
    restockNeedLines: lines.filter((l) => l.toBuy > 0 && l.demand === 0).length,
    restockNeedUnits: lines.filter((l) => l.toBuy > 0 && l.demand === 0).reduce((s, l) => s + l.toBuy, 0),
  };
  return { lines, summary };
}
