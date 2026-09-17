/**
 * The three prices of a product and what the customer sees (Admin › Sản phẩm › Bán hàng):
 *   - Giá thị trường (`marketPrice`)  — the reference price elsewhere; ALWAYS the crossed-out price, never charged.
 *   - Giá kỳ vọng bán ra (`price`, or `regularPrice` while a promotion runs) — the shop's normal web price (from the
 *     pricing formula).
 *   - Giá khuyến mại (`price` while `regularPrice` is set) — the price charged during a promotion; may be above or
 *     below the expected price, but below the market price.
 * Display rule: cross out the market price and show the current price (promo when a promotion runs, else expected)
 * with the % below market. Without a market price a promotion falls back to crossing out the expected price.
 * Pure helpers, shared by storefront and admin.
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
  if (p.marketPrice && p.marketPrice > current) return { current, strike: p.marketPrice, pct: Math.round((1 - current / p.marketPrice) * 100), kind: "market" };
  if (!p.marketPrice && p.regularPrice && p.regularPrice > current) return { current, strike: p.regularPrice, pct: Math.round((1 - current / p.regularPrice) * 100), kind: "promo" };
  return { current, strike: null, pct: null, kind: null };
}

/** True while a promotion runs (`regularPrice` keeps the expected price so it can be restored). */
export const isPromoActive = (p: PriceLike): boolean => p.regularPrice !== null && p.regularPrice !== undefined && p.regularPrice > 0 && p.regularPrice !== p.price;
/** Expected web price (the price without any promotion). */
export const expectedPriceOf = (p: PriceLike): number => (isPromoActive(p) ? (p.regularPrice as number) : p.price);
/** Promo price when a promotion is running, else null. */
export const promoPriceOf = (p: PriceLike): number | null => (isPromoActive(p) ? p.price : null);

/**
 * Admin form → stored columns: a promo price (different from the expected one) is charged while the expected price is
 * kept in `regularPrice`; otherwise the expected price is the only price.
 */
export function storedPrices(expected: number, promo: number | null): { price: number; regularPrice: number | null } {
  return promo !== null && promo > 0 && promo !== expected ? { price: promo, regularPrice: expected } : { price: expected, regularPrice: null };
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
