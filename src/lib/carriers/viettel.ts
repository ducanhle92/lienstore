/**
 * Viettel Post — Open API (partner account) only. There is deliberately no fallback table: without a token the carrier
 * is shown as "Liên hệ / tra cước Viettel Post" and cannot be selected (spec §6).
 *
 * Env (server only): VTP_TOKEN (partner token), optional VTP_API_BASE (default https://partner.viettelpost.vn/v2),
 * VTP_SENDER_PROVINCE / VTP_SENDER_DISTRICT (Viettel Post ids of the Thanh Hóa warehouse). Endpoint + schema below
 * follow the partner portal's "getPriceAll"; confirm them against the documentation of the shop's own account.
 */
import { CARRIER_NAME, type CarrierQuoteAdapter, type FeePart, type ShippingQuote, type ShippingQuoteRequest, unavailableQuote } from "./types";

export function viettelConfigured(): boolean {
  return !!process.env.VTP_TOKEN?.trim();
}

interface VtpPriceRow {
  MA_DV_CHINH?: string;
  TEN_DICHVU?: string;
  GIA_CUOC?: number;
  THOI_GIAN?: string;
  EXCHANGE_WEIGHT?: number;
}

const NOT_CONFIGURED = "Liên hệ / tra cước Viettel Post";

export function viettelUnavailable(reason: "not_configured" | "no_codes" | "error" | "unsupported", detail?: string): ShippingQuote {
  if (reason === "not_configured")
    return unavailableQuote("VIETTEL_POST", "not_configured", NOT_CONFIGURED, { serviceName: "Chuyển phát Viettel Post", warnings: ["Chưa kết nối Open API Viettel Post; shop không dùng bảng giá vùng cố định cho hãng này."] });
  if (reason === "no_codes") return unavailableQuote("VIETTEL_POST", "error", "Chưa ánh xạ mã địa chỉ Viettel Post cho xã/phường này", { serviceName: "Chuyển phát Viettel Post" });
  if (reason === "unsupported") return unavailableQuote("VIETTEL_POST", "unsupported", "Viettel Post không có dịch vụ cho tuyến/kiện này", { serviceName: "Chuyển phát Viettel Post" });
  return unavailableQuote("VIETTEL_POST", "error", "Tạm chưa lấy được cước Viettel Post — thử lại", { serviceName: "Chuyển phát Viettel Post", warnings: detail ? [detail] : [] });
}

/** Map one Open API row to the shared quote shape (exported for tests). */
export function viettelRowToQuote(row: VtpPriceRow, req: ShippingQuoteRequest): ShippingQuote | null {
  const fee = Number(row.GIA_CUOC);
  if (!Number.isFinite(fee) || fee <= 0 || !row.MA_DV_CHINH) return null;
  const billable = Number(row.EXCHANGE_WEIGHT) > 0 ? Number(row.EXCHANGE_WEIGHT) : req.parcel.actualWeightG;
  const parts: FeePart[] = [{ code: "total", label: "Tổng cước Viettel Post trả về (đã gồm phụ phí theo tài khoản)", amountVnd: fee }];
  const at = new Date();
  return {
    carrier: "VIETTEL_POST",
    carrierName: CARRIER_NAME.VIETTEL_POST,
    serviceCode: row.MA_DV_CHINH,
    serviceName: row.TEN_DICHVU?.trim() || row.MA_DV_CHINH,
    available: true,
    status: "available",
    statusText: "Cước hiện tại từ Viettel Post",
    source: "live_api",
    accuracy: "exact_now",
    totalFeeVnd: Math.round(fee),
    baseFeeVnd: Math.round(fee),
    feeParts: parts,
    billableWeightG: Math.round(billable),
    etaText: row.THOI_GIAN?.trim() || undefined,
    quotedAt: at.toISOString(),
    expiresAt: new Date(at.getTime() + 10 * 60 * 1000).toISOString(),
    warnings: [],
    includes: ["Phụ phí theo hợp đồng tài khoản"],
    codShipFee: true,
  };
}

export const viettelAdapter: CarrierQuoteAdapter = {
  carrier: "VIETTEL_POST",
  configured: viettelConfigured,
  async quote(req) {
    if (!viettelConfigured()) return [viettelUnavailable("not_configured")];
    const to = req.destination.carrierCodes?.viettelPost;
    const fromProvince = Number(process.env.VTP_SENDER_PROVINCE ?? req.origin.carrierCodes?.viettelPost?.provinceId);
    const fromDistrict = Number(process.env.VTP_SENDER_DISTRICT ?? req.origin.carrierCodes?.viettelPost?.districtId);
    if (!to?.provinceId || !to.districtId || !fromProvince || !fromDistrict) return [viettelUnavailable("no_codes")];
    const base = (process.env.VTP_API_BASE?.trim() || "https://partner.viettelpost.vn/v2").replace(/\/$/, "");
    try {
      const res = await fetch(`${base}/order/getPriceAll`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
        headers: { "Content-Type": "application/json", Token: process.env.VTP_TOKEN!.trim() },
        body: JSON.stringify({
          SENDER_PROVINCE: fromProvince,
          SENDER_DISTRICT: fromDistrict,
          RECEIVER_PROVINCE: to.provinceId,
          RECEIVER_DISTRICT: to.districtId,
          PRODUCT_TYPE: "HH",
          PRODUCT_WEIGHT: Math.max(1, Math.round(req.parcel.actualWeightG)),
          PRODUCT_PRICE: Math.round(req.parcel.declaredValueVnd),
          MONEY_COLLECTION: req.paymentMethod === "cod" ? Math.round(req.parcel.codAmountVnd) : 0,
          PRODUCT_LENGTH: Math.ceil(req.parcel.lengthCm),
          PRODUCT_WIDTH: Math.ceil(req.parcel.widthCm),
          PRODUCT_HEIGHT: Math.ceil(req.parcel.heightCm),
          TYPE: 1,
        }),
      });
      if (res.status === 401 || res.status === 403) {
        console.warn("[viettelpost] auth rejected");
        return [viettelUnavailable("error", "Tài khoản Viettel Post chưa đúng (token).")];
      }
      if (!res.ok) return [viettelUnavailable("error")];
      const body = (await res.json()) as VtpPriceRow[] | { data?: VtpPriceRow[] };
      const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
      const quotes = rows.map((r) => viettelRowToQuote(r, req)).filter((q): q is ShippingQuote => q !== null);
      return quotes.length ? quotes : [viettelUnavailable("unsupported")];
    } catch {
      return [viettelUnavailable("error")];
    }
  },
};
