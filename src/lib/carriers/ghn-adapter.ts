/**
 * GHN adapter — wraps the existing live client (src/lib/ghn.ts). `data.total` from the fee API is the number shown and
 * charged; nothing is added on top (fuel, COD, insurance are already inside GHN's answer). GHN still keys addresses by
 * district + ward, so the 2-level address is mapped to GHN ids by name through GHN's own master data (cached a day).
 */
import { GhnApiError, ghnConfigured, ghnDistricts, ghnProvinces, ghnWards, quoteGhn, type GhnQuote } from "@/lib/ghn";
import { fold } from "@/lib/vn-address";
import { CARRIER_NAME, type CarrierQuoteAdapter, type FeePart, type ShippingQuote, type ShippingQuoteRequest, unavailableQuote } from "./types";

const codeCache = new Map<string, { until: number; value: { districtId: number; wardCode: string } | null }>();

/** GHN district id + ward code for a (province, ward) pair of the new model; null when GHN has no matching ward name. */
export async function resolveGhnCodes(provinceName: string, wardName: string): Promise<{ districtId: number; wardCode: string } | null> {
  const key = `${fold(provinceName)}|${fold(wardName)}`;
  const hit = codeCache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const strip = (s: string) => fold(s).replace(/^(phuong|xa|dac khu|thi tran)\s+/, "");
  const provinces = await ghnProvinces();
  const p = provinces.find((x) => fold(x.name) === fold(provinceName)) ?? provinces.find((x) => fold(x.name).includes(fold(provinceName)));
  let value: { districtId: number; wardCode: string } | null = null;
  if (p) {
    const districts = await ghnDistricts(p.id);
    const stripD = (s: string) => fold(s).replace(/^(quan|huyen|thi xa|thanh pho)\s+/, "");
    // 1) a GHN ward with the same name (most old wards survive in the new model)
    for (const d of districts) {
      const wards = await ghnWards(d.id);
      const w = wards.find((x) => strip(x.name) === strip(wardName));
      if (w) {
        value = { districtId: d.id, wardCode: w.code };
        break;
      }
    }
    // 2) merged communes often carry the old district's name ("Xã Hoằng Hóa" ← "Huyện Hoằng Hóa"): first ward of that district
    if (!value) {
      const d = districts.find((x) => stripD(x.name) === strip(wardName));
      if (d) {
        const wards = await ghnWards(d.id);
        if (wards[0]) value = { districtId: d.id, wardCode: wards[0].code };
      }
    }
  }
  codeCache.set(key, { until: Date.now() + 24 * 60 * 60 * 1000, value });
  return value;
}

/** GHN's volumetric rule (L×W×H / 5000, integer cm rounded up) — shown to the customer; the API stays the decision. */
export function ghnVolumetricWeightG(lengthCm: number, widthCm: number, heightCm: number): number {
  return Math.round(((Math.ceil(lengthCm) * Math.ceil(widthCm) * Math.ceil(heightCm)) / 5000) * 1000);
}

export function ghnQuoteToShippingQuote(q: GhnQuote, req: ShippingQuoteRequest): ShippingQuote {
  const parts: FeePart[] = [
    { code: "service_fee", label: "Cước dịch vụ", amountVnd: q.fee.shipping },
    { code: "insurance_fee", label: "Phí khai giá / bảo hiểm", amountVnd: q.fee.insurance },
    { code: "cod_fee", label: "Phí thu hộ COD", amountVnd: q.fee.cod },
    { code: "pick_remote_areas_fee", label: "Phụ phí vùng xa (lấy hàng)", amountVnd: q.fee.pickupRemoteArea },
    { code: "deliver_remote_areas_fee", label: "Phụ phí vùng xa (giao hàng)", amountVnd: q.fee.deliveryRemoteArea },
    { code: "coupon_value", label: "Mã giảm GHN", amountVnd: q.fee.coupon ? -Math.abs(q.fee.coupon) : 0 },
  ];
  const vol = ghnVolumetricWeightG(req.parcel.lengthCm, req.parcel.widthCm, req.parcel.heightCm);
  return {
    carrier: "GHN",
    carrierName: CARRIER_NAME.GHN,
    serviceCode: String(q.service.id ?? q.service.typeId),
    serviceName: q.service.name,
    available: true,
    status: "available",
    statusText: "Cước hiện tại từ GHN",
    source: "live_api",
    accuracy: "exact_now",
    totalFeeVnd: q.fee.total,
    baseFeeVnd: q.fee.shipping,
    feeParts: parts,
    billableWeightG: Math.max(req.parcel.actualWeightG, vol),
    volumetricWeightG: vol,
    routeLabel: q.service.name,
    etaText: q.expectedDelivery ? `giao ${new Date(q.expectedDelivery).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "2-digit", month: "2-digit" })} (theo GHN)` : undefined,
    quotedAt: q.quotedAt,
    expiresAt: q.expiresAt,
    warnings: [],
    providerReference: undefined,
    includes: ["Phụ phí xăng dầu, VAT theo chính sách GHN", ...(q.fee.cod ? ["COD"] : [])],
    codShipFee: true,
  };
}

export const ghnAdapter: CarrierQuoteAdapter = {
  carrier: "GHN",
  configured: ghnConfigured,
  async quote(req) {
    if (!ghnConfigured()) return [unavailableQuote("GHN", "not_configured", "GHN chưa kết nối (chờ token của shop)", { serviceName: "Giao hàng tiêu chuẩn" })];
    try {
      const codes = req.destination.carrierCodes?.ghn?.districtId && req.destination.carrierCodes.ghn.wardCode ? { districtId: req.destination.carrierCodes.ghn.districtId, wardCode: req.destination.carrierCodes.ghn.wardCode } : await resolveGhnCodes(req.destination.provinceName, req.destination.wardName);
      if (!codes) return [unavailableQuote("GHN", "unsupported", "GHN không có mã cho xã/phường này", { serviceName: "Giao hàng tiêu chuẩn" })];
      const q = await quoteGhn({
        toDistrictId: codes.districtId,
        toWardCode: codes.wardCode,
        weight: Math.max(1, Math.round(req.parcel.actualWeightG)),
        length: Math.max(1, Math.ceil(req.parcel.lengthCm)),
        width: Math.max(1, Math.ceil(req.parcel.widthCm)),
        height: Math.max(1, Math.ceil(req.parcel.heightCm)),
        insuranceValue: Math.max(0, Math.round(req.parcel.declaredValueVnd)),
        codValue: req.paymentMethod === "cod" ? Math.max(0, Math.round(req.parcel.codAmountVnd)) : 0,
      });
      return [ghnQuoteToShippingQuote(q, req)];
    } catch (e) {
      const err = e instanceof GhnApiError ? e : null;
      if (err?.code === "GHN_ROUTE_NOT_SUPPORTED") return [unavailableQuote("GHN", "unsupported", "GHN không hỗ trợ tuyến hoặc kiện hàng này", { serviceName: "Giao hàng tiêu chuẩn" })];
      if (err?.code === "GHN_CONFIGURATION_ERROR") return [unavailableQuote("GHN", "not_configured", "Tài khoản GHN chưa đúng — shop kiểm tra lại", { serviceName: "Giao hàng tiêu chuẩn" })];
      return [unavailableQuote("GHN", "error", "Tạm chưa lấy được cước GHN — thử lại", { serviceName: "Giao hàng tiêu chuẩn" })];
    }
  },
};
