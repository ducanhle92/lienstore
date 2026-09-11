import "server-only";
import type { CatalogProduct } from "@/types/shop";
import { getAllProducts, getOpenOrderDemand, getPipelineUnits, type DemandLine, type PipelineUnits } from "./db";

/** Default reorder threshold when a product has no `minStock`. */
export const DEFAULT_MIN_STOCK = Number.parseInt(process.env.LIEN_MIN_STOCK ?? "2", 10) || 2;

export type StockState = "untracked" | "out" | "low" | "ok";

export interface InventoryLine {
  product: CatalogProduct;
  state: StockState;
  minStock: number;
  /** Units reserved by open orders. */
  demand: number;
  demandOrders: DemandLine["orders"];
  /** Units to buy now: open-order demand not covered by stock or by units already bought, plus top-up to the minimum when tracked. */
  toBuy: number;
  /** Units already bought for open orders: on the way from Japan / at the shop (see lib/purchase.ts). */
  pipeline: PipelineUnits;
  /** (stock + pipeline) × cost price — capital tied up in goods bought at Japan, in transit and in Vietnam. */
  stockValue: number;
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
}

export function stockStateOf(p: CatalogProduct, minStock: number): StockState {
  if (p.stock === null) return p.stockStatus === "outofstock" ? "out" : "untracked";
  if (p.stock <= 0) return "out";
  if (p.stock <= minStock) return "low";
  return "ok";
}

export async function getInventory(): Promise<{ lines: InventoryLine[]; summary: InventorySummary }> {
  const [products, demand, pipe] = await Promise.all([getAllProducts(true), getOpenOrderDemand(), getPipelineUnits()]);
  const lines: InventoryLine[] = products.map((p) => {
    const minStock = p.minStock ?? DEFAULT_MIN_STOCK;
    const state = stockStateOf(p, minStock);
    const d = demand.get(p.id);
    const pipeline = pipe.get(p.id) ?? { inTransit: 0, atShop: 0, pipeline: 0 };
    // open-order units still to source = demand minus what is already bought for those orders
    const need = Math.max(0, (d?.needed ?? 0) - pipeline.pipeline);
    let toBuy = 0;
    if (p.stock === null) toBuy = need; // not tracked: every open order line has to be sourced
    else {
      const shortfall = Math.max(0, need - p.stock);
      const topUp = p.stock - need < minStock ? minStock - Math.max(0, p.stock - need) : 0;
      toBuy = shortfall + (need > 0 || p.stock <= minStock ? topUp : 0);
    }
    return {
      product: p,
      state,
      minStock,
      demand: need,
      demandOrders: d?.orders ?? [],
      toBuy,
      pipeline,
      stockValue: ((p.stock ?? 0) + pipeline.pipeline) * (p.costPrice ?? 0),
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
  };
  return { lines, summary };
}
