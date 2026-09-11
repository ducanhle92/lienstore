/**
 * How a product can be bought (storefront wording, shared by cards, product page, quick view):
 *   available    — "Có sẵn": tracked stock > 0 in the Thanh Hóa warehouse
 *   order_temp   — "Hàng order": normally stocked but the VN warehouse is empty right now → bought to order (7–14 days)
 *   order        — "Hàng order": rarely sold, always bought to order (7–14 days)
 *   discontinued — "Hết hàng": the model is no longer sold in Japan (admin sets it; never derived from stock = 0)
 */
export type Availability = "available" | "order_temp" | "order" | "discontinued";

export interface AvailabilityInput {
  stockStatus: "instock" | "discontinued";
  stock: number | null;
  fulfillment?: "stock" | "order" | null;
}

export function availabilityOf(p: AvailabilityInput): Availability {
  if (p.stockStatus === "discontinued") return "discontinued";
  if (p.stock !== null && p.stock > 0) return "available";
  if (p.fulfillment === "stock") return "order_temp";
  return "order";
}

/** Badge group: "Có sẵn" / "Hàng order" / "Hết hàng". */
export function availabilityGroup(a: Availability): "available" | "order" | "discontinued" {
  return a === "available" ? "available" : a === "discontinued" ? "discontinued" : "order";
}

export const canBuy = (a: Availability) => a !== "discontinued";
