import "server-only";
import { getOrderChargeableWeightG, getPricingConfig, loadQuoteDefaults, loadShippingMethods } from "./db";
import { quoteImportLegsProRata } from "./pricing";
import { buildQuoteConfig } from "./shipping";
import { getDb, getSetting, setSetting } from "./sqlite";

/**
 * One-time data fix (per LEG_FIX_REV): default import legs written on orders between v1.32.0 and v1.35.0 used the
 * whole-parcel tariff (a 55 g watch got a 1 kg Kiến fee), which made Kế toán show losses. Re-price those untouched legs
 * the way the price formula does — the lot tariff shared per gram — and leave anything the admin edited alone.
 */
export const LEG_FIX_REV = "1";

export async function fixDefaultImportLegs(): Promise<{ updated: number } | null> {
  const db = getDb();
  if (getSetting(db, "legs_prorata_fix_rev") === LEG_FIX_REV) return null;
  const rows = db
    .prepare("SELECT order_id, leg, note FROM order_legs WHERE note LIKE 'Mặc định theo luồng nhập hàng%' AND leg IN ('jp_domestic','jp_vn','vn_transfer')")
    .all() as unknown as Array<{ order_id: string; leg: string; note: string }>;
  const rateRaw = Number.parseFloat(getSetting(db, "jpy_vnd_rate") ?? "175");
  const cfg = buildQuoteConfig(loadShippingMethods(db, true), "included", Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : 175, loadQuoteDefaults(db));
  const pricing = await getPricingConfig();
  const upd = db.prepare("UPDATE order_legs SET fee = ?, note = ?, updated_at = ? WHERE order_id = ? AND leg = ?");
  const byOrder = new Map<string, string[]>();
  for (const r of rows) byOrder.set(r.order_id, [...(byOrder.get(r.order_id) ?? []), r.leg]);
  let updated = 0;
  const now = new Date().toISOString();
  for (const [orderId, legs] of byOrder) {
    const weightG = Math.max(1, await getOrderChargeableWeightG(orderId));
    const quotes = quoteImportLegsProRata(cfg, weightG, pricing.lotWeightG);
    for (const leg of legs) {
      const q = quotes.find((x) => x.leg === leg);
      if (!q) continue;
      upd.run(q.fee, `Mặc định theo luồng nhập hàng (đã gồm trong giá bán; chia theo lô ${pricing.lotWeightG / 1000} kg): ${q.feeRaw.toLocaleString("vi-VN")}${q.currency}`, now, orderId, leg);
      updated++;
    }
  }
  setSetting(db, "legs_prorata_fix_rev", LEG_FIX_REV);
  return { updated };
}
