/**
 * Which fee region a Vietnamese delivery address falls in, read from the free-text address the customer typed.
 * Regions match the zone names of the domestic carriers (Thanh Hóa · Miền Bắc · Miền Trung · Miền Nam).
 * Pure string work — used by the checkout (client) and the order action (server).
 */
export type VnRegion = "thanh_hoa" | "north" | "central" | "south";

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const NORTH = ["Hà Nội", "Hải Phòng", "Quảng Ninh", "Bắc Ninh", "Bắc Giang", "Hưng Yên", "Thái Bình", "Hải Dương", "Nam Định", "Ninh Bình", "Hà Nam", "Vĩnh Phúc", "Phú Thọ", "Hòa Bình", "Thái Nguyên", "Bắc Kạn", "Lạng Sơn", "Cao Bằng", "Hà Giang", "Tuyên Quang", "Yên Bái", "Lào Cai", "Lai Châu", "Điện Biên", "Sơn La", "Nghệ An", "Vinh"];
const THANH_HOA = ["Thanh Hóa", "Thanh Hoa", "Hoằng Hóa", "Sầm Sơn", "Bỉm Sơn", "Nghi Sơn"];
const CENTRAL = ["Hà Tĩnh", "Quảng Bình", "Quảng Trị", "Thừa Thiên", "Huế", "Đà Nẵng", "Quảng Nam", "Quảng Ngãi", "Bình Định", "Quy Nhơn", "Phú Yên", "Khánh Hòa", "Nha Trang", "Ninh Thuận", "Bình Thuận", "Kon Tum", "Gia Lai", "Đắk Lắk", "Dak Lak", "Đắk Nông", "Lâm Đồng", "Đà Lạt", "Buôn Ma Thuột", "Pleiku", "Tuy Hòa", "Phan Thiết", "Phan Rang"];
const SOUTH = ["Hồ Chí Minh", "Ho Chi Minh", "Sài Gòn", "Thủ Đức", "Bình Dương", "Đồng Nai", "Biên Hòa", "Bà Rịa", "Vũng Tàu", "Tây Ninh", "Bình Phước", "Long An", "Tiền Giang", "Mỹ Tho", "Bến Tre", "Trà Vinh", "Vĩnh Long", "Đồng Tháp", "An Giang", "Kiên Giang", "Rạch Giá", "Phú Quốc", "Cần Thơ", "Hậu Giang", "Sóc Trăng", "Bạc Liêu", "Cà Mau"];

const TABLE: Array<[VnRegion, string[]]> = [
  ["thanh_hoa", THANH_HOA],
  ["north", NORTH],
  ["central", CENTRAL],
  ["south", SOUTH],
];

/** Region + the place name that matched, or null when no known province / city appears in the text. */
export function detectRegion(address: string): { region: VnRegion; place: string } | null {
  const hay = ` ${fold(address)} `;
  if (!hay.trim()) return null;
  // abbreviations of Ho Chi Minh City
  if (/\b(tp ?hcm|hcm|tphcm|sg)\b/.test(hay)) return { region: "south", place: "Hồ Chí Minh" };
  if (/\b(hn)\b/.test(hay)) return { region: "north", place: "Hà Nội" };
  let best: { region: VnRegion; place: string; len: number } | null = null;
  for (const [region, names] of TABLE) {
    for (const name of names) {
      const key = fold(name);
      if (hay.includes(` ${key} `) || hay.includes(` ${key},`) || hay.endsWith(` ${key}`)) {
        if (!best || key.length > best.len) best = { region, place: name, len: key.length };
      }
    }
  }
  return best ? { region: best.region, place: best.place } : null;
}

const ZONE_RULES: Record<VnRegion, RegExp> = {
  thanh_hoa: /thanh hoa|noi tinh/,
  north: /mien bac|bac\b/,
  central: /mien trung|trung\b|tay nguyen/,
  south: /mien nam|nam\b/,
};

/** Region a carrier zone belongs to, from its display name ("Miền Bắc", "Thanh Hóa"…); null for non-regional zones. */
export function regionOfZoneName(name: string): VnRegion | null {
  const key = fold(name);
  for (const r of ["thanh_hoa", "north", "central", "south"] as VnRegion[]) if (ZONE_RULES[r].test(key)) return r;
  return null;
}

/** Zone (by its display name) that serves a region. */
export function zoneForRegion<Z extends { label?: string; name?: string }>(zones: Z[], region: VnRegion): Z | undefined {
  const nameOf = (z: Z) => fold((z.label ?? z.name ?? "") as string);
  return zones.find((z) => ZONE_RULES[region].test(nameOf(z)));
}

export const REGION_LABEL: Record<VnRegion, string> = { thanh_hoa: "Thanh Hóa", north: "Miền Bắc", central: "Miền Trung", south: "Miền Nam" };
