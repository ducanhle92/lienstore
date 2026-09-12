/**
 * Shared contract of the Vietnam-domestic carrier adapters (spec: docs/research/cuoc-van-chuyen-noi-dia.md).
 * Pure types — imported by server adapters, API routes and the storefront quote cards alike.
 */

export type CarrierCode = "GHN" | "VIETTEL_POST" | "VNPOST" | "SPX" | "EMS" | "GHTK" | "JNT" | "BEST" | "OTHER" | "GOSHIP";

export const CARRIER_NAME: Record<CarrierCode, string> = {
  GHN: "Giao Hàng Nhanh (GHN)",
  VIETTEL_POST: "Viettel Post",
  VNPOST: "Vietnam Post (VNPost)",
  SPX: "SPX Express",
  EMS: "EMS (Bưu điện)",
  GHTK: "Giao Hàng Tiết Kiệm",
  JNT: "J&T Express",
  BEST: "Best Express",
  OTHER: "Hãng khác",
  /** Aggregator status card (only when Goship itself fails / is not connected). */
  GOSHIP: "Goship (nhiều hãng)",
};

/** Short label for buttons ("Chọn GHN"). */
export const CARRIER_SHORT: Record<CarrierCode, string> = { GHN: "GHN", VIETTEL_POST: "Viettel Post", VNPOST: "VNPost", SPX: "SPX", EMS: "EMS", GHTK: "GHTK", JNT: "J&T", BEST: "Best", OTHER: "hãng này", GOSHIP: "Goship" };

export const ALL_CARRIER_CODES: CarrierCode[] = ["GHN", "VIETTEL_POST", "VNPOST", "SPX", "EMS", "GHTK", "JNT", "BEST", "OTHER", "GOSHIP"];

/** Normalised delivery / origin address (new 2-level model: province → ward, plus the legacy codes some carriers still need). */
export interface AddressInput {
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  /** House number, street / hamlet + ward + province (what the courier reads). */
  fullAddress: string;
  /** Province before the 2025 merger (VNPost "Nội tỉnh 1/2"); undefined when unknown. */
  legacyProvinceCode?: string;
  legacyDistrictCode?: string;
  /** Carrier-specific location ids (GHN district/ward, Viettel Post ids…). Never the province name. */
  carrierCodes?: {
    ghn?: { districtId?: number; wardCode: string };
    viettelPost?: { provinceId?: number; districtId?: number; wardId?: number };
    vnpost?: { provinceId?: string; districtId?: string; wardId?: string };
    spx?: { provinceId?: string; districtId?: string; wardId?: string };
  };
}

export interface ParcelInput {
  /** Packed weight in grams (never the bare product weight). */
  actualWeightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  orderValueVnd: number;
  declaredValueVnd: number;
  codAmountVnd: number;
  quantity: number;
  flags?: { fragile?: boolean; bulky?: boolean; heavy?: boolean; islandRoute?: boolean };
}

export interface ShippingQuoteRequest {
  originWarehouseId: string;
  origin: AddressInput;
  destination: AddressInput;
  parcel: ParcelInput;
  paymentMethod: "cod" | "bank_transfer";
  /** Discount code applied to the shipping fee (part of the cache key). */
  coupon?: string;
}

export type QuoteSource = "live_api" | "public_rate_card" | "contract_rate";
/** exact_now = carrier API just answered · estimated = full rate card, carrier may re-weigh · from_price = a part is unknown → show "Từ …". */
export type QuoteAccuracy = "exact_now" | "estimated" | "from_price";
/** Per-carrier state shown on the card (a failing carrier never hides the others). */
export type QuoteStatus = "available" | "unsupported" | "error" | "not_configured";

export interface FeePart {
  code: string;
  label: string;
  /** null = the carrier confirms this part when the waybill is created. */
  amountVnd: number | null;
  /** "included" = already inside the base fee. */
  included?: boolean;
}

export interface ShippingQuote {
  carrier: CarrierCode;
  carrierName: string;
  serviceCode: string;
  serviceName: string;
  available: boolean;
  status: QuoteStatus;
  /** Short human state: "Có thể giao", "Tạm không lấy được cước"… */
  statusText: string;
  source: QuoteSource;
  accuracy: QuoteAccuracy;
  totalFeeVnd: number | null;
  baseFeeVnd?: number;
  feeParts: FeePart[];
  billableWeightG: number;
  volumetricWeightG?: number;
  routeClass?: string;
  routeLabel?: string;
  etaText?: string;
  quotedAt: string;
  expiresAt?: string;
  warnings: string[];
  providerReference?: string;
  /** Version of the public rate card the number came from (undefined for live API). */
  rateCardVersion?: string;
  /** Which parts are already covered by the fee ("VAT", "COD"…). */
  includes: string[];
  /** May the customer pay this fee to the courier on delivery. */
  codShipFee: boolean;
}

export interface CarrierQuoteAdapter {
  carrier: CarrierCode;
  /** False → the adapter answers with status "not_configured" without any network call. */
  configured(): boolean;
  quote(req: ShippingQuoteRequest): Promise<ShippingQuote[]>;
}

/** Skeleton every adapter fills in; keeps the "unavailable" answers uniform. */
export function unavailableQuote(carrier: CarrierCode, status: QuoteStatus, statusText: string, opts: Partial<ShippingQuote> = {}): ShippingQuote {
  return {
    carrier,
    carrierName: CARRIER_NAME[carrier],
    serviceCode: opts.serviceCode ?? "",
    serviceName: opts.serviceName ?? "",
    available: false,
    status,
    statusText,
    source: opts.source ?? "live_api",
    accuracy: "estimated",
    totalFeeVnd: null,
    feeParts: [],
    billableWeightG: opts.billableWeightG ?? 0,
    quotedAt: new Date().toISOString(),
    warnings: opts.warnings ?? [],
    includes: [],
    codShipFee: false,
    ...opts,
  };
}

/** Order of the cards: cheapest first; exact quotes before estimates of the same carrier/service; unavailable last. */
export function sortQuotes(quotes: ShippingQuote[]): ShippingQuote[] {
  const rank: Record<QuoteAccuracy, number> = { exact_now: 0, estimated: 1, from_price: 2 };
  return [...quotes].sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    if (!a.available) return a.carrier.localeCompare(b.carrier);
    const fa = a.totalFeeVnd ?? Number.MAX_SAFE_INTEGER;
    const fb = b.totalFeeVnd ?? Number.MAX_SAFE_INTEGER;
    if (a.carrier === b.carrier && a.serviceCode === b.serviceCode && rank[a.accuracy] !== rank[b.accuracy]) return rank[a.accuracy] - rank[b.accuracy];
    if (fa !== fb) return fa - fb;
    return rank[a.accuracy] - rank[b.accuracy];
  });
}

/** Fee text for a card: "22.000đ", "Từ 6.500đ" or "—". */
export function formatQuoteFee(q: Pick<ShippingQuote, "totalFeeVnd" | "accuracy" | "available">, fmt: (n: number) => string = (n) => n.toLocaleString("vi-VN")): string {
  if (!q.available || q.totalFeeVnd === null) return "—";
  return `${q.accuracy === "from_price" ? "Từ " : ""}${fmt(q.totalFeeVnd)}đ`;
}

/** A "Từ …" quote is never the amount the shop collects for shipping (spec §9.5). */
export function usableForCheckoutTotal(q: Pick<ShippingQuote, "accuracy" | "available" | "totalFeeVnd">): boolean {
  return q.available && q.totalFeeVnd !== null && q.accuracy !== "from_price";
}
