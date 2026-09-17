import "server-only";
import { getDb, getSetting, setSetting, withTransaction } from "./sqlite";

/**
 * One-time data fix (runs once per database, flag `hatomugi_800_rev`): the Reihaku Hatomugi High Moisture body soap
 * bottle was entered as 600 ml; the owner confirmed it is the 800 ml bottle. Name, Japanese name, tags, the variant
 * attribute ("Thể tích") and every "600ml" in the descriptions move to 800 ml. The URL (slug) stays so links keep working.
 */
const REV = "1";
const SLUG = "sua-tam-reihaku-hatomugi-high-moisture-600ml";

interface Row {
  id: number;
  name: string;
  name_ja: string | null;
  tags: string | null;
  variant_attrs: string | null;
  short_description: string | null;
  description: string | null;
  short_description_ja: string | null;
  description_ja: string | null;
}

const fix = (s: string | null | undefined) => (s ?? "").replace(/600\s?ml/gi, "800ml").replace(/600\s?mL/g, "800ml");
const fixJson = (raw: string | null, kind: "array" | "object"): string | null => {
  if (!raw) return raw;
  try {
    const v = JSON.parse(raw) as unknown;
    if (kind === "array" && Array.isArray(v)) return JSON.stringify(Array.from(new Set(v.map((t) => fix(String(t))))));
    if (kind === "object" && v && typeof v === "object" && !Array.isArray(v)) return JSON.stringify(Object.fromEntries(Object.entries(v as Record<string, string>).map(([k, val]) => [k, fix(String(val))])));
  } catch {
    /* leave malformed JSON alone */
  }
  return raw;
};

export async function fixHatomugiVolumeOnce(): Promise<{ updated: number } | null> {
  const db = getDb();
  if (getSetting(db, "hatomugi_800_rev") === REV) return null;
  const now = new Date().toISOString();
  const updated = withTransaction(db, () => {
    const row = db.prepare("SELECT id, name, name_ja, tags, variant_attrs, short_description, description, short_description_ja, description_ja FROM products WHERE slug = ?").get(SLUG) as Row | undefined;
    if (!row) return 0;
    db.prepare("UPDATE products SET name = ?, name_ja = ?, tags = ?, variant_attrs = ?, short_description = ?, description = ?, short_description_ja = ?, description_ja = ?, updated_at = ? WHERE id = ?").run(
      fix(row.name),
      row.name_ja === null ? null : fix(row.name_ja),
      fixJson(row.tags, "array"),
      fixJson(row.variant_attrs, "object"),
      row.short_description === null ? null : fix(row.short_description),
      row.description === null ? null : fix(row.description),
      row.short_description_ja === null ? null : fix(row.short_description_ja),
      row.description_ja === null ? null : fix(row.description_ja),
      now,
      row.id,
    );
    return 1;
  });
  setSetting(db, "hatomugi_800_rev", REV);
  return { updated };
}
