/**
 * Viettel Post — partner API v2. Verified 17/09/2026 against partner.viettelpost.vn: the pricing endpoints
 * (order/getPriceAll, order/getPrice) and the categories are PUBLIC — they answer identically with, without or with a
 * bogus Token header — so quotes need no token at all. There is deliberately no static fallback table (spec §6).
 *
 * Token (optional): settings table first (Admin › Vận chuyển › ④ › "Kết nối Viettel Post": token from viettelpost.vn ›
 * Quản lý token), then env VTP_TOKEN. It is only needed for account endpoints (user/listInventory, creating waybills);
 * the portal token the owner generated is currently rejected there ("Account have logged in on another machine!"), so
 * the card saves it but reports that status honestly. Optional VTP_API_BASE (default https://partner.viettelpost.vn/v2)
 * and the Viettel ids of the sending warehouse (settings vtp_sender_province/district, env VTP_SENDER_PROVINCE/DISTRICT;
 * resolved from the shop address by name when blank). Addresses use Viettel's own 3-level categories
 * (listProvince / listDistrict / listWards) matched by name from the new province → ward model, like Goship.
 */
import { openSecret } from "@/lib/secret-store";
import { getDb, getSetting } from "@/lib/sqlite";
import { fold, legacyProvincesOf } from "@/lib/vn-address";
import { CARRIER_NAME, type CarrierQuoteAdapter, type FeePart, type ShippingQuote, type ShippingQuoteRequest, unavailableQuote } from "./types";

export const VTP_SETTING_KEYS = { token: "vtp_token", senderProvince: "vtp_sender_province", senderDistrict: "vtp_sender_district" } as const;
export const VTP_DEFAULT_BASE = "https://partner.viettelpost.vn/v2";

function setting(key: string): string {
  try {
    return openSecret(getSetting(getDb(), key));
  } catch {
    return "";
  }
}

/** Raw credentials: settings table first, then env. */
export function viettelCredentials(): { token: string; base: string; senderProvince: number; senderDistrict: number } {
  const num = (s: string) => {
    const n = Number.parseInt(s, 10);
    return Number.isInteger(n) && n > 0 ? n : 0;
  };
  return {
    token: setting(VTP_SETTING_KEYS.token) || process.env.VTP_TOKEN?.trim() || "",
    base: (process.env.VTP_API_BASE?.trim() || VTP_DEFAULT_BASE).replace(/\/$/, ""),
    senderProvince: num(setting(VTP_SETTING_KEYS.senderProvince) || process.env.VTP_SENDER_PROVINCE || ""),
    senderDistrict: num(setting(VTP_SETTING_KEYS.senderDistrict) || process.env.VTP_SENDER_DISTRICT || ""),
  };
}

/** Pricing is public, so Viettel Post is always quotable (spec §6 fallback table still never used). */
export function viettelConfigured(): boolean {
  return true;
}
/** A token is stored (settings or env) — shown on the admin card; not required for quotes. */
export function viettelTokenStored(): boolean {
  return !!viettelCredentials().token;
}

export class ViettelApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ViettelApiError";
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
export function viettelResetCache(): void {
  cache.clear();
}

interface VtpEnvelope<T> {
  status?: number;
  error?: boolean;
  message?: string;
  data?: T;
}

const AUTH_MSG = "Viettel Post từ chối token: kiểm tra lại token trong Quản lý token (còn hạn, đúng tài khoản, sao chép đủ chuỗi).";
/** Viettel reports auth problems as HTTP 200 + {status:201 "Account have logged in on another machine!", 202 "No header"}. */
const isAuthStatus = (status: number | undefined, message?: string) => status === 401 || status === 403 || status === 201 || status === 202 || /logged in|no header|token|unauthor/i.test(message ?? "");

/**
 * One call to the partner API. The Token header is sent when a token exists (pricing/categories work without it);
 * auth failures come both as HTTP 401/403 and as 200 + {error:true,status:201/202}.
 */
async function call<T>(path: string, init: RequestInit & { token?: string; base?: string; requireToken?: boolean } = {}): Promise<T> {
  const c = viettelCredentials();
  const token = init.token ?? c.token;
  const base = init.base ?? c.base;
  if (!token && init.requireToken) throw new ViettelApiError("Chưa có token Viettel Post.", 401);
  const res = await fetch(`${base}${path}`, {
    ...init,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Token: token } : {}), ...(init.headers ?? {}) },
  });
  if (res.status === 401 || res.status === 403) throw new ViettelApiError(AUTH_MSG, 401);
  if (!res.ok) throw new ViettelApiError(`Viettel Post trả về HTTP ${res.status}.`, res.status);
  const body = (await res.json()) as VtpEnvelope<T> | T;
  if (body && typeof body === "object" && !Array.isArray(body) && ("error" in body || "status" in body)) {
    const env = body as VtpEnvelope<T>;
    if (env.error || (env.status && env.status >= 400)) {
      const st = env.status ?? 400;
      if (isAuthStatus(st, env.message)) throw new ViettelApiError(AUTH_MSG, 401);
      throw new ViettelApiError(env.message || `Viettel Post báo lỗi ${st}.`, st);
    }
    if (env.data !== undefined) return env.data;
  }
  return body as T;
}

// ---------------------------------------------------------------- categories (Viettel's own 63-province / district / ward ids)

export interface VtpProvince {
  PROVINCE_ID: number;
  PROVINCE_CODE?: string;
  PROVINCE_NAME: string;
}
export interface VtpDistrict {
  DISTRICT_ID: number;
  DISTRICT_VALUE?: string;
  DISTRICT_NAME: string;
  PROVINCE_ID: number;
}
export interface VtpWard {
  WARDS_ID: number;
  WARDS_NAME: string;
  DISTRICT_ID: number;
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export async function vtpProvinces(opts: { token?: string; base?: string } = {}): Promise<VtpProvince[]> {
  return cached("provinces", DAY, async () => arr<VtpProvince>(await call<unknown>("/categories/listProvince", opts)));
}
export async function vtpDistricts(provinceId: number, opts: { token?: string; base?: string } = {}): Promise<VtpDistrict[]> {
  return cached(`districts:${provinceId}`, DAY, async () => arr<VtpDistrict>(await call<unknown>(`/categories/listDistrict?provinceId=${provinceId}`, opts)));
}
export async function vtpWards(districtId: number, opts: { token?: string; base?: string } = {}): Promise<VtpWard[]> {
  return cached(`wards:${districtId}`, DAY, async () => {
    try {
      return arr<VtpWard>(await call<unknown>(`/categories/listWards?districtId=${districtId}`, opts));
    } catch (e) {
      if (e instanceof ViettelApiError && (e.status === 401 || e.status === 403)) throw e;
      return [];
    }
  });
}

const strip = (s: string) => fold(s).replace(/^(phuong|xa|thi tran|dac khu|quan|huyen|thi xa|thanh pho|tp)\s+/, "");
const stripDistrict = (s: string) => fold(s).replace(/^(quan|huyen|thi xa|thanh pho|tp)\s+/, "");

export interface VtpAddressMatch {
  province: VtpProvince;
  district: VtpDistrict;
  ward?: VtpWard;
  how: "ward" | "district" | "first_district";
}

/** Viettel provinces named like any of the legacy (pre-merger) provinces of a current province. */
export function matchVtpProvinces(provinces: VtpProvince[], legacyNames: string[]): VtpProvince[] {
  const keys = legacyNames.map(fold);
  return provinces.filter((p) => {
    const k = fold(p.PROVINCE_NAME);
    return keys.some((x) => x === k || k.endsWith(x) || x.endsWith(k));
  });
}

/** Pure matcher (tests): legacy province names + new ward name → Viettel province/district(/ward). */
export async function matchVtpAddress(
  provinces: VtpProvince[],
  districtsOf: (provinceId: number) => Promise<VtpDistrict[]>,
  wardsOf: (districtId: number) => Promise<VtpWard[]>,
  legacyProvinceNames: string[],
  wardName: string,
): Promise<VtpAddressMatch | null> {
  const candidates = matchVtpProvinces(provinces, legacyProvinceNames);
  if (!candidates.length) return null;
  const want = strip(wardName);
  const all: Array<{ province: VtpProvince; districts: VtpDistrict[] }> = [];
  for (const province of candidates) all.push({ province, districts: await districtsOf(province.PROVINCE_ID) });
  // district named like the commune (new communes often keep the old district's name)
  for (const { province, districts } of all) {
    const d = districts.find((x) => stripDistrict(x.DISTRICT_NAME) === want);
    if (d) {
      const w = (await wardsOf(d.DISTRICT_ID)).find((x) => strip(x.WARDS_NAME) === want);
      return { province, district: d, ward: w, how: w ? "ward" : "district" };
    }
  }
  // a ward with that name anywhere in the candidate provinces
  for (const { province, districts } of all) {
    for (const d of districts) {
      const w = (await wardsOf(d.DISTRICT_ID)).find((x) => strip(x.WARDS_NAME) === want);
      if (w) return { province, district: d, ward: w, how: "ward" };
    }
  }
  if (all.length === 1 && all[0].districts[0]) return { province: all[0].province, district: all[0].districts[0], how: "first_district" };
  return null;
}

/** New-model (province code, ward name) → Viettel ids, cached a day per pair. */
export async function resolveVtpAddress(provinceCode: string, wardName: string, opts: { token?: string; base?: string } = {}): Promise<VtpAddressMatch | null> {
  const legacy = legacyProvincesOf(provinceCode);
  if (!legacy.length) return null;
  return cached(`addr:${provinceCode}:${wardName}`, DAY, async () =>
    matchVtpAddress(
      await vtpProvinces(opts),
      (id) => vtpDistricts(id, opts),
      (id) => vtpWards(id, opts),
      legacy,
      wardName,
    ),
  );
}

/** Pick-up warehouses registered on the Viettel account (token-protected: also the token check). */
export interface VtpInventory {
  groupaddressId?: number;
  cusId?: number;
  name?: string;
  phone?: string;
  address?: string;
  provinceId?: number;
  districtId?: number;
  wardsId?: number;
}
export async function vtpInventories(opts: { token?: string; base?: string } = {}): Promise<VtpInventory[]> {
  return arr<VtpInventory>(await call<unknown>("/user/listInventory", { ...opts, requireToken: true }));
}

export interface ViettelCheckResult {
  provinces: number;
  origin: VtpAddressMatch | null;
  sender: { provinceId: number; districtId: number; label: string } | null;
  /** getPriceAll rows for the test route shop → Hà Nội (proves public pricing works from the resolved sender). */
  priced: number;
  /** Token status on the account endpoint (listInventory): null = no token given. */
  token: { accepted: boolean; message: string; inventories: VtpInventory[] } | null;
}

/**
 * Settings card "Lưu & kiểm tra": resolve the shop warehouse to Viettel ids, prove getPriceAll answers for it (public),
 * and — when a token was given — report whether the account endpoint accepts it. Nothing here blocks saving.
 */
export async function viettelCheck(token: string, from: { legacyProvinceNames: string[]; wardName: string }): Promise<ViettelCheckResult> {
  const base = viettelCredentials().base;
  const opts = { token: token || undefined, base };
  const provinces = await vtpProvinces(opts);
  if (!provinces.length) throw new ViettelApiError("Viettel Post không trả về danh mục tỉnh — API đổi định dạng, thử lại sau.", 502);
  const origin = await matchVtpAddress(
    provinces,
    (id) => vtpDistricts(id, opts),
    (id) => vtpWards(id, opts),
    from.legacyProvinceNames,
    from.wardName,
  );
  let tokenStatus: ViettelCheckResult["token"] = null;
  if (token) {
    try {
      const inventories = await vtpInventories(opts);
      tokenStatus = { accepted: true, message: `Viettel nhận token (${inventories.length} kho lấy hàng đăng ký).`, inventories };
    } catch (e) {
      tokenStatus = { accepted: false, message: e instanceof ViettelApiError ? e.message : "Không gọi được API tài khoản Viettel.", inventories: [] };
    }
  }
  const inv = tokenStatus?.inventories.find((i) => Number(i.provinceId) > 0 && Number(i.districtId) > 0);
  const sender = inv
    ? { provinceId: Number(inv.provinceId), districtId: Number(inv.districtId), label: `kho đăng ký trên Viettel “${inv.name || inv.address || "kho"}”` }
    : origin
      ? { provinceId: origin.province.PROVINCE_ID, districtId: origin.district.DISTRICT_ID, label: `${origin.district.DISTRICT_NAME}, ${origin.province.PROVINCE_NAME} (tra theo địa chỉ kho)` }
      : null;
  let priced = 0;
  if (sender) {
    const hn = matchVtpProvinces(provinces, ["Hà Nội"])[0];
    const hnDistrict = hn ? (await vtpDistricts(hn.PROVINCE_ID, opts))[0] : undefined;
    if (hn && hnDistrict) {
      try {
        const rows = await call<unknown>("/order/getPriceAll", {
          ...opts,
          method: "POST",
          body: JSON.stringify({ SENDER_PROVINCE: sender.provinceId, SENDER_DISTRICT: sender.districtId, RECEIVER_PROVINCE: hn.PROVINCE_ID, RECEIVER_DISTRICT: hnDistrict.DISTRICT_ID, PRODUCT_TYPE: "HH", PRODUCT_WEIGHT: 500, PRODUCT_PRICE: 300000, MONEY_COLLECTION: 0, TYPE: 1 }),
        });
        priced = arr<VtpPriceRow>(rows).filter((r) => Number(r.GIA_CUOC) > 0).length;
      } catch {
        priced = 0;
      }
    }
  }
  return { provinces: provinces.length, origin, sender, priced, token: tokenStatus };
}

// ---------------------------------------------------------------- quotes

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

const etaHours = (q: ShippingQuote): number => {
  const m = q.etaText?.match(/(\d+)\s*(giờ|h)/i);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
};

/**
 * getPriceAll lists ~8 services (VTK/STK/VCN/SCN/SHT plus the "thỏa thuận" and COD twins at the same price). Customers
 * get at most three cards: the two cheapest distinct (fee, ETA) pairs plus the fastest one when it is different.
 */
export function pickViettelServices(quotes: ShippingQuote[]): ShippingQuote[] {
  const seen = new Set<string>();
  const distinct = [...quotes]
    .sort((a, b) => (a.totalFeeVnd ?? 0) - (b.totalFeeVnd ?? 0))
    .filter((q) => {
      const k = `${q.totalFeeVnd}|${etaHours(q)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const picked = distinct.slice(0, 2);
  const fastest = [...distinct].sort((a, b) => etaHours(a) - etaHours(b))[0];
  if (fastest && !picked.includes(fastest) && etaHours(fastest) < Math.min(...picked.map(etaHours))) picked.push(fastest);
  return picked;
}

/**
 * Sender ids: explicit request codes → the request's origin address resolved by name (leg ③ starts at the Kiến Express
 * warehouse in Hà Nội, leg ④ at the shop) → the ids saved on the settings card / env as a fallback.
 */
async function senderIds(req: ShippingQuoteRequest): Promise<{ province: number; district: number } | null> {
  const explicit = req.origin.carrierCodes?.viettelPost;
  if (explicit?.provinceId && explicit.districtId) return { province: explicit.provinceId, district: explicit.districtId };
  if (req.origin.provinceCode && req.origin.wardName) {
    const m = await resolveVtpAddress(req.origin.provinceCode, req.origin.wardName);
    if (m) return { province: m.province.PROVINCE_ID, district: m.district.DISTRICT_ID };
  }
  const c = viettelCredentials();
  return c.senderProvince && c.senderDistrict ? { province: c.senderProvince, district: c.senderDistrict } : null;
}

export const viettelAdapter: CarrierQuoteAdapter = {
  carrier: "VIETTEL_POST",
  configured: viettelConfigured,
  async quote(req) {
    try {
      const from = await senderIds(req);
      let to = req.destination.carrierCodes?.viettelPost;
      if (!to?.provinceId || !to.districtId) {
        const m = await resolveVtpAddress(req.destination.provinceCode, req.destination.wardName);
        to = m ? { provinceId: m.province.PROVINCE_ID, districtId: m.district.DISTRICT_ID, wardId: m.ward?.WARDS_ID } : undefined;
      }
      if (!from || !to?.provinceId || !to.districtId) return [viettelUnavailable("no_codes")];
      const rows = await call<unknown>("/order/getPriceAll", {
        method: "POST",
        body: JSON.stringify({
          SENDER_PROVINCE: from.province,
          SENDER_DISTRICT: from.district,
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
      const quotes = pickViettelServices(
        arr<VtpPriceRow>(rows)
          .map((r) => viettelRowToQuote(r, req))
          .filter((q): q is ShippingQuote => q !== null),
      );
      return quotes.length ? quotes : [viettelUnavailable("unsupported")];
    } catch (e) {
      if (e instanceof ViettelApiError && e.status === 401) {
        console.warn("[viettelpost] auth rejected");
        return [viettelUnavailable("error", "Tài khoản Viettel Post chưa đúng (token).")];
      }
      // status 204 "Price does not apply to this itinerary!" = no service for this route
      if (e instanceof ViettelApiError && e.status === 204) return [viettelUnavailable("unsupported")];
      return [viettelUnavailable("error")];
    }
  },
};
