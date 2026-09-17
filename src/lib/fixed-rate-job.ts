import "server-only";
import { applyFormulaPrices, readFx, setDcomRate, setFxMode } from "./fx";
import { getDb, getSetting, setSetting } from "./sqlite";

/**
 * One-time (per FIXED_RATE_REV): pin the ¥→đ rate at 170 as a typed DCOM override — the scraped DCOM/market rates
 * keep being fetched nightly but no longer move prices until the owner clears the override in Công thức giá — then
 * recompute every ¥-costed product's VND cost and formula selling price at that rate, the same way the nightly job
 * does when auto-sell is on. Products with a crossed-out sale price (Giảm giá / Flash Sales) are left as they are.
 */
export const FIXED_RATE_REV = "1";
export const FIXED_RATE = 170;

export async function applyFixedRateOnce(): Promise<{ rate: number; costsUpdated: number; pricesUpdated: number; skippedSale: number } | null> {
  const db = getDb();
  if (getSetting(db, "fx_fixed_rate_rev") === FIXED_RATE_REV) return null;
  setFxMode("dcom", db);
  setDcomRate(FIXED_RATE, db);
  const rate = readFx(db).effective;
  const now = new Date().toISOString();
  const r = await applyFormulaPrices(db, rate, true, now);
  setSetting(db, "pricing_last_run_at", now);
  setSetting(db, "pricing_last_run_summary", `Khóa tỉ giá ${rate} đ/¥ (nhập tay, bản 1.47.0) · giá vốn ${r.costsUpdated} sp · giá bán ${r.pricesUpdated} sp${r.skippedSale ? `, bỏ qua ${r.skippedSale} đang giảm giá` : ""}`);
  setSetting(db, "fx_fixed_rate_rev", FIXED_RATE_REV);
  return { rate, ...r };
}
