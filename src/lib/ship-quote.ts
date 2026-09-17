import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { ALL_ADAPTERS, quoteAllCarriers, type QuoteBundle, type QuoteOptions } from "./carriers";
import { goshipAdapter, goshipConfigured } from "./carriers/goship";
import { ALL_CARRIER_CODES, type AddressInput, type CarrierCode, type ShippingQuoteRequest } from "./carriers/types";
import { loadShippingMethods, parcelOf } from "./db";
import { getDb, getSetting } from "./sqlite";
import { composeAddress, findProvince, findProvinceByName, findWard, findWardByName, legacyCode, legacyProvincesOf, parseAddressToCodes, wardsOf } from "./vn-address";

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
  ["GHTK", /ghtk|ti[ếe]t ki[ệe]m/i],
  ["JNT", /j&t|jnt/i],
];

/** Carriers hidden from customers: the JSON setting plus VN-domestic methods the admin de-activated for that carrier. */
export function disabledCarriers(db: DatabaseSync = getDb()): CarrierCode[] {
  const out = new Set<CarrierCode>();
  try {
    const raw = JSON.parse(getSetting(db, "vn_carriers_disabled") || "[]") as unknown;
    if (Array.isArray(raw)) for (const v of raw) if (typeof v === "string" && (ALL_CARRIER_CODES as string[]).includes(v)) out.add(v as CarrierCode);
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
  // Goship (one API, every carrier) is the source when connected; the per-carrier adapters (GHN direct, rate cards)
  // only step in when Goship itself cannot answer, so the customer never sees two prices for the same carrier.
  const disabled = disabledCarriers(db);
  let bundle = await quoteAllCarriers(request, { disabled, fresh: opts.fresh, adapters: goshipConfigured() ? [goshipAdapter] : ALL_ADAPTERS });
  if (goshipConfigured() && !bundle.quotes.some((q) => q.available)) {
    const fallback = await quoteAllCarriers(request, { disabled, fresh: opts.fresh, adapters: ALL_ADAPTERS });
    const note = bundle.quotes[0]?.statusText ?? "Goship không phản hồi";
    bundle = { ...fallback, quotes: fallback.quotes.map((q) => ({ ...q, warnings: [`${note} — dùng nguồn dự phòng.`, ...q.warnings] })) };
  }
  return { ...bundle, request, parcel: { weightG: parcel.weightG, length: parcel.dims.length, width: parcel.dims.width, height: parcel.dims.height, subtotal: parcel.subtotal, quantity: parcel.quantity } };
}

// ---------------------------------------------------------------------------------------------------------------------
// Leg ③: carrier warehouse in Hà Nội → shop warehouse in Thanh Hóa, quoted by the same carrier APIs as checkout so the
// admin can pick the cheapest option for the parcel of one order.

export interface TransferQuote {
  carrier: string;
  carrierName: string;
  serviceName: string;
  serviceCode: string;
  fee: number | null;
  eta: string | null;
  available: boolean;
  statusText: string;
  fromPrice: boolean;
}

/** Origin of leg ③: the "Từ: …" part of the default ③ method's warehouse text, else the Kiến Express ward in Hà Nội. */
export function transferOrigin(db: DatabaseSync = getDb()): AddressInput | null {
  const m = loadShippingMethods(db, true).find((x) => x.leg === "vn_transfer");
  const fromText = (m?.warehouse.match(/Từ:\s*([^·]+)/)?.[1] ?? "").trim();
  const parsed = fromText ? parseAddressToCodes(fromText) : null;
  if (parsed) return destinationAddress({ provinceCode: parsed.provinceCode, wardCode: parsed.wardCode, street: parsed.street || "Kho Kiến Express" });
  // Kiến Express Hà Nội: OV3.15 XP5 Khu đô thị Xuân Phương Viglacera, Nam Từ Liêm → Phường Xuân Phương (Hà Nội) after the 2025 merger
  const hn = findProvinceByName("Hà Nội") ?? findProvinceByName("Thành phố Hà Nội");
  if (!hn) return null;
  const ward = findWardByName(hn.code, "Xuân Phương") ?? findWardByName(hn.code, "Phường Xuân Phương") ?? findWardByName(hn.code, "Tây Mỗ") ?? wardsOf(hn.code)[0];
  if (!ward) return null;
  return destinationAddress({ provinceCode: hn.code, wardCode: ward.code, street: "Kho Kiến Express, OV3.15 XP5 KĐT Xuân Phương Viglacera" });
}

export async function quoteTransferLeg(lines: Array<{ productId: number; quantity: number }>, fallback?: { weightG: number; subtotal: number }): Promise<{ quotes: TransferQuote[]; from: string; to: string } | { error: string }> {
  const db = getDb();
  const origin = transferOrigin(db);
  if (!origin) return { error: "Không xác định được địa chỉ kho ĐVVC ở Hà Nội để báo giá." };
  const destination = warehouseAddress(db);
  let parcel = parcelOf(db, lines);
  // products since hidden / deleted: size the parcel from the order's own weight instead of refusing
  if (parcel.quantity === 0 && fallback && fallback.weightG > 0) {
    const qty = lines.reduce((n, l) => n + Math.max(1, l.quantity), 0) || 1;
    parcel = { weightG: fallback.weightG, dims: { length: 25, width: 20, height: 12 } as typeof parcel.dims, subtotal: fallback.subtotal, quantity: qty, special: false };
  }
  if (parcel.quantity === 0) return { error: "Đơn không có sản phẩm." };
  const request: ShippingQuoteRequest = {
    originWarehouseId: "kien-express-ha-noi",
    origin,
    destination,
    parcel: { actualWeightG: parcel.weightG, lengthCm: parcel.dims.length, widthCm: parcel.dims.width, heightCm: parcel.dims.height, orderValueVnd: parcel.subtotal, declaredValueVnd: parcel.subtotal, codAmountVnd: 0, quantity: parcel.quantity, flags: parcel.special ? { fragile: true } : undefined },
    paymentMethod: "bank_transfer",
  };
  const disabled = disabledCarriers(db);
  let bundle = await quoteAllCarriers(request, { disabled, fresh: true, adapters: goshipConfigured() ? [goshipAdapter] : ALL_ADAPTERS });
  if (goshipConfigured() && !bundle.quotes.some((q) => q.available)) bundle = await quoteAllCarriers(request, { disabled, fresh: true, adapters: ALL_ADAPTERS });
  const quotes: TransferQuote[] = bundle.quotes
    .map((q) => ({ carrier: q.carrier, carrierName: q.carrierName, serviceName: q.serviceName ?? "", serviceCode: q.serviceCode, fee: q.totalFeeVnd, eta: q.etaText ?? null, available: q.available, statusText: q.statusText, fromPrice: q.accuracy === "from_price" }))
    .sort((a, b) => (a.available === b.available ? (a.fee ?? Infinity) - (b.fee ?? Infinity) : a.available ? -1 : 1));
  return { quotes, from: origin.fullAddress, to: destination.fullAddress };
}
