import "server-only";
import { applyFormulaPrices, readFx } from "./fx";
import { parsePricing } from "./pricing";
import { quoteMethod, toQuoteMethod } from "./shipping";
import { getDb, getSetting, setSetting, withTransaction } from "./sqlite";

/**
 * One-time (flag `default_flow_rev`): leg ① of the default import flow becomes "LienStore gom tại nhà" (the owner's own
 * pick-up run to the Kiến Express warehouse) instead of Japan Post ゆうパック.
 *  1. Công thức giá › Tham số chi phí: default jp_domestic method := LienStore gom tại nhà.
 *  2. Its column is a flat fee per pick-up run; a "/kg" unit typed on it would multiply the fee by the lot weight, so the
 *     unit is normalised to flat (the fee number is kept).
 *  3. Every product (drafts included) is re-priced with the formula so the cheaper leg ① shows in the selling price.
 *  4. Open orders whose leg ① is still the old default (no tracking number, goods not yet with the carrier) move to the
 *     new method; the leg fee is the order's share of one pick-up run (per gram of the pricing lot), like the price formula.
 */
const REV = "1";

export async function applyDefaultFlowOnce(): Promise<{ methodId: number; unitFixed: boolean; ordersMoved: number; pricesUpdated: number } | null> {
  const db = getDb();
  if (getSetting(db, "default_flow_rev") === REV) return null;
  const m = db.prepare("SELECT id FROM shipping_methods WHERE leg = 'jp_domestic' AND name LIKE 'LienStore gom%' ORDER BY id LIMIT 1").get() as { id: number } | undefined;
  if (!m) {
    setSetting(db, "default_flow_rev", REV);
    return null;
  }
  const now = new Date().toISOString();
  const unitFixed = Number(db.prepare("UPDATE shipping_zones SET unit = '' WHERE method_id = ? AND unit LIKE '%kg%'").run(m.id).changes) > 0;
  db.prepare("UPDATE shipping_methods SET active = 1 WHERE id = ?").run(m.id);
  // 1. default for the price formula and pre-filled order legs
  let defaults: Record<string, unknown> = {};
  try {
    defaults = JSON.parse(getSetting(db, "pricing_default_methods") || "{}") as Record<string, unknown>;
  } catch {
    defaults = {};
  }
  setSetting(db, "pricing_default_methods", JSON.stringify({ ...defaults, jp_domestic: m.id }));

  // 4. open orders still on the old default
  const { getOrderChargeableWeightG, loadShippingMethods } = await import("./db");
  const method = loadShippingMethods(db, true).find((x) => x.id === m.id);
  const rate = readFx(db).effective;
  const lotWeightG = parsePricing(getSetting(db, "pricing_config")).lotWeightG;
  const lot = method ? quoteMethod(toQuoteMethod(method), "jp_domestic", lotWeightG, 0, rate) : null;
  const legs = db
    .prepare(
      `SELECT ol.order_id, ol.status FROM order_legs ol JOIN orders o ON o.id = ol.order_id
       WHERE ol.leg = 'jp_domestic' AND ol.method_id <> ? AND ol.tracking = '' AND COALESCE(ol.status, 'pending') = 'pending'
         AND o.status <> 'cancelled' AND COALESCE(o.ship_stage, 'ordered') IN ('ordered', 'paid')`,
    )
    .all(m.id) as unknown as Array<{ order_id: string }>;
  let ordersMoved = 0;
  if (lot) {
    const upd = db.prepare("UPDATE order_legs SET method_id = ?, zone_id = ?, label = ?, fee = ?, note = CASE WHEN note = '' THEN ? ELSE note END, updated_at = ? WHERE order_id = ? AND leg = 'jp_domestic'");
    for (const l of legs) {
      const w = await getOrderChargeableWeightG(l.order_id);
      const fee = Math.round((lot.fee * w) / lotWeightG);
      withTransaction(db, () => {
        upd.run(lot.methodId, lot.zoneId, lot.label, fee, `Đổi về luồng mặc định (${lot.label}) · lô ${Math.round(lotWeightG / 1000)} kg`, now, l.order_id);
      });
      ordersMoved++;
    }
  }
  // 3. re-price everything with the cheaper leg ①
  const r = await applyFormulaPrices(db, rate, true, now);
  setSetting(db, "pricing_last_run_at", now);
  setSetting(db, "pricing_last_run_summary", `Đổi chặng ① mặc định sang LienStore gom tại nhà (bản 1.51.0) · giá bán ${r.pricesUpdated} sp${r.skippedSale ? `, bỏ qua ${r.skippedSale} đang giảm giá` : ""}`);
  setSetting(db, "default_flow_rev", REV);
  return { methodId: m.id, unitFixed, ordersMoved, pricesUpdated: r.pricesUpdated };
}
