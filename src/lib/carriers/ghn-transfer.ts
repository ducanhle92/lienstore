/**
 * Chặng ③ (Kho ĐVVC → kho shop) priced live via the GHN API instead of a static rate card: GHN itself moves the
 * consolidated shipment from the carrier's Hà Nội hand-off hub to the shop's own warehouse in Hoằng Hóa. One quote
 * covers a whole lot (`lotWeightG`) and is shared per gram across products the same way a static tariff would be
 * (quoteImportLegsProRata), so this never means one GHN call per product.
 */
import { GhnApiError, ghnConfigured, ghnCredentials, quoteGhn } from "@/lib/ghn";
import type { QuoteMethod } from "@/lib/shipping";
import { resolveGhnCodes } from "./ghn-adapter";

/** Kiến Express's Hà Nội hand-off hub: OV3.15 XP5 Khu đô thị Xuân Phương Viglacera, Nam Từ Liêm, Hà Nội. */
const TRANSFER_FROM = { province: "Hà Nội", ward: "Xuân Phương" };

/** A roughly cube-shaped box whose GHN volumetric weight (L×W×H/5000) is close to the actual weight. */
function estimateLotDimsCm(weightG: number): { length: number; width: number; height: number } {
  const volCm3 = Math.max(1000, (Math.max(1, weightG) / 1000) * 5000);
  const side = Math.cbrt(volCm3);
  const length = Math.max(10, Math.round(side * 1.25));
  const width = Math.max(10, Math.round(side * 0.9));
  const height = Math.max(10, Math.round(volCm3 / (length * width)));
  return { length, width, height };
}

/**
 * Live GHN quote for one full lot on the ĐVVC-hub → shop route, wrapped as a synthetic flat-fee `QuoteMethod`
 * (currency đ, one zone, unit "" = flat for the whole lot — the exact shape `quoteImportLegsProRata` already knows
 * how to share per gram, same as the Kiến Express "tới nhà lấy hàng" flat pickup fee). Returns null — so the caller
 * falls back to the static method — when GHN isn't connected, the hub's ward can't be resolved, or the call fails.
 */
export async function liveGhnTransferMethod(lotWeightG: number): Promise<QuoteMethod | null> {
  if (!ghnConfigured()) return null;
  try {
    const to = ghnCredentials();
    if (!(to.pickupDistrictId > 0) || !to.pickupWardCode) return null;
    const from = await resolveGhnCodes(TRANSFER_FROM.province, TRANSFER_FROM.ward);
    if (!from) return null;
    const dims = estimateLotDimsCm(lotWeightG);
    const q = await quoteGhn({
      fromDistrictId: from.districtId,
      fromWardCode: from.wardCode,
      toDistrictId: to.pickupDistrictId,
      toWardCode: to.pickupWardCode,
      weight: Math.max(1, Math.round(lotWeightG)),
      length: dims.length,
      width: dims.width,
      height: dims.height,
    });
    return {
      id: -103,
      name: "GHN (API thực tế)",
      carrierName: "GHN",
      currency: "đ",
      // quoteImportLegsProRata appends "· lô X kg" itself — keep this name free of a lot size so it doesn't repeat
      zones: [{ id: -103, name: "Kho ĐVVC Hà Nội → kho shop Hoằng Hóa", fee: q.fee.total, unit: "", baseG: null, stepG: null, stepFee: null, freeOver: null, capKg: null }],
    };
  } catch (e) {
    const err = e instanceof GhnApiError ? e.message : e instanceof Error ? e.message : String(e);
    console.warn(`[ghn-transfer] không lấy được cước GHN cho chặng ③, dùng phương thức tĩnh: ${err}`);
    return null;
  }
}
