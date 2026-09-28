/**
 * How a product can be bought (storefront wording, shared by cards, product page, quick view):
 *   available    — "Có sẵn": free units at Kho Việt Nam (shop, Thanh Hóa), not reserved for an order (stockVn > 0)
 *   order_temp   — "Hàng order": normally stocked but the VN warehouse is empty right now → bought to order (7–14 days)
 *   order        — "Hàng order": rarely sold, always bought to order (7–14 days)
 *   discontinued — "Hết hàng": the model is no longer sold in Japan (admin sets it; never derived from stock = 0)
 */
export type Availability = "available" | "order_temp" | "order" | "discontinued";

export interface AvailabilityInput {
  stockStatus: "instock" | "discontinued";
  stock: number | null;
  /** Free units at Kho VN (shop); when given it decides "Có sẵn" (goods still in Japan / on the way are "Hàng order"). */
  stockVn?: number | null;
  fulfillment?: "stock" | "order" | null;
}

/** What the customer can take right away: free units at Kho VN (shop), falling back to `stock` for older data. */
export const readyStock = (p: Pick<AvailabilityInput, "stock" | "stockVn">): number | null => (p.stockVn !== undefined ? p.stockVn : p.stock);

export function availabilityOf(p: AvailabilityInput): Availability {
  if (p.stockStatus === "discontinued") return "discontinued";
  const ready = readyStock(p);
  if (ready !== null && ready > 0) return "available";
  if (p.fulfillment === "stock") return "order_temp";
  return "order";
}

/** Badge group: "Có sẵn" / "Hàng order" / "Hết hàng". */
export function availabilityGroup(a: Availability): "available" | "order" | "discontinued" {
  return a === "available" ? "available" : a === "discontinued" ? "discontinued" : "order";
}

export const canBuy = (a: Availability) => a !== "discontinued";
