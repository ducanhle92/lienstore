import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { quoteAllCarriers, type QuoteBundle, type QuoteOptions } from "./carriers";
import type { AddressInput, CarrierCode, ShippingQuoteRequest } from "./carriers/types";
import { loadShippingMethods, parcelOf } from "./db";
import { getDb, getSetting } from "./sqlite";
import { composeAddress, findProvince, findWard, findWardByName, legacyCode, legacyProvincesOf, wardsOf } from "./vn-address";

/**
 * Server glue between the storefront (address codes + cart lines) and the carrier adapters: the parcel is rebuilt from
 * the catalogue, the origin is the shop warehouse (Hoằng Hóa, Thanh Hóa), and carriers the admin switched off are hidden.
 */

export interface DestinationCodes {
  provinceCode: string;
  wardCode: string;
  street: string;
}

export const WAREHOUSE_ID = "thanh-hoa-hoang-hoa";

/** Origin = the warehouse that creates the waybill (settings override the Hoằng Hóa default). */
export function warehouseAddress(db: DatabaseSync = getDb()): AddressInput {
  const provinceCode = getSetting(db, "warehouse_province_code") || "38";
  const province = findProvince(provinceCode) ?? findProvince("38")!;
  const wardSetting = getSetting(db, "warehouse_ward_code");
  const ward = (wardSetting ? findWard(wardSetting) : undefined) ?? findWardByName(province.code, "Hoằng Hóa") ?? wardsOf(province.code)[0];
  const legacy = legacyProvincesOf(province.code);
  return {
    provinceCode: province.code,
    provinceName: province.name,
    wardCode: ward?.code ?? "",
    wardName: ward?.name ?? "",
    fullAddress: composeAddress(getSetting(db, "pickup_address") || "Kho LienStore, Hoằng Hóa", ward, province),
    legacyProvinceCode: legacy.length === 1 ? legacyCode(legacy[0]) : undefined,
  };
}

/** Validate + normalise what the browser sent; null when the codes are not in the 34-province catalogue. */
export function destinationAddress(dest: DestinationCodes): AddressInput | null {
  const province = findProvince(dest.provinceCode);
  const ward = findWard(dest.wardCode);
  if (!province || !ward || ward.provinceCode !== province.code) return null;
  const legacy = legacyProvincesOf(province.code);
  return {
    provinceCode: province.code,
    provinceName: province.name,
    wardCode: ward.code,
    wardName: ward.name,
    fullAddress: composeAddress(dest.street, ward, province),
    // only unmerged provinces have a single legacy province; merged ones need a ward → old-province table (not available yet)
    legacyProvinceCode: legacy.length === 1 ? legacyCode(legacy[0]) : undefined,
  };
}

const CARRIER_MATCH: Array<[CarrierCode, RegExp]> = [
  ["GHN", /ghn|giao h[àa]ng nhanh/i],
  ["VIETTEL_POST", /viettel/i],
  ["VNPOST", /vnpost|vietnam post|b[ưu]u ?[đd]i[ệe]n/i],
  ["SPX", /spx/i],
];

/** Carriers hidden from customers: the JSON setting plus VN-domestic methods the admin de-activated for that carrier. */
export function disabledCarriers(db: DatabaseSync = getDb()): CarrierCode[] {
  const out = new Set<CarrierCode>();
  try {
    const raw = JSON.parse(getSetting(db, "vn_carriers_disabled") || "[]") as unknown;
    if (Array.isArray(raw)) for (const v of raw) if (v === "GHN" || v === "VIETTEL_POST" || v === "VNPOST" || v === "SPX") out.add(v);
  } catch {
    /* ignore */
  }
  const methods = loadShippingMethods(db, false).filter((m) => m.leg === "vn_domestic");
  for (const [code, re] of CARRIER_MATCH) {
    const mine = methods.filter((m) => re.test(`${m.name} ${m.carrierName ?? ""}`));
    if (mine.length && mine.every((m) => !m.active)) out.add(code);
  }
  return [...out];
}

export interface CartQuoteInput {
  lines: Array<{ productId: number; quantity: number }>;
  destination: DestinationCodes;
  /** Cash on delivery (the shop currently takes bank transfer only, so normally false). */
  cod?: boolean;
  coupon?: string;
}

export interface CartQuoteResult extends QuoteBundle {
  request: ShippingQuoteRequest;
  parcel: { weightG: number; length: number; width: number; height: number; subtotal: number; quantity: number };
}

/** Build the request for a cart + destination and quote every carrier (cached ≤ 10 min unless `fresh`). */
export async function quoteCart(input: CartQuoteInput, opts: Pick<QuoteOptions, "fresh"> = {}): Promise<CartQuoteResult | { error: string }> {
  const db = getDb();
  const destination = destinationAddress(input.destination);
  if (!destination) return { error: "Địa chỉ không hợp lệ — chọn lại tỉnh/thành và xã/phường." };
  const parcel = parcelOf(db, input.lines);
  if (parcel.quantity === 0) return { error: "Giỏ hàng trống." };
  const request: ShippingQuoteRequest = {
    originWarehouseId: WAREHOUSE_ID,
    origin: warehouseAddress(db),
    destination,
    parcel: {
      actualWeightG: parcel.weightG,
      lengthCm: parcel.dims.length,
      widthCm: parcel.dims.width,
      heightCm: parcel.dims.height,
      orderValueVnd: parcel.subtotal,
      declaredValueVnd: parcel.subtotal,
      codAmountVnd: input.cod ? parcel.subtotal : 0,
      quantity: parcel.quantity,
      flags: parcel.special ? { fragile: true } : undefined,
    },
    paymentMethod: input.cod ? "cod" : "bank_transfer",
    coupon: input.coupon?.trim() || undefined,
  };
  const bundle = await quoteAllCarriers(request, { disabled: disabledCarriers(db), fresh: opts.fresh });
  return { ...bundle, request, parcel: { weightG: parcel.weightG, length: parcel.dims.length, width: parcel.dims.width, height: parcel.dims.height, subtotal: parcel.subtotal, quantity: parcel.quantity } };
}
