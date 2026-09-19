/** Pure helpers for the header search suggestions (trending terms + brands); DB access lives in search-suggest.ts. */

/** Lower-case, no diacritics, single spaces — the key trending terms are grouped by. */
export function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s&+.'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A query worth logging: 2–60 chars, at least one letter or digit. */
export const isLoggableQuery = (q: string): boolean => {
  const t = q.trim();
  return t.length >= 2 && t.length <= 60 && /[\p{L}\p{N}]/u.test(t);
};

/** Words that look like brands in product names but are not. */
const BRAND_STOP = new Set(
  [
    // Vietnamese product words that happen to have no diacritics
    "set", "combo", "bo", "hop", "goi", "tui", "chai", "lo", "vien", "mieng", "hu", "tuyp", "thanh", "cay", "cap", "doi", "loai", "mau", "kem", "sua", "dau", "nuoc", "bot", "keo", "banh", "thuoc", "tra", "mat", "toc", "da", "moi", "tay", "chan", "khan", "giay", "bim", "ta", "binh", "xit", "nho", "nhuom", "xa", "tam", "rua", "duong", "chong", "nang", "trang", "den", "do", "xanh", "vang", "hong", "tim", "nau", "bac", "dong", "hang", "noi", "dia", "nhat", "ban", "cho", "be", "nam", "nu", "gia", "dinh", "an", "uong", "vi", "huong", "loai", "goc", "cu", "la", "hat", "qua", "con", "ong", "ga", "heo", "ca", "tom", "rong", "bien", "muoi", "duong", "gao", "mi", "my", "pho", "bun", "chao", "sup", "tuong", "ot",
    // generic English words in product names
    "size", "new", "mini", "plus", "pro", "max", "ex", "premium", "gold", "silver", "white", "black", "red", "pink", "blue", "green", "clear", "extra", "super", "ultra", "moist", "rich", "deep", "care", "cream", "gel", "lotion", "serum", "essence", "mask", "milk", "oil", "powder", "spray", "shampoo", "conditioner", "treatment", "soap", "body", "face", "hair", "hand", "foot", "eye", "lip", "skin", "baby", "kids", "men", "women", "japan", "uv", "spf", "pa", "ml", "g", "kg", "mg", "vitamin", "collagen", "dha", "epa", "omega", "calcium", "canxi", "type", "tone", "up", "the", "and", "for", "with", "of", "in", "on", "by", "to", "no", "de", "wa", "moisture", "repair", "protect", "smooth", "bright", "whitening", "sun", "sunscreen", "cleansing", "foam", "wash", "water", "toner", "pack", "sheet", "cotton", "tablet", "tablets", "capsule", "capsules", "jelly", "gummy", "gummies", "candy", "tea", "coffee", "matcha", "cocoa", "rice", "noodle", "sauce", "snack", "chocolate", "cookie", "biscuit", "drink", "juice", "beer", "sake", "medical", "medicated", "supplement", "color", "colour", "night", "day", "morning", "refill", "kit", "bag", "box", "bottle", "tube", "jar", "stick", "sticks", "pieces", "pcs", "fragrance", "aroma", "flavor", "sakura", "yuzu", "lemon", "peach", "strawberry", "grape", "apple", "honey", "aloe", "rose", "mint", "lavender", "citrus", "floral", "musk", "vanilla", "milky", "fresh", "natural", "organic", "herbal", "pure", "perfect", "total", "double", "triple", "long", "short", "soft", "hard", "hot", "cool", "ice", "light", "dark", "brown", "ash", "beige", "clean", "power", "energy", "sport", "sports", "active", "daily", "family", "home", "kitchen", "travel", "pocket", "portable", "plus+", "bb", "cc", "dd", "series", "edition", "limited", "original", "classic", "special", "standard", "regular", "medium", "large", "small", "high", "low", "barrier", "bouquet", "eau", "extract", "moisturizing", "moisturising", "hydrating", "sensitive", "intensive", "advanced", "complete", "balance", "control", "volume", "damage", "scalp", "acne", "spot", "pore", "wrinkle", "aging", "anti-aging", "brightening", "lifting", "firming", "cooling", "warming", "relief", "support", "health", "beauty", "diet", "slim", "detox", "protein", "fiber", "enzyme", "probiotic", "lactic", "yeast", "ginseng", "turmeric", "ginger", "garlic", "royal", "placenta", "hyaluronic", "ceramide", "retinol", "niacinamide", "arbutin", "tranexamic", "glutathione", "coenzyme", "q10", "b1", "b2", "b6", "b12", "c", "d", "e", "k", "zinc", "iron", "magnesium", "chondroitin", "glucosamine", "lutein", "blueberry", "cranberry", "acai", "aojiru", "konjac", "mochi", "senbei", "dango", "ramen", "udon", "soba", "curry", "wasabi", "miso", "dashi", "furikake", "nori", "kombu", "umeboshi", "tsukemono",
  ],
);

/**
 * Brands guessed from product names: Latin-script capitalised words (no Vietnamese diacritics) that appear in at
 * least `min` product names, minus generic words. "DHC Vitamin C" → DHC, "Sữa tắm dầu ngựa Kumano Yushi" → Kumano.
 */
export function deriveBrands(names: string[], limit = 20, min = 3): string[] {
  const count = new Map<string, { n: number; display: string }>();
  for (const name of names) {
    const seen = new Set<string>();
    for (const raw of name.split(/[\s/(),·]+/)) {
      const w = raw.replace(/^[^A-Za-z0-9&]+|[^A-Za-z0-9&.'!]+$/g, "");
      if (w.length < 2 || w.length > 20) continue;
      if (!/^[A-Z][A-Za-z0-9&'.!-]*$/.test(w)) continue; // capitalised Latin word only
      if (/[^\x00-\x7F]/.test(w)) continue; // any diacritic → Vietnamese word
      const key = w.toLowerCase();
      if (BRAND_STOP.has(key) || /^\d/.test(key) || seen.has(key)) continue;
      seen.add(key);
      const cur = count.get(key);
      if (cur) cur.n++;
      else count.set(key, { n: 1, display: w });
    }
  }
  return [...count.values()]
    .filter((c) => c.n >= min)
    .sort((a, b) => b.n - a.n || a.display.localeCompare(b.display))
    .slice(0, limit)
    .map((c) => c.display);
}

/** Merge pinned terms first, then trending, then fallbacks — deduplicated by normalized form, capped. */
export function mergeTerms(groups: string[][], limit: number, hidden: Set<string> = new Set()): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const g of groups)
    for (const t of g) {
      const k = normalizeQuery(t);
      if (!k || seen.has(k) || hidden.has(k)) continue;
      seen.add(k);
      out.push(t.trim());
      if (out.length >= limit) return out;
    }
  return out;
}
