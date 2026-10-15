import { storedPrices } from "@/lib/price-display";

/**
 * Validation rules for product fields shared by the admin form (Server Action `saveProductAction`) and the Admin API
 * v1 / CLI (`product-service.ts`). Pure: no database, no request objects. Messages are the ones the admin form shows.
 */

export const PRODUCT_MESSAGES = {
  nameRequired: "Tên sản phẩm là bắt buộc.",
  slugInvalid: "Đường dẫn không hợp lệ.",
  slugTaken: "Đường dẫn đã tồn tại, hãy chọn đường dẫn khác.",
  price: "Giá bán trên web phải là số nguyên ≥ 0 (để trống = Liên hệ).",
  promoPrice: "Giá khuyến mại không hợp lệ.",
  marketPrice: "Giá thị trường không hợp lệ.",
  promoAboveMarket: "Giá khuyến mại phải thấp hơn giá thị trường.",
  weightG: "Khối lượng tính bằng gram, số nguyên > 0.",
  dimsCm: "Kích thước ghi dạng Dài x Rộng x Cao (cm), ví dụ 12x8x5.",
  categoriesRequired: "Chọn ít nhất một danh mục.",
} as const;

/**
 * The three prices (see lib/price-display.ts): web/expected price (0 = "Liên hệ"), optional promo price, optional market
 * reference. Returns the stored `price` / `regularPrice` pair, or field errors.
 */
export function resolveWebPrices(expected: number | null, promo: number | null, market: number | null): { fields: Record<string, string>; price: number; regularPrice: number | null } {
  const fields: Record<string, string> = {};
  if (expected === null || !Number.isInteger(expected) || expected < 0) fields.price = PRODUCT_MESSAGES.price;
  if (promo !== null && (!Number.isInteger(promo) || promo < 0)) fields.promoPrice = PRODUCT_MESSAGES.promoPrice;
  if (market !== null && (!Number.isInteger(market) || market < 0)) fields.marketPrice = PRODUCT_MESSAGES.marketPrice;
  if (!fields.promoPrice && !fields.marketPrice && promo !== null && market !== null && promo >= market) fields.promoPrice = PRODUCT_MESSAGES.promoAboveMarket;
  const { price, regularPrice } = storedPrices(fields.price ? 0 : (expected ?? 0), fields.promoPrice ? null : promo);
  return { fields, price, regularPrice };
}

/** "12 × 8 * 5" → "12x8x5"; blank → null. */
export function normalizeDimsCm(raw: string | null | undefined): string | null {
  return (raw ?? "").replace(/\s+/g, "").replace(/[×*]/g, "x") || null;
}

export function isValidDimsCm(dims: string | null): boolean {
  return dims === null || /^\d+(\.\d+)?x\d+(\.\d+)?x\d+(\.\d+)?$/.test(dims);
}

export function isValidWeightG(weightG: number | null): boolean {
  return weightG === null || (Number.isInteger(weightG) && weightG > 0);
}
