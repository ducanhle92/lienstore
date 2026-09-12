/**
 * Goship (goship.io) — one API for every Vietnamese carrier: pure helpers (no network, no DB) shared by the adapter and
 * the unit tests. Goship still keys addresses by the OLD 3-level model (city → district → ward), so a customer's
 * (new province, new ward) has to be matched onto a Goship city + district by name.
 */
import { fold } from "@/lib/vn-address";
import { CARRIER_NAME, type CarrierCode, type FeePart, type ShippingQuote, type ShippingQuoteRequest } from "./types";

export interface GoshipCity {
  id: string;
  name: string;
}
export interface GoshipDistrict {
  id: string;
  name: string;
  city_id: string;
}
export interface GoshipWard {
  id: number | string;
  name: string;
  district_id: string;
}

/** Rate row as documented at doc.goship.io/api/shipment/rate. */
export interface GoshipRate {
  id: string;
  rate: string;
  carrier_name: string;
  carrier_short_name: string;
  carrier_logo?: string;
  service: string;
  expected?: string;
  service_fee?: number;
  cod_fee?: number;
  insurance_fee?: number;
  location_fee?: number;
  location_first_fee?: number;
  location_step_fee?: number;
  oil_fee?: number;
  remote_area_fee?: number;
  return_fee?: number;
  weight_fee?: number;
  discount?: number;
  total_fee: number;
  total_amount?: number;
  is_apply_only?: boolean;
  report?: { success_percent?: number; return_percent?: number; avg_time_delivery?: number; avg_time_delivery_format?: string };
}

/** carrier_short_name → our carrier code (doc.goship.io/api/shipment/carrier). */
export const GOSHIP_CARRIER_MAP: Record<string, CarrierCode> = {
  vtp: "VIETTEL_POST",
  ems: "EMS",
  vnp: "VNPOST",
  ghtk: "GHTK",
  ghnv3: "GHN",
  ghn: "GHN",
  shopee: "SPX",
  spx: "SPX",
  best: "BEST",
  jnt: "JNT",
  jnt2: "JNT",
  tikinow: "OTHER",
};

export function goshipCarrierCode(shortName: string): CarrierCode {
  return GOSHIP_CARRIER_MAP[shortName.toLowerCase()] ?? "OTHER";
}

const strip = (s: string) => fold(s).replace(/^(phuong|xa|dac khu|thi tran|tt)\s+/, "");
const stripDistrict = (s: string) => fold(s).replace(/^(quan|huyen|thi xa|thanh pho|tp|tx)\s+/, "");
const stripCity = (s: string) => fold(s).replace(/^(tinh|thanh pho|tp)\s+/, "");

/** Goship cities whose name is one of the legacy provinces of the customer's (new) province. */
export function matchGoshipCities(cities: GoshipCity[], legacyProvinceNames: string[]): GoshipCity[] {
  const wanted = new Set(legacyProvinceNames.map(stripCity));
  // "Bà Rịa - Vũng Tàu" vs "Bà Rịa Vũng Tàu", "Thừa Thiên Huế" vs "Huế"
  return cities.filter((c) => {
    const k = stripCity(c.name);
    return wanted.has(k) || [...wanted].some((w) => k.includes(w) || w.includes(k));
  });
}

export interface GoshipAddressMatch {
  city: GoshipCity;
  district: GoshipDistrict;
  ward?: GoshipWard;
  /** how the match was made, for the card's "Xem cách tính" */
  how: "ward" | "district" | "first_district";
}

/**
 * Pick the Goship city + district for a new-model ward: 1) a Goship ward with the same name inside any candidate city,
 * 2) a district carrying the (merged) commune's name, 3) the first district of the only candidate city.
 * `wardsOf` is called lazily (network in the adapter, a lookup in tests).
 */
export async function matchGoshipAddress(
  cities: GoshipCity[],
  districtsOf: (cityId: string) => Promise<GoshipDistrict[]>,
  wardsOf: (districtId: string) => Promise<GoshipWard[]>,
  legacyProvinceNames: string[],
  wardName: string,
): Promise<GoshipAddressMatch | null> {
  const candidates = matchGoshipCities(cities, legacyProvinceNames);
  if (!candidates.length) return null;
  const want = strip(wardName);
  const all: Array<{ city: GoshipCity; districts: GoshipDistrict[] }> = [];
  for (const city of candidates) all.push({ city, districts: await districtsOf(city.id) });
  // 2) cheap check first: district named like the commune (new communes often take the old district's name)
  for (const { city, districts } of all) {
    const d = districts.find((x) => stripDistrict(x.name) === want);
    if (d) {
      const wards = await wardsOf(d.id);
      const w = wards.find((x) => strip(x.name) === want);
      return { city, district: d, ward: w, how: w ? "ward" : "district" };
    }
  }
  // 1) ward with the same name anywhere in the candidate cities
  for (const { city, districts } of all) {
    for (const d of districts) {
      const wards = await wardsOf(d.id);
      const w = wards.find((x) => strip(x.name) === want);
      if (w) return { city, district: d, ward: w, how: "ward" };
    }
  }
  // 3) unmerged province with an unknown commune name: its first district (province-level rate is usually the same)
  if (all.length === 1 && all[0].districts[0]) return { city: all[0].city, district: all[0].districts[0], how: "first_district" };
  return null;
}

/** One Goship rate row → our quote shape (exact, live, via the aggregator). */
export function goshipRateToQuote(r: GoshipRate, req: ShippingQuoteRequest, quotedAt = new Date()): ShippingQuote {
  const carrier = goshipCarrierCode(r.carrier_short_name);
  const parts: FeePart[] = [
    { code: "location_fee", label: "Cước theo khu vực / cân", amountVnd: (r.location_fee ?? 0) + (r.weight_fee ?? 0) },
    { code: "service_fee", label: "Phí dịch vụ", amountVnd: r.service_fee ?? 0 },
    { code: "oil_fee", label: "Phụ phí xăng dầu", amountVnd: r.oil_fee ?? 0 },
    { code: "cod_fee", label: "Phí thu hộ COD", amountVnd: r.cod_fee ?? 0 },
    { code: "insurance_fee", label: "Phí khai giá / bảo hiểm", amountVnd: r.insurance_fee ?? 0 },
    { code: "remote_area_fee", label: "Phụ phí vùng xa", amountVnd: r.remote_area_fee ?? 0 },
    { code: "discount", label: "Giảm giá / hợp đồng", amountVnd: r.discount ? -Math.abs(r.discount) : 0 },
  ];
  const vol = Math.round(((req.parcel.lengthCm * req.parcel.widthCm * req.parcel.heightCm) / 6000) * 1000);
  const report = r.report;
  const eta = [r.expected?.trim(), report?.avg_time_delivery_format ? `TB ${report.avg_time_delivery_format}` : ""].filter(Boolean).join(" · ");
  return {
    carrier,
    carrierName: r.carrier_name?.trim() || CARRIER_NAME[carrier],
    serviceCode: String(r.id),
    serviceName: r.service?.trim() || "Tiêu chuẩn",
    available: Number.isFinite(r.total_fee) && r.total_fee > 0,
    status: Number.isFinite(r.total_fee) && r.total_fee > 0 ? "available" : "unsupported",
    statusText: "Cước hiện tại từ hãng (qua Goship)",
    source: "live_api",
    accuracy: "exact_now",
    totalFeeVnd: Math.round(r.total_fee),
    baseFeeVnd: (r.location_fee ?? 0) + (r.weight_fee ?? 0),
    feeParts: parts,
    billableWeightG: Math.max(req.parcel.actualWeightG, vol),
    volumetricWeightG: vol,
    routeLabel: r.service?.trim() || undefined,
    etaText: eta || undefined,
    quotedAt: quotedAt.toISOString(),
    expiresAt: new Date(quotedAt.getTime() + 10 * 60 * 1000).toISOString(),
    warnings: report?.success_percent !== undefined && report.success_percent < 85 ? [`Tỉ lệ giao thành công của hãng trên tuyến này: ${report.success_percent}%`] : [],
    providerReference: String(r.rate ?? r.id),
    includes: ["Xăng dầu, COD, khai giá theo bảng phí Goship", ...(r.return_fee ? [`hoàn hàng ${r.return_fee.toLocaleString("vi-VN")}đ nếu giao thất bại`] : [])],
    codShipFee: true,
  };
}
