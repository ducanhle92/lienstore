/**
 * VNPost — "Dịch vụ Chuyển phát Tiêu chuẩn trong nước", versioned public rate card (used until the shop gets partner
 * API access). Base fee only: VAT, fuel surcharge and COD service are NOT in the public table, so every answer is
 * accuracy "from_price" ("Từ …") until those come from the carrier / contract. Pure module (tests import it).
 */
import { findProvince, isMergedProvince } from "@/lib/vn-address";
import { CARRIER_NAME, type AddressInput, type CarrierQuoteAdapter, type FeePart, type ShippingQuote, type ShippingQuoteRequest, unavailableQuote } from "./types";

export type VNPostRoute = "NOI_TINH_1" | "NOI_TINH_2" | "NOI_VUNG" | "CAN_VUNG" | "CACH_VUNG";
const ROUTE_INDEX: Record<VNPostRoute, number> = { NOI_TINH_1: 0, NOI_TINH_2: 1, NOI_VUNG: 2, CAN_VUNG: 3, CACH_VUNG: 4 };
export const VNPOST_ROUTE_LABEL: Record<VNPostRoute, string> = { NOI_TINH_1: "Nội tỉnh 1", NOI_TINH_2: "Nội tỉnh 2 (cùng tỉnh mới, khác tỉnh cũ)", NOI_VUNG: "Nội vùng", CAN_VUNG: "Cận vùng", CACH_VUNG: "Cách vùng" };

/** Rows: upper bound (g) → fee per route column [NT1, NT2, Nội vùng, Cận vùng, Cách vùng]; VND, before VAT & surcharges. */
export const VNPOST_RATE_CARD = {
  version: "2026-09-12",
  effectiveFrom: "2026-09-12",
  sourceUrl: "https://vnpost.vn/vi/dich-vu/chuyen-phat-trong-nuoc/dich-vu-chuyen-phat-tieu-chuan-trong-nuoc",
  serviceCode: "VNPOST_STANDARD",
  serviceName: "Chuyển phát tiêu chuẩn trong nước",
  zone1: ["Điện Biên", "Lai Châu", "Sơn La", "Lào Cai", "Phú Thọ", "Tuyên Quang", "Cao Bằng", "Thái Nguyên", "Lạng Sơn", "Bắc Ninh", "Quảng Ninh", "Hải Phòng", "Hưng Yên", "Ninh Bình", "Hà Nội", "Thanh Hóa", "Nghệ An", "Hà Tĩnh"],
  zone2: ["Hồ Chí Minh", "Cần Thơ", "Đồng Nai", "Tây Ninh", "Đồng Tháp", "Cà Mau", "An Giang", "Vĩnh Long", "Lâm Đồng", "Khánh Hòa"],
  zone3: ["Quảng Trị", "Quảng Ngãi", "Huế", "Đà Nẵng", "Gia Lai", "Đắk Lắk"],
  tiers: [
    { maxG: 50, fees: [6500, 6500, 6500, 7500, 8000] },
    { maxG: 100, fees: [7000, 7100, 7500, 8000, 8500] },
    { maxG: 250, fees: [9000, 9100, 9200, 9500, 12500] },
    { maxG: 500, fees: [11000, 13300, 14000, 15500, 17000] },
    { maxG: 1000, fees: [14800, 22300, 23500, 25000, 26000] },
    { maxG: 1500, fees: [20200, 25600, 27000, 29500, 30500] },
    { maxG: 2000, fees: [21400, 30200, 31800, 32500, 33500] },
  ],
  /** Every started kg above 2 kg, by weight bracket (upper bound in kg). */
  perKg: [
    { upToKg: 30, add: [2900, 3400, 3600, 4900, 6000] },
    { upToKg: 100, add: [2600, 3200, 3400, 4600, 5800] },
    { upToKg: 1000, add: [2200, 2700, 2800, 3500, 4800] },
    { upToKg: Infinity, add: [1600, 2000, 2100, 2800, 4200] },
  ],
  factors: { island: 2.0, fragile: 1.2, bulky: 1.3, heavy: 1.5 },
  remoteSurchargePct: 20,
  /** Unknown until VNPost / the contract provides them → quotes stay "Từ …". */
  vatPct: null as number | null,
  fuelSurchargePct: null as number | null,
  codFeeVnd: null as number | null,
  volumetricDivisor: 6000,
};

export function vnpostZone(provinceCode: string): 1 | 2 | 3 | null {
  const p = findProvince(provinceCode);
  if (!p) return null;
  if (VNPOST_RATE_CARD.zone1.includes(p.name)) return 1;
  if (VNPOST_RATE_CARD.zone2.includes(p.name)) return 2;
  if (VNPOST_RATE_CARD.zone3.includes(p.name)) return 3;
  return null;
}

export function classifyVNPostRoute(origin: Pick<AddressInput, "provinceCode" | "legacyProvinceCode">, dest: Pick<AddressInput, "provinceCode" | "legacyProvinceCode">): VNPostRoute {
  if (origin.provinceCode === dest.provinceCode) {
    const sameLegacy = !!origin.legacyProvinceCode && !!dest.legacyProvinceCode && origin.legacyProvinceCode === dest.legacyProvinceCode;
    const notMerged = !isMergedProvince(origin.provinceCode);
    return notMerged || sameLegacy ? "NOI_TINH_1" : "NOI_TINH_2";
  }
  const a = vnpostZone(origin.provinceCode);
  const b = vnpostZone(dest.provinceCode);
  if (a === b) return "NOI_VUNG";
  if (a === 3 || b === 3) return "CAN_VUNG";
  return "CACH_VUNG";
}

/** Base fee (VND, before factors) for a billable weight on a route. Above 2 kg every started kg is added. */
export function vnpostBaseFee(weightG: number, route: VNPostRoute): number {
  const col = ROUTE_INDEX[route];
  const w = Math.max(1, Math.ceil(weightG));
  const tier = VNPOST_RATE_CARD.tiers.find((t) => w <= t.maxG);
  if (tier) return tier.fees[col];
  let fee = VNPOST_RATE_CARD.tiers[VNPOST_RATE_CARD.tiers.length - 1].fees[col];
  const totalKg = Math.ceil(w / 1000); // 2 001 g → 3 kg
  let from = 2;
  for (const b of VNPOST_RATE_CARD.perKg) {
    if (totalKg <= from) break;
    const upto = Math.min(totalKg, b.upToKg);
    fee += (upto - from) * b.add[col];
    from = upto;
  }
  return fee;
}

/** Largest single factor (never multiplied together). */
export function vnpostFactor(flags: ShippingQuoteRequest["parcel"]["flags"]): { factor: number; label: string | null } {
  const f = VNPOST_RATE_CARD.factors;
  const cands: Array<[number, string]> = [];
  if (flags?.islandRoute) cands.push([f.island, "hải đảo"]);
  if (flags?.heavy) cands.push([f.heavy, "hàng nặng"]);
  if (flags?.bulky) cands.push([f.bulky, "hàng cồng kềnh"]);
  if (flags?.fragile) cands.push([f.fragile, "hàng dễ vỡ"]);
  if (!cands.length) return { factor: 1, label: null };
  const best = cands.sort((x, y) => y[0] - x[0])[0];
  return { factor: best[0], label: best[1] };
}

export function quoteVNPost(req: ShippingQuoteRequest, opts: { remoteArea?: boolean } = {}): ShippingQuote {
  const { parcel } = req;
  const route = classifyVNPostRoute(req.origin, req.destination);
  const volumetricWeightG = Math.round(((parcel.lengthCm * parcel.widthCm * parcel.heightCm) / VNPOST_RATE_CARD.volumetricDivisor) * 1000);
  const billableWeightG = Math.max(parcel.actualWeightG, volumetricWeightG);
  const base = vnpostBaseFee(billableWeightG, route);
  const { factor, label } = vnpostFactor(parcel.flags);
  const afterFactor = Math.round(base * factor);
  const remote = opts.remoteArea ? Math.round((afterFactor * VNPOST_RATE_CARD.remoteSurchargePct) / 100) : 0;
  const knownTotal = afterFactor + remote;
  const cod = req.paymentMethod === "cod" && parcel.codAmountVnd > 0;
  const parts: FeePart[] = [
    { code: "base", label: `Cước chính (${VNPOST_ROUTE_LABEL[route]}, nấc ${tierLabel(billableWeightG)})`, amountVnd: base },
    ...(factor > 1 ? [{ code: "factor", label: `Hệ số ${label} ×${factor}`, amountVnd: afterFactor - base }] : []),
    { code: "remote", label: "Phụ phí vùng xa (+20%)", amountVnd: opts.remoteArea ? remote : 0 },
    { code: "fuel", label: "Phụ phí xăng dầu", amountVnd: VNPOST_RATE_CARD.fuelSurchargePct === null ? null : Math.round((knownTotal * VNPOST_RATE_CARD.fuelSurchargePct) / 100) },
    { code: "vat", label: "VAT", amountVnd: VNPOST_RATE_CARD.vatPct === null ? null : Math.round((knownTotal * VNPOST_RATE_CARD.vatPct) / 100) },
    ...(cod ? [{ code: "cod", label: "Dịch vụ COD", amountVnd: VNPOST_RATE_CARD.codFeeVnd }] : []),
  ];
  const missing = parts.some((p) => p.amountVnd === null);
  const warnings: string[] = [];
  if (missing) warnings.push("Cước VNPost chưa gồm VAT/phụ phí xăng dầu hoặc dịch vụ COD; hãng xác nhận khi tạo vận đơn.");
  const known = parts.reduce((s, p) => s + (p.amountVnd ?? 0), 0);
  return {
    carrier: "VNPOST",
    carrierName: CARRIER_NAME.VNPOST,
    serviceCode: VNPOST_RATE_CARD.serviceCode,
    serviceName: VNPOST_RATE_CARD.serviceName,
    available: true,
    status: "available",
    statusText: "Cước tham khảo theo biểu phí công khai — bưu điện xác nhận khi nhận kiện",
    source: "public_rate_card",
    accuracy: missing ? "from_price" : "estimated",
    totalFeeVnd: known,
    baseFeeVnd: base,
    feeParts: parts,
    billableWeightG,
    volumetricWeightG,
    routeClass: route,
    routeLabel: VNPOST_ROUTE_LABEL[route],
    etaText: undefined,
    quotedAt: new Date().toISOString(),
    warnings,
    rateCardVersion: VNPOST_RATE_CARD.version,
    includes: [],
    codShipFee: true,
  };
}

function tierLabel(g: number): string {
  const t = VNPOST_RATE_CARD.tiers.find((x) => g <= x.maxG);
  if (!t) return `${Math.ceil(g / 1000)} kg`;
  const i = VNPOST_RATE_CARD.tiers.indexOf(t);
  return i === 0 ? `đến ${t.maxG} g` : `>${VNPOST_RATE_CARD.tiers[i - 1].maxG}–${t.maxG} g`;
}

export const vnpostAdapter: CarrierQuoteAdapter = {
  carrier: "VNPOST",
  configured: () => true,
  async quote(req) {
    if (!findProvince(req.destination.provinceCode) || !findProvince(req.origin.provinceCode)) {
      return [unavailableQuote("VNPOST", "unsupported", "Không nhận ra tỉnh/thành trong danh mục 34 tỉnh hiện hành", { source: "public_rate_card" })];
    }
    return [quoteVNPost(req)];
  },
};
