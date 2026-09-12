/**
 * GHN (Giao Hàng Nhanh) Production client — master data + live shipping quotes for the Vietnam domestic leg.
 * Token / ShopId live only in server env; the browser talks to /api/shipping/ghn/* which calls this module.
 * Configuration is read lazily so the site keeps running (with the estimate tables) until GHN is configured.
 */

import { getDb, getSetting } from "./sqlite";

export const GHN_PRODUCTION_URL = "https://online-gateway.ghn.vn";

/** Settings keys (Admin › Vận chuyển › ④); the matching env variables are the fallback. */
export const GHN_SETTING_KEYS = { token: "ghn_token", shopId: "ghn_shop_id", pickupDistrictId: "ghn_pickup_district_id", pickupWardCode: "ghn_pickup_ward_code" } as const;

function setting(key: string): string {
  try {
    return (getSetting(getDb(), key) ?? "").trim();
  } catch {
    return "";
  }
}
/** Raw credentials: settings table first, then env. */
export function ghnCredentials(): { token: string; shopId: number; pickupDistrictId: number; pickupWardCode: string } {
  const token = setting(GHN_SETTING_KEYS.token) || process.env.GHN_TOKEN?.trim() || "";
  const shopId = Number(setting(GHN_SETTING_KEYS.shopId) || process.env.GHN_SHOP_ID || 0);
  const pickupDistrictId = Number(setting(GHN_SETTING_KEYS.pickupDistrictId) || process.env.GHN_PICKUP_DISTRICT_ID || "1748");
  const pickupWardCode = setting(GHN_SETTING_KEYS.pickupWardCode) || (process.env.GHN_PICKUP_WARD_CODE ?? "282201").trim();
  return { token, shopId: Number.isInteger(shopId) ? shopId : 0, pickupDistrictId: Number.isInteger(pickupDistrictId) ? pickupDistrictId : 0, pickupWardCode };
}

export class GhnApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "GhnApiError";
  }
}

interface GhnConfig {
  baseUrl: string;
  token: string;
  shopId: number;
  pickupDistrictId: number;
  pickupWardCode: string;
  timeoutMs: number;
}

/** True when the four required server variables are present (the checkout then offers live GHN quotes). */
export function ghnConfigured(): boolean {
  const c = ghnCredentials();
  return !!c.token && c.shopId > 0;
}

function config(): GhnConfig {
  const baseUrl = (process.env.GHN_BASE_URL?.trim() || GHN_PRODUCTION_URL).replace(/\/$/, "");
  if (baseUrl !== GHN_PRODUCTION_URL) throw new GhnApiError("GHN_BASE_URL must point to GHN Production", 500, "GHN_CONFIGURATION_ERROR");
  const { token, shopId, pickupDistrictId, pickupWardCode } = ghnCredentials();
  if (!token || !Number.isInteger(shopId) || shopId <= 0) throw new GhnApiError("GHN chưa được cấu hình (GHN_TOKEN / GHN_SHOP_ID).", 500, "GHN_CONFIGURATION_ERROR");
  if (!Number.isInteger(pickupDistrictId) || pickupDistrictId <= 0 || !pickupWardCode) throw new GhnApiError("GHN_PICKUP_DISTRICT_ID / GHN_PICKUP_WARD_CODE không hợp lệ.", 500, "GHN_CONFIGURATION_ERROR");
  const timeoutMs = Number(process.env.GHN_TIMEOUT_MS || 8000);
  return { baseUrl, token, shopId, pickupDistrictId, pickupWardCode, timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8000 };
}

// ---------------------------------------------------------------- tiny in-memory cache + request coalescing

const cache = new Map<string, { until: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = load()
    .then((value) => {
      cache.set(key, { until: Date.now() + ttlMs, value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- transport

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
  code_message?: string;
  code_message_value?: string;
}

async function request<T>(path: string, init: RequestInit = {}, retry = 1): Promise<T> {
  const cfg = config();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", Token: cfg.token, ShopId: String(cfg.shopId), ...(init.headers as Record<string, string> | undefined) },
    });
    let payload: Envelope<T> | null = null;
    try {
      payload = (await res.json()) as Envelope<T>;
    } catch {
      throw new GhnApiError("GHN trả về dữ liệu không hợp lệ.", 502, "GHN_INVALID_RESPONSE");
    }
    if (res.status === 401 || res.status === 403) throw new GhnApiError("Tài khoản GHN chưa đúng (token, ShopId hoặc IP).", 502, "GHN_CONFIGURATION_ERROR");
    if (res.status === 429) throw new GhnApiError("GHN đang giới hạn tần suất, thử lại sau.", 429, "SHIPPING_RATE_LIMITED");
    if (!res.ok || payload.code !== 200) {
      if (res.status >= 500 && retry > 0) {
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
        return request<T>(path, init, retry - 1);
      }
      // upstream wording is masked; the code is kept for the server log
      console.warn(`[ghn] ${path} → ${res.status} ${payload.code_message ?? payload.code}`);
      throw new GhnApiError("GHN không tính được phí cho tuyến này.", res.status >= 400 && res.status < 500 ? 422 : 502, res.status >= 400 && res.status < 500 ? "GHN_ROUTE_NOT_SUPPORTED" : "GHN_UNAVAILABLE");
    }
    return payload.data;
  } catch (e) {
    if (e instanceof GhnApiError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      if (retry > 0) return request<T>(path, init, retry - 1);
      throw new GhnApiError("GHN quá thời gian chờ.", 504, "GHN_TIMEOUT");
    }
    throw new GhnApiError("Không kết nối được GHN.", 502, "GHN_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- account check (admin)

export interface GhnShop {
  id: number;
  name: string;
  phone: string;
  address: string;
  districtId: number;
  wardCode: string;
}

/** Shops of a GHN account — used when the admin saves a token (no ShopId needed for this call). */
export async function ghnListShops(token: string): Promise<GhnShop[]> {
  const res = await fetch(`${GHN_PRODUCTION_URL}/shiip/public-api/v2/shop/all`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000), headers: { Accept: "application/json", "Content-Type": "application/json", Token: token }, body: JSON.stringify({ offset: 0, limit: 50 }) });
  if (res.status === 401 || res.status === 403) throw new GhnApiError("Token GHN không hợp lệ.", 401, "GHN_CONFIGURATION_ERROR");
  if (!res.ok) throw new GhnApiError("GHN không phản hồi.", 502, "GHN_UNAVAILABLE");
  const j = (await res.json()) as { code: number; data?: { shops?: Array<{ _id: number; name: string; phone: string; address: string; district_id: number; ward_code: string }> } };
  if (j.code !== 200) throw new GhnApiError("Token GHN không hợp lệ.", 401, "GHN_CONFIGURATION_ERROR");
  return (j.data?.shops ?? []).map((s) => ({ id: s._id, name: s.name, phone: s.phone, address: s.address ?? "", districtId: s.district_id ?? 0, wardCode: String(s.ward_code ?? "") }));
}

/** Drop cached master data / quotes (after credentials change). */
export function ghnResetCache(): void {
  cache.clear();
  inflight.clear();
}

// ---------------------------------------------------------------- master data (3-level address book)

export interface GhnProvince {
  id: number;
  name: string;
}
export interface GhnDistrict {
  id: number;
  name: string;
  supportType: number;
}
export interface GhnWard {
  code: string;
  name: string;
  supportType: number;
  canUpdateCod: boolean;
}

export async function ghnProvinces(): Promise<GhnProvince[]> {
  return cached("provinces", DAY, async () => {
    const rows = await request<Array<{ ProvinceID: number; ProvinceName: string }>>("/shiip/public-api/master-data/province");
    return rows.map((r) => ({ id: r.ProvinceID, name: r.ProvinceName })).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  });
}

export async function ghnDistricts(provinceId: number): Promise<GhnDistrict[]> {
  return cached(`districts:${provinceId}`, DAY, async () => {
    const rows = await request<Array<{ DistrictID: number; DistrictName: string; SupportType: number }>>(`/shiip/public-api/master-data/district?province_id=${provinceId}`);
    return (rows ?? []).map((r) => ({ id: r.DistrictID, name: r.DistrictName, supportType: r.SupportType })).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  });
}

export async function ghnWards(districtId: number): Promise<GhnWard[]> {
  return cached(`wards:${districtId}`, DAY, async () => {
    const rows = await request<Array<{ WardCode: string; WardName: string; SupportType: number; CanUpdateCOD: boolean }> | null>(`/shiip/public-api/master-data/ward?district_id=${districtId}`);
    return (rows ?? []).map((r) => ({ code: String(r.WardCode), name: r.WardName, supportType: r.SupportType, canUpdateCod: !!r.CanUpdateCOD })).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  });
}

// ---------------------------------------------------------------- services + fee

export interface GhnService {
  service_id: number;
  short_name: string;
  service_type_id: number;
}
export interface GhnFeeRaw {
  total: number;
  service_fee?: number;
  insurance_fee?: number;
  cod_fee?: number;
  pick_station_fee?: number;
  coupon_value?: number;
  r2s_fee?: number;
  pick_remote_areas_fee?: number;
  deliver_remote_areas_fee?: number;
}

export interface GhnQuoteInput {
  toDistrictId: number;
  toWardCode: string;
  /** grams */
  weight: number;
  /** cm */
  length: number;
  width: number;
  height: number;
  insuranceValue?: number;
  codValue?: number;
}

export interface GhnQuote {
  carrier: "GHN";
  currency: "VND";
  service: { id?: number; typeId: number; name: string };
  fee: { total: number; shipping: number; insurance: number; cod: number; pickupRemoteArea: number; deliveryRemoteArea: number; coupon: number };
  quotedAt: string;
  expiresAt: string;
  /** ISO time GHN expects to deliver (leadtime API), when it answered. */
  expectedDelivery?: string;
}

/** Light goods (type 2) under 20 kg, heavy goods (type 5) from 20 kg — only when the route really offers it. */
export function pickService(services: GhnService[], weightG: number): GhnService | null {
  const wanted = weightG < 20_000 ? 2 : 5;
  return services.find((s) => s.service_type_id === wanted) ?? (wanted === 2 ? services.find((s) => s.service_type_id === 5) : services.find((s) => s.service_type_id === 2)) ?? null;
}

export function normalizeFee(fee: GhnFeeRaw): GhnQuote["fee"] {
  return {
    total: fee.total,
    shipping: fee.service_fee ?? fee.total,
    insurance: fee.insurance_fee ?? 0,
    cod: fee.cod_fee ?? 0,
    pickupRemoteArea: fee.pick_remote_areas_fee ?? 0,
    deliveryRemoteArea: fee.deliver_remote_areas_fee ?? 0,
    coupon: fee.coupon_value ?? 0,
  };
}

export function validateQuoteInput(input: GhnQuoteInput): void {
  for (const [name, v] of [
    ["toDistrictId", input.toDistrictId],
    ["weight", input.weight],
    ["length", input.length],
    ["width", input.width],
    ["height", input.height],
  ] as const) {
    if (!Number.isInteger(v) || v <= 0) throw new GhnApiError(`${name} không hợp lệ`, 400, "INVALID_QUOTE_INPUT");
  }
  if (!input.toWardCode?.trim()) throw new GhnApiError("toWardCode không hợp lệ", 400, "INVALID_QUOTE_INPUT");
  for (const [name, v] of [
    ["insuranceValue", input.insuranceValue ?? 0],
    ["codValue", input.codValue ?? 0],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) throw new GhnApiError(`${name} không hợp lệ`, 400, "INVALID_QUOTE_INPUT");
  }
}

async function availableServices(toDistrictId: number): Promise<GhnService[]> {
  const cfg = config();
  return cached(`services:${cfg.shopId}:${cfg.pickupDistrictId}:${toDistrictId}`, 15 * 60 * 1000, async () => {
    const rows = await request<GhnService[] | null>("/shiip/public-api/v2/shipping-order/available-services", {
      method: "POST",
      body: JSON.stringify({ shop_id: cfg.shopId, from_district: cfg.pickupDistrictId, to_district: toDistrictId }),
    });
    return rows ?? [];
  });
}

/** Live quote from GHN Production (cached 5 minutes for identical input). */
export async function quoteGhn(input: GhnQuoteInput): Promise<GhnQuote> {
  validateQuoteInput(input);
  const cfg = config();
  const key = `quote:${JSON.stringify([cfg.shopId, input.toDistrictId, input.toWardCode, input.weight, input.length, input.width, input.height, input.insuranceValue ?? 0, input.codValue ?? 0])}`;
  return cached(key, 5 * 60 * 1000, async () => {
    const service = pickService(await availableServices(input.toDistrictId), input.weight);
    if (!service) throw new GhnApiError("GHN chưa hỗ trợ loại hàng trên tuyến này.", 422, "GHN_ROUTE_NOT_SUPPORTED");
    const fee = await request<GhnFeeRaw>("/shiip/public-api/v2/shipping-order/fee", {
      method: "POST",
      body: JSON.stringify({
        from_district_id: cfg.pickupDistrictId,
        from_ward_code: cfg.pickupWardCode,
        to_district_id: input.toDistrictId,
        to_ward_code: input.toWardCode.trim(),
        service_type_id: service.service_type_id,
        weight: input.weight,
        length: input.length,
        width: input.width,
        height: input.height,
        insurance_value: input.insuranceValue ?? 0,
        cod_value: input.codValue ?? 0,
      }),
    });
    if (!Number.isFinite(fee?.total) || fee.total <= 0) throw new GhnApiError("GHN trả về phí không hợp lệ.", 502, "GHN_INVALID_RESPONSE");
    const quotedAt = new Date();
    // ETA from GHN's own lead-time API for this route (never a fixed number of days per region); optional
    let expectedDelivery: string | undefined;
    try {
      const lt = await request<{ leadtime?: number }>("/shiip/public-api/v2/shipping-order/leadtime", {
        method: "POST",
        body: JSON.stringify({ from_district_id: cfg.pickupDistrictId, from_ward_code: cfg.pickupWardCode, to_district_id: input.toDistrictId, to_ward_code: input.toWardCode.trim(), service_id: service.service_id }),
      });
      if (lt?.leadtime && Number.isFinite(lt.leadtime)) expectedDelivery = new Date(lt.leadtime * 1000).toISOString();
    } catch {
      /* ETA is optional */
    }
    return {
      carrier: "GHN",
      currency: "VND",
      service: { id: service.service_id, typeId: service.service_type_id, name: service.short_name },
      fee: normalizeFee(fee),
      quotedAt: quotedAt.toISOString(),
      expiresAt: new Date(quotedAt.getTime() + 5 * 60 * 1000).toISOString(),
      ...(expectedDelivery ? { expectedDelivery } : {}),
    };
  });
}

// ---------------------------------------------------------------- parcel from cart lines

export interface ParcelLine {
  /** "LxWxH" cm or null */
  dims: string | null;
  quantity: number;
}

/** Conservative packing rule: items stack on their height; unknown items count as a 15×10×8 cm box. Minimum 10×10×10. */
export function packageDims(lines: ParcelLine[]): { length: number; width: number; height: number } {
  let L = 0;
  let W = 0;
  let H = 0;
  for (const line of lines) {
    const m = line.dims?.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
    const [l, w, h] = m ? [Number(m[1]), Number(m[2]), Number(m[3])].sort((a, b) => b - a) : [15, 10, 8];
    L = Math.max(L, l);
    W = Math.max(W, w);
    H += h * Math.max(1, line.quantity);
  }
  return { length: Math.max(10, Math.ceil(L)), width: Math.max(10, Math.ceil(W)), height: Math.max(10, Math.ceil(H)) };
}

// ---------------------------------------------------------------- per-IP rate limit for the public quote endpoint

const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimited(ip: string, limit = 40, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.reset < now) {
    buckets.set(ip, { count: 1, reset: now + windowMs });
    return false;
  }
  b.count += 1;
  return b.count > limit;
}
