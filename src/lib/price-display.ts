/**
 * The three prices of a product and what the customer sees (Admin › Sản phẩm › Bán hàng):
 *   - Giá thị trường (`marketPrice`)  — what the item usually costs elsewhere; reference only, never charged.
 *   - Giá kỳ vọng bán ra (`price`, or `regularPrice` while a promotion runs) — the shop's normal web price.
 *   - Giá khuyến mại (`price` while `regularPrice` is set) — the price charged during a promotion.
 * Display rule: a promotion shows promo price with the expected price crossed out (the price the customer saw
 * yesterday — no "raise then discount" tricks); otherwise, when the shop sells below market, the market price is
 * crossed out against the expected price. Pure helpers, shared by storefront and admin.
 */
export interface PriceLike {
  price: number;
  regularPrice: number | null;
  marketPrice?: number | null;
}
export interface PriceView {
  /** What the customer pays now. */
  current: number;
  /** Crossed-out reference, null when there is nothing to compare against. */
  strike: number | null;
  /** Whole-number % below the crossed-out price. */
  pct: number | null;
  /** Why there is a strike price. */
  kind: "promo" | "market" | null;
}

export function priceView(p: PriceLike): PriceView {
  const current = p.price;
  if (current <= 0) return { current, strike: null, pct: null, kind: null };
  if (p.regularPrice && p.regularPrice > current) return { current, strike: p.regularPrice, pct: Math.round((1 - current / p.regularPrice) * 100), kind: "promo" };
  if (p.marketPrice && p.marketPrice > current) return { current, strike: p.marketPrice, pct: Math.round((1 - current / p.marketPrice) * 100), kind: "market" };
  return { current, strike: null, pct: null, kind: null };
}

/** Expected web price (the price without any promotion). */
export const expectedPriceOf = (p: PriceLike): number => (p.regularPrice && p.regularPrice > p.price ? p.regularPrice : p.price);
/** Promo price when a promotion is running, else null. */
export const promoPriceOf = (p: PriceLike): number | null => (p.regularPrice && p.regularPrice > p.price ? p.price : null);

/**
 * Admin form → stored columns: promo below expected → charge promo, cross out expected; otherwise the expected price is
 * the only price (a promo that is not lower is ignored).
 */
export function storedPrices(expected: number, promo: number | null): { price: number; regularPrice: number | null } {
  return promo !== null && promo > 0 && promo < expected ? { price: promo, regularPrice: expected } : { price: expected, regularPrice: null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Change history

export type ProductChangeField = "price" | "regularPrice" | "marketPrice" | "costPrice" | "costJpy" | "costSource" | "stock" | "minStock" | "status" | "name" | "fulfillment" | "marginPct" | "sku";
export const PRODUCT_CHANGE_FIELDS: Record<ProductChangeField, string> = {
  price: "Giá bán trên web",
  regularPrice: "Giá gạch (giá kỳ vọng khi khuyến mại)",
  marketPrice: "Giá thị trường",
  costPrice: "Giá vốn (VNĐ)",
  costJpy: "Giá vốn tại Nhật (¥)",
  costSource: "Nguồn mua",
  stock: "Tồn kho",
  minStock: "Mức tồn tiêu chuẩn",
  status: "Trạng thái bán",
  name: "Tên sản phẩm",
  fulfillment: "Hình thức (order / lưu kho)",
  marginPct: "Tỉ lệ lãi riêng",
  sku: "SKU",
};
export interface ProductChangeInput {
  field: ProductChangeField;
  old: string;
  new: string;
}
type Snapshot = Partial<Record<ProductChangeField, string | number | null | undefined>>;
const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

/** Differences between two snapshots over the fields worth remembering. */
export function diffProductChanges(before: Snapshot, after: Snapshot): ProductChangeInput[] {
  const out: ProductChangeInput[] = [];
  for (const field of Object.keys(PRODUCT_CHANGE_FIELDS) as ProductChangeField[]) {
    if (!(field in after)) continue;
    const a = str(before[field]);
    const b = str(after[field]);
    if (a !== b) out.push({ field, old: a, new: b });
  }
  return out;
}
