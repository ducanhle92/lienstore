/**
 * Which product tags to show customers under "Từ khóa" on the product page. Tags are also search aliases (Japanese
 * names, romaji, unaccented spellings, pack sizes) — useful for the search box, noise for a Vietnamese shopper. Pure.
 */
const VI_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯ｦ-ﾟ]/;
// pack sizes / specs: "600ml", "170 viên", "SPF50", "PA+++"
const SPEC = /^(\d+([.,]\d+)?\s*(ml|l|g|mg|kg|viên|vien|gói|goi|cái|cai|chai|túi|tui|tuýp|tuyp|lít|lit|cm|mm|ngày|ngay|tháng|thang|%)|spf\s*\d*\+*|pa\+*)$/i;

export const foldVi = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();

/** Vietnamese keywords only: drops Japanese / CJK, pack sizes, unaccented duplicates and single words already in the name. */
export function displayTags(tags: string[], productName: string): string[] {
  const nameFold = ` ${foldVi(productName)} `;
  const accented = new Set(tags.filter((t) => VI_CHARS.test(t)).map(foldVi));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag) continue;
    if (CJK.test(tag)) continue;
    if (SPEC.test(tag)) continue;
    const f = foldVi(tag);
    if (seen.has(f)) continue;
    // "sua tam" next to "sữa tắm" — keep the accented one only
    if (!VI_CHARS.test(tag) && accented.has(f)) continue;
    // one-word fragments of the name ("sữa", "tắm", brand romaji "reihaku") — the name already covers them
    if (!f.includes(" ") && nameFold.includes(` ${f} `)) continue;
    seen.add(f);
    out.push(tag);
  }
  return out;
}
