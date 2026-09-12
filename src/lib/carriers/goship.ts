import "server-only";
import { getDb, getSetting } from "@/lib/sqlite";
import { legacyProvincesOf } from "@/lib/vn-address";
import { type GoshipAddressMatch, type GoshipCity, type GoshipDistrict, type GoshipRate, type GoshipWard, goshipRateToQuote, matchGoshipAddress } from "./goship-pure";
import { type CarrierQuoteAdapter, type ShippingQuote, type ShippingQuoteRequest, unavailableQuote } from "./types";

/**
 * Goship adapter — one call to https://api.goship.io/api/v2/rates returns the live fee of every carrier Goship has a
 * contract with (Viettel Post, VNPost, EMS, GHTK, GHN, SPX, J&T, Best…). Token = "Access Token" from shop.goship.io ›
 * Cài đặt › Kết nối API, stored server-side (settings) with env `GOSHIP_TOKEN` as fallback. Docs: https://doc.goship.io
 */
export const GOSHIP_SETTING_KEYS = { token: "goship_token", base: "goship_base", fromCity: "goship_from_city", fromDistrict: "goship_from_district" } as const;
export const GOSHIP_PROD = "https://api.goship.io/api/v2";
export const GOSHIP_SANDBOX = "https://sandbox.goship.io/api/v2";

function setting(key: string): string {
  try {
    return (getSetting(getDb(), key) ?? "").trim();
  } catch {
    return "";
  }
}

export function goshipCredentials(): { token: string; base: string; fromCity: string; fromDistrict: string } {
  const base = setting(GOSHIP_SETTING_KEYS.base) || process.env.GOSHIP_BASE?.trim() || GOSHIP_PROD;
  return {
    token: setting(GOSHIP_SETTING_KEYS.token) || process.env.GOSHIP_TOKEN?.trim() || "",
    base: base === GOSHIP_SANDBOX ? GOSHIP_SANDBOX : GOSHIP_PROD,
    fromCity: setting(GOSHIP_SETTING_KEYS.fromCity) || process.env.GOSHIP_FROM_CITY?.trim() || "",
    fromDistrict: setting(GOSHIP_SETTING_KEYS.fromDistrict) || process.env.GOSHIP_FROM_DISTRICT?.trim() || "",
  };
}

export function goshipConfigured(): boolean {
  const c = goshipCredentials();
  return !!c.token && !!c.fromCity && !!c.fromDistrict;
}

export class GoshipError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GoshipError";
  }
}

// ---------------------------------------------------------------- transport + cache

const cache = new Map<string, { until: number; value: unknown }>();
const DAY = 24 * 60 * 60 * 1000;
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value as T;
  const value = await load();
  cache.set(key, { until: Date.now() + ttl, value });
  return value;
}
export function goshipResetCache(): void {
  cache.clear();
}

async function call<T>(path: string, init: RequestInit & { token?: string; base?: string } = {}): Promise<T> {
  const c = goshipCredentials();
  const token = init.token ?? c.token;
  const base = init.base ?? c.base;
  if (!token) throw new GoshipError("Chưa có token Goship.", 401);
  const res = await fetch(`${base}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  let body: { code?: number; status?: string; data?: unknown; message?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new GoshipError("Goship trả về dữ liệu không hợp lệ.", 502);
  }
  if (res.status === 401 || body.code === 401) throw new GoshipError("Token Goship không hợp lệ hoặc đã bị thu hồi.", 401);
  if (res.status === 429) throw new GoshipError("Goship giới hạn tần suất (300 request/phút) — thử lại sau.", 429);
  if (!res.ok || (body.code && body.code >= 400)) {
    console.warn(`[goship] ${path} → ${res.status} ${JSON.stringify(body.data ?? body.message ?? "").slice(0, 300)}`);
    throw new GoshipError(res.status === 422 ? "Goship từ chối dữ liệu kiện/địa chỉ (422)." : "Goship không phản hồi.", res.status || 502);
  }
  return body.data as T;
}

// ---------------------------------------------------------------- address book (old 3-level model)

export async function goshipCities(opts: { token?: string; base?: string } = {}): Promise<GoshipCity[]> {
  return cached(`cities:${opts.base ?? ""}`, DAY, () => call<GoshipCity[]>("/cities", opts));
}
export async function goshipDistricts(cityId: string, opts: { token?: string; base?: string } = {}): Promise<GoshipDistrict[]> {
  return cached(`districts:${cityId}`, DAY, () => call<GoshipDistrict[]>(`/cities/${encodeURIComponent(cityId)}/districts`, opts));
}
export async function goshipWards(districtId: string, opts: { token?: string; base?: string } = {}): Promise<GoshipWard[]> {
  return cached(`wards:${districtId}`, DAY, () => call<GoshipWard[]>(`/districts/${encodeURIComponent(districtId)}/wards`, opts));
}

/** New-model (province code, ward name) → Goship city/district, cached a day per pair. */
export async function resolveGoshipAddress(provinceCode: string, wardName: string, opts: { token?: string; base?: string } = {}): Promise<GoshipAddressMatch | null> {
  const legacy = legacyProvincesOf(provinceCode);
  if (!legacy.length) return null;
  return cached(`addr:${provinceCode}:${wardName}`, DAY, async () =>
    matchGoshipAddress(
      await goshipCities(opts),
      (cityId) => goshipDistricts(cityId, opts),
      (districtId) => goshipWards(districtId, opts),
      legacy,
      wardName,
    ),
  );
}

// ---------------------------------------------------------------- rates

export interface GoshipRateInput {
  from: { city: string; district: string };
  to: { city: string; district: string };
  parcel: { cod: number; amount: number; width: number; height: number; length: number; weight: number };
}

export async function goshipRates(input: GoshipRateInput, opts: { token?: string; base?: string } = {}): Promise<GoshipRate[]> {
  const rows = await call<GoshipRate[]>("/rates", {
    ...opts,
    method: "POST",
    body: JSON.stringify({
      shipment: {
        address_from: { district: input.from.district, city: input.from.city },
        address_to: { district: input.to.district, city: input.to.city },
        parcel: input.parcel,
      },
    }),
  });
  return Array.isArray(rows) ? rows : [];
}

/** Sanity check used by the admin form: token works and the warehouse district resolves. */
export async function goshipCheck(token: string, base: string): Promise<{ cities: number; origin: GoshipAddressMatch | null }> {
  const cities = await goshipCities({ token, base });
  const origin = await matchGoshipAddress(
    cities,
    (cityId) => goshipDistricts(cityId, { token, base }),
    (districtId) => goshipWards(districtId, { token, base }),
    ["Thanh Hóa"],
    "Xã Hoằng Hóa",
  );
  return { cities: cities.length, origin };
}

export const goshipAdapter: CarrierQuoteAdapter = {
  carrier: "GOSHIP",
  configured: goshipConfigured,
  async quote(req: ShippingQuoteRequest): Promise<ShippingQuote[]> {
    if (!goshipConfigured()) return [unavailableQuote("GOSHIP", "not_configured", "Goship chưa kết nối (chờ Access Token của shop)")];
    const c = goshipCredentials();
    try {
      const to = await resolveGoshipAddress(req.destination.provinceCode, req.destination.wardName);
      if (!to) return [unavailableQuote("GOSHIP", "unsupported", "Goship không có mã cho xã/phường này")];
      const rows = await goshipRates({
        from: { city: c.fromCity, district: c.fromDistrict },
        to: { city: to.city.id, district: to.district.id },
        parcel: {
          cod: req.paymentMethod === "cod" ? Math.max(0, Math.round(req.parcel.codAmountVnd)) : 0,
          amount: Math.max(0, Math.round(req.parcel.declaredValueVnd)),
          width: Math.max(1, Math.ceil(req.parcel.widthCm)),
          height: Math.max(1, Math.ceil(req.parcel.heightCm)),
          length: Math.max(1, Math.ceil(req.parcel.lengthCm)),
          weight: Math.max(1, Math.round(req.parcel.actualWeightG)),
        },
      });
      if (!rows.length) return [unavailableQuote("GOSHIP", "unsupported", "Không hãng nào trên Goship phục vụ tuyến này")];
      const now = new Date();
      const routeNote = to.how === "ward" ? undefined : `Địa chỉ ánh xạ theo ${to.how === "district" ? "quận/huyện cũ cùng tên" : "quận/huyện đầu của tỉnh"} (${to.district.name}, ${to.city.name}).`;
      return rows.map((r) => {
        const q = goshipRateToQuote(r, req, now);
        if (routeNote) q.warnings.push(routeNote);
        return q;
      });
    } catch (e) {
      const err = e instanceof GoshipError ? e : null;
      if (err?.status === 401) return [unavailableQuote("GOSHIP", "not_configured", "Token Goship không hợp lệ — shop kiểm tra lại")];
      return [unavailableQuote("GOSHIP", "error", "Tạm chưa lấy được cước qua Goship — thử lại", { warnings: err ? [err.message] : [] })];
    }
  },
};
