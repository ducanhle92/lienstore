/**
 * Vietnam administrative divisions after the 01/07/2025 re-organisation: 34 provinces / cities → wards (no districts).
 * Data: src/data/vn-address.json (provinces.open-api.vn v2). Legacy provinces (before the merger) are kept here so
 * VNPost's "Nội tỉnh 1 / Nội tỉnh 2" rule can be evaluated. Pure module — no DB, usable in tests and the browser.
 */
import data from "@/data/vn-address.json";

export interface VnProvince {
  code: string;
  name: string;
  type: "city" | "province";
}
export interface VnWard {
  code: string;
  name: string;
  provinceCode: string;
}

const RAW = data as unknown as { version: string; provinces: VnProvince[]; wards: Array<[string, string, string]> };

export const VN_ADDRESS_VERSION = RAW.version;
export const VN_PROVINCES: VnProvince[] = RAW.provinces;
const WARDS: VnWard[] = RAW.wards.map(([code, name, provinceCode]) => ({ code, name, provinceCode }));
const WARD_BY_CODE = new Map(WARDS.map((w) => [w.code, w]));
const PROVINCE_BY_CODE = new Map(VN_PROVINCES.map((p) => [p.code, p]));

export function findProvince(code: string): VnProvince | undefined {
  return PROVINCE_BY_CODE.get(String(code));
}
export function findWard(code: string): VnWard | undefined {
  return WARD_BY_CODE.get(String(code));
}
export function wardsOf(provinceCode: string): VnWard[] {
  return WARDS.filter((w) => w.provinceCode === String(provinceCode));
}

export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/^(tinh|thanh pho|tp\.?)\s+/, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Province by (possibly prefixed / unaccented) name — "Tỉnh Thanh Hóa", "thanh hoa", "TP Hồ Chí Minh". */
export function findProvinceByName(name: string): VnProvince | undefined {
  const key = fold(name);
  if (!key) return undefined;
  return VN_PROVINCES.find((p) => fold(p.name) === key) ?? VN_PROVINCES.find((p) => key.endsWith(fold(p.name)));
}

/** Ward by name inside a province ("Phường Hạc Thành" / "Hạc Thành"). */
export function findWardByName(provinceCode: string, name: string): VnWard | undefined {
  const strip = (s: string) => fold(s).replace(/^(phuong|xa|dac khu)\s+/, "");
  const key = strip(name);
  return wardsOf(provinceCode).find((w) => strip(w.name) === key);
}

// ---------------------------------------------------------------------------------------------------------------------
// Legacy provinces (63 → 34). Keys are the current province names; values the pre-merger provinces it absorbed.
// A province absent from this table was not merged (Nội tỉnh 1 everywhere inside it).

export const MERGED_PROVINCES: Record<string, string[]> = {
  "Tuyên Quang": ["Tuyên Quang", "Hà Giang"],
  "Lào Cai": ["Lào Cai", "Yên Bái"],
  "Thái Nguyên": ["Thái Nguyên", "Bắc Kạn"],
  "Phú Thọ": ["Phú Thọ", "Vĩnh Phúc", "Hòa Bình"],
  "Bắc Ninh": ["Bắc Ninh", "Bắc Giang"],
  "Hưng Yên": ["Hưng Yên", "Thái Bình"],
  "Hải Phòng": ["Hải Phòng", "Hải Dương"],
  "Ninh Bình": ["Ninh Bình", "Hà Nam", "Nam Định"],
  "Quảng Trị": ["Quảng Trị", "Quảng Bình"],
  "Đà Nẵng": ["Đà Nẵng", "Quảng Nam"],
  "Quảng Ngãi": ["Quảng Ngãi", "Kon Tum"],
  "Gia Lai": ["Gia Lai", "Bình Định"],
  "Khánh Hòa": ["Khánh Hòa", "Ninh Thuận"],
  "Lâm Đồng": ["Lâm Đồng", "Đắk Nông", "Bình Thuận"],
  "Đắk Lắk": ["Đắk Lắk", "Phú Yên"],
  "Hồ Chí Minh": ["Hồ Chí Minh", "Bình Dương", "Bà Rịa - Vũng Tàu"],
  "Đồng Nai": ["Đồng Nai", "Bình Phước"],
  "Tây Ninh": ["Tây Ninh", "Long An"],
  "Cần Thơ": ["Cần Thơ", "Sóc Trăng", "Hậu Giang"],
  "Vĩnh Long": ["Vĩnh Long", "Bến Tre", "Trà Vinh"],
  "Đồng Tháp": ["Đồng Tháp", "Tiền Giang"],
  "Cà Mau": ["Cà Mau", "Bạc Liêu"],
  "An Giang": ["An Giang", "Kiên Giang"],
};

export function isMergedProvince(provinceCode: string): boolean {
  const p = findProvince(provinceCode);
  return !!p && p.name in MERGED_PROVINCES;
}

/** Legacy province names a current province contains (itself when it was not merged). */
export function legacyProvincesOf(provinceCode: string): string[] {
  const p = findProvince(provinceCode);
  if (!p) return [];
  return MERGED_PROVINCES[p.name] ?? [p.name];
}

/** Legacy province code = folded legacy name (stable, human-readable: "ha giang"). */
export const legacyCode = (legacyName: string) => fold(legacyName);

// ---------------------------------------------------------------------------------------------------------------------
// Shop coarse regions (kept for the free-shipping policy thresholds: Thanh Hóa / Bắc / Trung / Nam).

export type CoarseRegion = "thanh_hoa" | "north" | "central" | "south";
const NORTH = ["Hà Nội", "Cao Bằng", "Tuyên Quang", "Điện Biên", "Lai Châu", "Sơn La", "Lào Cai", "Thái Nguyên", "Lạng Sơn", "Quảng Ninh", "Bắc Ninh", "Phú Thọ", "Hải Phòng", "Hưng Yên", "Ninh Bình", "Nghệ An", "Hà Tĩnh"];
const CENTRAL = ["Quảng Trị", "Huế", "Đà Nẵng", "Quảng Ngãi", "Gia Lai", "Khánh Hòa", "Đắk Lắk", "Lâm Đồng"];
export function coarseRegionOf(provinceCode: string): CoarseRegion | null {
  const p = findProvince(provinceCode);
  if (!p) return null;
  if (p.name === "Thanh Hóa") return "thanh_hoa";
  if (NORTH.includes(p.name)) return "north";
  if (CENTRAL.includes(p.name)) return "central";
  return "south";
}

/**
 * Free-text address ("Số 5 Lê Lợi, Phường Hạc Thành, Thanh Hóa") → province / ward codes + street, for addresses saved
 * before the 2-level form existed. Null when the last two comma parts are not a known ward + province.
 */
export function parseAddressToCodes(text: string | null | undefined): { provinceCode: string; wardCode: string; street: string; provinceName: string; wardName: string } | null {
  if (!text) return null;
  const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const province = findProvinceByName(parts[parts.length - 1].replace(/^(tp\.?|thành phố|tỉnh)\s+/i, ""));
  if (!province) return null;
  const ward = findWardByName(province.code, parts[parts.length - 2]);
  if (!ward) return null;
  return { provinceCode: province.code, wardCode: ward.code, street: parts.slice(0, -2).join(", "), provinceName: province.name, wardName: ward.name };
}

/** "Số 5 Lê Lợi" + ward + province → the line the courier reads. */
export function composeAddress(street: string, ward: VnWard | undefined, province: VnProvince | undefined): string {
  return [street.trim(), ward?.name, province ? (province.type === "city" && !/^Hồ Chí Minh|^Hà Nội/.test(province.name) ? `TP ${province.name}` : province.name) : ""].filter(Boolean).join(", ");
}
