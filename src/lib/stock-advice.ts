/**
 * "Hàng order → Lưu kho?" advice from the monthly buying trend of one product (Admin › Sản phẩm › Kho hàng card).
 * Pure so it can be unit-tested and used in the client form.
 */
export interface StockAdvice {
  /** Units sold over the whole window. */
  total: number;
  /** Average units per month over the window (one decimal). */
  avgPerMonth: number;
  /** Months of sales the suggested level should cover (lead time Japan → Vietnam ≈ 3–4 weeks + buffer). */
  coverMonths: number;
  /** Suggested standard stock level; 0 = keep buying to order. */
  suggested: number;
}

/** Minimum average per month before stocking is worth it — below that, per-order buying ties up less money. */
export const STOCK_ADVICE_MIN_AVG = 2;
export const STOCK_ADVICE_COVER_MONTHS = 1.5;

export function suggestStandardStock(monthly: Array<{ month: string; units: number }>, coverMonths = STOCK_ADVICE_COVER_MONTHS): StockAdvice {
  const months = Math.max(1, monthly.length);
  const total = monthly.reduce((s, m) => s + Math.max(0, m.units), 0);
  const avg = Math.round((total / months) * 10) / 10;
  // needs sales in at least two different months — one spike is not a trend
  const activeMonths = monthly.filter((m) => m.units > 0).length;
  const suggested = avg >= STOCK_ADVICE_MIN_AVG && activeMonths >= 2 ? Math.ceil(avg * coverMonths) : 0;
  return { total, avgPerMonth: avg, coverMonths, suggested };
}
