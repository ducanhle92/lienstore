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

/**
 * One-time (flag `default_flow_v2_rev`), confirmed with Kiến Express on 17/09/2026: their Vietnam warehouse is Khu đô thị
 * Xuân Phương Viglacera, Nam Từ Liêm, Hà Nội, and the default onward leg ③ to the shop is Viettel Post. Sets the
 * warehouse addresses (Địa chỉ kho), makes the Viettel method the ③ default, moves open orders still on another ③
 * method (nothing sent yet), and re-prices every product with the formula.
 */
export const WAREHOUSE_ADDRESS_KEYS = { jpShop: "wh_jp_shop", jpCarrier: "wh_jp_carrier", vnShop: "wh_vn_shop", vnCarrier: "wh_vn_carrier" } as const;
export const KIEN_VN_ADDRESS = "Khu đô thị Xuân Phương Viglacera, Nam Từ Liêm, Hà Nội";
export const KIEN_JP_ADDRESS = "〒270-0145 千葉県流山市名都借 827-3 1F (Chiba-ken, Nagareyama-shi, Nazukari)";

export async function applyDefaultFlowV2Once(): Promise<{ methodId: number | null; ordersMoved: number; pricesUpdated: number } | null> {
  const db = getDb();
  if (getSetting(db, "default_flow_v2_rev") === "1") return null;
  const now = new Date().toISOString();
  // warehouse addresses (owner edits them in Kho hàng › Địa chỉ kho)
  if (!getSetting(db, WAREHOUSE_ADDRESS_KEYS.vnCarrier)) setSetting(db, WAREHOUSE_ADDRESS_KEYS.vnCarrier, KIEN_VN_ADDRESS);
  if (!getSetting(db, WAREHOUSE_ADDRESS_KEYS.jpCarrier)) setSetting(db, WAREHOUSE_ADDRESS_KEYS.jpCarrier, KIEN_JP_ADDRESS);
  if (!getSetting(db, WAREHOUSE_ADDRESS_KEYS.jpShop)) setSetting(db, WAREHOUSE_ADDRESS_KEYS.jpShop, getSetting(db, "jp_sender_address") ?? "");
  if (!getSetting(db, WAREHOUSE_ADDRESS_KEYS.vnShop)) setSetting(db, WAREHOUSE_ADDRESS_KEYS.vnShop, getSetting(db, "pickup_address") ?? "");
  const m = db.prepare("SELECT id FROM shipping_methods WHERE leg = 'vn_transfer' AND (name LIKE 'Viettel Post%' OR name LIKE '%Viettel%') ORDER BY id LIMIT 1").get() as { id: number } | undefined;
  let ordersMoved = 0;
  if (m) {
    db.prepare("UPDATE shipping_methods SET active = 1, warehouse = ? WHERE id = ?").run(`Từ: kho Kiến Express — ${KIEN_VN_ADDRESS} · Đến: kho LienStore, Hoằng Hóa, Thanh Hóa`, m.id);
    let defaults: Record<string, unknown> = {};
    try {
      defaults = JSON.parse(getSetting(db, "pricing_default_methods") || "{}") as Record<string, unknown>;
    } catch {
      defaults = {};
    }
    setSetting(db, "pricing_default_methods", JSON.stringify({ ...defaults, vn_transfer: m.id }));
    const { getOrderChargeableWeightG, loadShippingMethods } = await import("./db");
    const method = loadShippingMethods(db, true).find((x) => x.id === m.id);
    const rate = readFx(db).effective;
    const legs = db
      .prepare(
        `SELECT ol.order_id, o.subtotal FROM order_legs ol JOIN orders o ON o.id = ol.order_id
         WHERE ol.leg = 'vn_transfer' AND (ol.method_id IS NULL OR ol.method_id <> ?) AND ol.tracking = '' AND COALESCE(ol.status, 'pending') = 'pending'
           AND o.status <> 'cancelled' AND COALESCE(o.ship_stage, 'ordered') IN ('ordered', 'paid', 'in_transit')`,
      )
      .all(m.id) as unknown as Array<{ order_id: string; subtotal: number }>;
    if (method) {
      const upd = db.prepare("UPDATE order_legs SET method_id = ?, zone_id = ?, label = ?, fee = ?, updated_at = ? WHERE order_id = ? AND leg = 'vn_transfer'");
      for (const l of legs) {
        const w = await getOrderChargeableWeightG(l.order_id);
        const q = quoteMethod(toQuoteMethod(method), "vn_transfer", w || 500, l.subtotal, rate);
        if (!q) continue;
        upd.run(q.methodId, q.zoneId, q.label, q.fee, now, l.order_id);
        ordersMoved++;
      }
    }
  }
  const r = await applyFormulaPrices(db, readFx(db).effective, true, now);
  setSetting(db, "pricing_last_run_at", now);
  setSetting(db, "pricing_last_run_summary", `Chặng ③ mặc định Viettel Post từ kho Kiến Express Hà Nội (bản 1.57.0) · giá bán ${r.pricesUpdated} sp${r.skippedSale ? `, bỏ qua ${r.skippedSale} đang giảm giá` : ""}`);
  setSetting(db, "default_flow_v2_rev", "1");
  return { methodId: m?.id ?? null, ordersMoved, pricesUpdated: r.pricesUpdated };
}
