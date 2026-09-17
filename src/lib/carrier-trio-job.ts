import "server-only";
import { ALL_CARRIER_CODES, type CarrierCode } from "./carriers/types";
import { getDb, getSetting, setSetting } from "./sqlite";

/**
 * One-time (flag `carrier_trio_rev`), owner decision 17/09/2026: customers may pick only the three carriers the shop
 * actually books — GHN and J&T (via Goship) and Viettel Post (Viettel app/API). Best, VNPost, SPX, EMS, GHTK… are
 * switched off in Vận chuyển › ④ › "Khách được chọn"; the owner can re-enable any of them there later.
 */
export const CUSTOMER_CARRIERS: CarrierCode[] = ["GHN", "JNT", "VIETTEL_POST"];

export function applyCarrierTrioOnce(): { disabled: CarrierCode[] } | null {
  const db = getDb();
  if (getSetting(db, "carrier_trio_rev") === "1") return null;
  const disabled = ALL_CARRIER_CODES.filter((c) => c !== "GOSHIP" && !CUSTOMER_CARRIERS.includes(c));
  setSetting(db, "vn_carriers_disabled", JSON.stringify(disabled));
  setSetting(db, "carrier_trio_rev", "1");
  return { disabled };
}
