/**
 * SPX Express — public parcel rate card (used until SPX grants the shop an API; SPX terms forbid sharing API docs/token,
 * so the API path is a separate, private integration). Prices include VAT and COD. Pure module (tests import it).
 *
 * Zone caveat (spec §8.4): SPX's 01/02/2024 tariff places Thanh Hóa in the Central band, its service-quality page in the
 * North. For parcels ≤ 1 kg both readings give 22.000đ; above 1 kg the step differs (2.500đ vs 5.000đ), so when the two
 * readings disagree we answer "Từ …" (from_price) instead of guessing.
 */
import { findProvince } from "@/lib/vn-address";
import { CARRIER_NAME, type CarrierQuoteAdapter, type FeePart, type ShippingQuote, type ShippingQuoteRequest, unavailableQuote } from "./types";

export type SpxRegion = "north" | "central" | "south";
export type SpxRoute = "NOI_TINH" | "NOI_MIEN" | "LIEN_MIEN";
export const SPX_ROUTE_LABEL: Record<SpxRoute, string> = { NOI_TINH: "Nội tỉnh", NOI_MIEN: "Nội miền", LIEN_MIEN: "Liên miền / tuyến đặc biệt" };

export const SPX_RATE_CARD = {
  version: "2024-02-01",
  effectiveFrom: "2024-02-01",
  checkedAt: "2026-09-12",
  sourceUrl: "https://spx.vn/downloads/resource/shipping_rate_vn.pdf",
  serviceCode: "SPX_STANDARD",
  serviceName: "Giao hàng tiêu chuẩn",
  maxWeightG: 17_000,
  maxSideCm: 60,
  volumetricDivisor: 6000,
  /** First kilogram, then every started 0,5 kg. VND incl. VAT. */
  tiers: {
    NOI_TINH: { firstKg: 18_000, perHalfKg: 2_500 },
    NOI_MIEN: { firstKg: 22_000, perHalfKg: 2_500 },
    LIEN_MIEN: { firstKg: 22_000, perHalfKg: 5_000 },
  } as Record<SpxRoute, { firstKg: number; perHalfKg: number }>,
  highValueThresholdVnd: 3_000_000,
  highValueFeeVnd: 25_000,
};

/** Province → SPX region(s). Ambiguous provinces list every reading found in SPX documents. */
export const SPX_RATE_ZONE_MAP: { version: string; effectiveFrom: string; regions: Record<string, SpxRegion[]> } = {
  version: SPX_RATE_CARD.version,
  effectiveFrom: SPX_RATE_CARD.effectiveFrom,
  regions: {
    "Hà Nội": ["north"], "Cao Bằng": ["north"], "Tuyên Quang": ["north"], "Điện Biên": ["north"], "Lai Châu": ["north"], "Sơn La": ["north"], "Lào Cai": ["north"], "Thái Nguyên": ["north"],
    "Lạng Sơn": ["north"], "Quảng Ninh": ["north"], "Bắc Ninh": ["north"], "Phú Thọ": ["north"], "Hải Phòng": ["north"], "Hưng Yên": ["north"], "Ninh Bình": ["north"],
    "Thanh Hóa": ["north", "central"],
    "Nghệ An": ["central"], "Hà Tĩnh": ["central"], "Quảng Trị": ["central"], "Huế": ["central"], "Đà Nẵng": ["central"], "Quảng Ngãi": ["central"], "Gia Lai": ["central"], "Khánh Hòa": ["central"], "Đắk Lắk": ["central"], "Lâm Đồng": ["central"],
    "Đồng Nai": ["south"], "Hồ Chí Minh": ["south"], "Tây Ninh": ["south"], "Đồng Tháp": ["south"], "Vĩnh Long": ["south"], "An Giang": ["south"], "Cần Thơ": ["south"], "Cà Mau": ["south"],
  },
};

export function spxRegions(provinceCode: string): SpxRegion[] {
  const p = findProvince(provinceCode);
  return p ? (SPX_RATE_ZONE_MAP.regions[p.name] ?? []) : [];
}

/** Fee for a billable weight on a tier: first kg flat, then every started 0,5 kg. */
export function spxWeightFee(tier: { firstKg: number; perHalfKg: number }, billableG: number): number {
  if (billableG <= 1000) return tier.firstKg;
  const extraSteps = Math.ceil((billableG - 1000) / 500);
  return tier.firstKg + extraSteps * tier.perHalfKg;
}

export function spxBillableWeightG(parcel: Pick<ShippingQuoteRequest["parcel"], "actualWeightG" | "lengthCm" | "widthCm" | "heightCm">): { billableWeightG: number; volumetricWeightG: number } {
  const volumetricWeightG = Math.round(((parcel.lengthCm * parcel.widthCm * parcel.heightCm) / SPX_RATE_CARD.volumetricDivisor) * 1000);
  return { billableWeightG: Math.max(parcel.actualWeightG, volumetricWeightG), volumetricWeightG };
}

/** Possible routes for origin → destination (more than one when a province is ambiguous in SPX documents). */
export function spxRoutes(originProvinceCode: string, destProvinceCode: string): SpxRoute[] {
  if (originProvinceCode === destProvinceCode) return ["NOI_TINH"];
  const a = spxRegions(originProvinceCode);
  const b = spxRegions(destProvinceCode);
  if (!a.length || !b.length) return [];
  const set = new Set<SpxRoute>();
  for (const x of a) for (const y of b) set.add(x === y ? "NOI_MIEN" : "LIEN_MIEN");
  return [...set];
}

export function spxHighValueFee(codAmountVnd: number, declaredValueVnd: number): number {
  return Math.max(codAmountVnd, declaredValueVnd) >= SPX_RATE_CARD.highValueThresholdVnd ? SPX_RATE_CARD.highValueFeeVnd : 0;
}

export function quoteSPX(req: ShippingQuoteRequest): ShippingQuote {
  const { parcel } = req;
  const { billableWeightG, volumetricWeightG } = spxBillableWeightG(parcel);
  const tooBig = Math.max(parcel.lengthCm, parcel.widthCm, parcel.heightCm) > SPX_RATE_CARD.maxSideCm;
  if (billableWeightG > SPX_RATE_CARD.maxWeightG || tooBig) {
    return unavailableQuote("SPX", "unsupported", `SPX gói tiêu chuẩn không nhận kiện trên ${SPX_RATE_CARD.maxWeightG / 1000} kg hoặc cạnh trên ${SPX_RATE_CARD.maxSideCm} cm`, {
      serviceCode: SPX_RATE_CARD.serviceCode,
      serviceName: SPX_RATE_CARD.serviceName,
      source: "public_rate_card",
      billableWeightG,
      volumetricWeightG,
      rateCardVersion: SPX_RATE_CARD.version,
    });
  }
  const routes = spxRoutes(req.origin.provinceCode, req.destination.provinceCode);
  if (!routes.length) return unavailableQuote("SPX", "unsupported", "Không xác định được tuyến SPX cho địa chỉ này", { source: "public_rate_card", billableWeightG, volumetricWeightG });
  const fees = routes.map((r) => ({ route: r, fee: spxWeightFee(SPX_RATE_CARD.tiers[r], billableWeightG) }));
  const distinct = new Set(fees.map((f) => f.fee));
  const pick = fees.sort((x, y) => x.fee - y.fee)[0];
  const ambiguous = distinct.size > 1;
  const highValue = spxHighValueFee(parcel.codAmountVnd, parcel.declaredValueVnd);
  const parts: FeePart[] = [
    { code: "base", label: `Cước gói/kiện (${ambiguous ? routes.map((r) => SPX_ROUTE_LABEL[r]).join(" hoặc ") : SPX_ROUTE_LABEL[pick.route]}, ${billableWeightG <= 1000 ? "nấc 0–1 kg" : `${(Math.ceil(billableWeightG / 500) * 0.5).toLocaleString("vi-VN")} kg`})`, amountVnd: pick.fee },
    { code: "vat", label: "VAT", amountVnd: 0, included: true },
    { code: "cod", label: "Phí COD / chuyển khoản COD", amountVnd: 0, included: true },
    { code: "high_value", label: highValue ? `Phí hàng giá trị cao (từ ${SPX_RATE_CARD.highValueThresholdVnd.toLocaleString("vi-VN")}đ)` : `Phí hàng giá trị cao (đơn dưới ${SPX_RATE_CARD.highValueThresholdVnd.toLocaleString("vi-VN")}đ)`, amountVnd: highValue },
  ];
  const warnings: string[] = [];
  if (ambiguous) warnings.push("SPX xếp tuyến này vào các nhóm khác nhau tùy tài liệu; mức thấp nhất được hiển thị, hãng xác nhận nấc khi tạo vận đơn.");
  return {
    carrier: "SPX",
    carrierName: CARRIER_NAME.SPX,
    serviceCode: SPX_RATE_CARD.serviceCode,
    serviceName: SPX_RATE_CARD.serviceName,
    available: true,
    status: "available",
    statusText: ambiguous ? "Cước tham khảo — SPX xác nhận nấc tuyến khi tạo vận đơn" : "Cước theo biểu phí SPX công bố — hãng có thể cân/đo lại",
    source: "public_rate_card",
    accuracy: ambiguous ? "from_price" : "estimated",
    totalFeeVnd: pick.fee + highValue,
    baseFeeVnd: pick.fee,
    feeParts: parts,
    billableWeightG,
    volumetricWeightG,
    routeClass: ambiguous ? routes.join("|") : pick.route,
    routeLabel: ambiguous ? routes.map((r) => SPX_ROUTE_LABEL[r]).join(" / ") : SPX_ROUTE_LABEL[pick.route],
    etaText: undefined,
    quotedAt: new Date().toISOString(),
    warnings,
    rateCardVersion: SPX_RATE_CARD.version,
    includes: ["VAT", "COD"],
    codShipFee: true,
  };
}

export const spxAdapter: CarrierQuoteAdapter = {
  carrier: "SPX",
  configured: () => true,
  async quote(req) {
    return [quoteSPX(req)];
  },
};
