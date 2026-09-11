/**
 * SKU convention (Admin › Kho hàng): `BRAND-CAT-YYMM-NNNN`
 *   BRAND  2–4 letters from the brand (DHC, LION, SHIS…) — "SP" when the name starts with a generic word and no brand is known
 *   CAT    initials of the first category slug (thuc-pham-chuc-nang → TPCN, duong-da-mat → DDM, tri-mun → TM)
 *   YYMM   month the product was added to the catalogue
 *   NNNN   the product id, zero-padded — guarantees uniqueness and links the code back to the record
 * Example: LION-TM-2609-0173 = Lion · Trị mụn · added 09/2026 · product #173.
 * Pure module: used by the product form (suggest) and the bulk "Tạo SKU" action.
 */

/** Generic first words of Vietnamese product names — not brands. */
const GENERIC = new Set([
  "vien", "kem", "dau", "thuoc", "sua", "mat", "tinh", "nuoc", "son", "bo", "gel", "xit", "mieng", "bot", "tra", "keo", "banh", "kep", "mask", "serum", "combo", "set", "bao", "tui", "hop", "chai", "lo", "goi",
  "vitamin", "collagen", "men", "tao", "nuoc", "phan", "kem", "mieng", "dau", "bong", "khan", "tam", "gel", "sap", "dung", "xa", "may", "do", "dong", "the", "bo", "sieu", "thuc", "thuc", "nuoc", "bo", "sua",
  "kem", "bong", "que", "tam", "giay", "bim", "ta", "binh", "num", "khan", "gioi", "ban", "chai", "cay", "bo", "con", "ong",
]);

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, (m) => (m === "đ" ? "d" : "D"));

/** Brand code from the product name: the first token when it looks like a brand, else "SP". */
export function brandCode(name: string, hint?: string | null): string {
  const pick = (raw: string) => {
    const tok = fold(raw).replace(/[^A-Za-z0-9]/g, "");
    return tok ? tok.toUpperCase().slice(0, 4) : "";
  };
  if (hint && hint.trim()) {
    const code = pick(hint.trim().split(/\s+/)[0]);
    if (code.length >= 2) return code;
  }
  const words = name.trim().split(/\s+/);
  const firstWord = fold(words[0] ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (firstWord && !GENERIC.has(firstWord) && /^[A-Za-z]/.test(fold(words[0]))) {
    const code = pick(words[0]);
    if (code.length >= 2) return code;
  }
  // brand often follows the generic words: "Kem chống nắng Anessa …" → first token with a capital letter that is not generic
  for (const w of words.slice(1, 6)) {
    const f = fold(w);
    if (/^[A-Z][A-Za-z0-9&'-]+$/.test(f) && !GENERIC.has(f.toLowerCase())) {
      const code = pick(w);
      if (code.length >= 2) return code;
    }
  }
  return "SP";
}

/** Initials of a category slug: "thuc-pham-chuc-nang" → "TPCN", "me-va-be" → "MVB" (max 4). */
export function categoryCode(slug: string | undefined): string {
  if (!slug) return "XX";
  const parts = slug.split("-").filter(Boolean);
  const code = parts.map((p) => p[0]).join("").toUpperCase().slice(0, 4);
  return code || "XX";
}

export function skuMonth(createdAt: string): string {
  const d = new Date(createdAt);
  const y = Number.isNaN(d.getTime()) ? new Date() : d;
  return `${String(y.getFullYear()).slice(2)}${String(y.getMonth() + 1).padStart(2, "0")}`;
}

export interface SkuInput {
  id: number;
  name: string;
  categories: string[];
  createdAt: string;
  /** Brand hint (e.g. the "Thương hiệu" fact of the description). */
  brand?: string | null;
}

export function suggestSku(p: SkuInput): string {
  return `${brandCode(p.name, p.brand)}-${categoryCode(p.categories[0])}-${skuMonth(p.createdAt)}-${String(p.id).padStart(4, "0")}`;
}

export const SKU_PATTERN = /^[A-Z0-9]{2,4}-[A-Z0-9]{2,4}-\d{4}-\d{4,}$/;
