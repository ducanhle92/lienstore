import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { brandify, hasLegacyBrand } from "./brand";
import { getSiteTheme } from "./db";
import { getDb, getSetting, setSetting, withTransaction } from "./sqlite";

/**
 * One-time (flag `brand_rename_rev`): every stored text that still says "LienStore" (pages, posts, product texts,
 * categories, shipping methods/zones, free-text settings) is rewritten to the theme's shopName. Case-sensitive on
 * purpose: slugs and asset paths ("/sites/lienstore/…") keep their lower-case name. The page slug
 * `gioi-thieu-ve-lienstore` also stays (it is a URL).
 */
const TEXT_COLUMNS: Array<[table: string, columns: string[]]> = [
  ["pages", ["title", "content"]],
  ["posts", ["title", "content", "excerpt"]],
  ["products", ["name", "short_description", "description", "name_ja", "short_description_ja", "description_ja"]],
  ["categories", ["name", "description", "name_ja"]],
  ["shipping_methods", ["name", "description", "extra_label", "warehouse", "notes"]],
  ["shipping_zones", ["name", "areas", "eta"]],
];
/** Settings whose value is machine data (theme JSON with asset paths, flags…) — never rewritten. */
const SKIP_SETTINGS = new Set(["site_theme", "pricing_default_methods", "goship_last_carriers", "vn_carriers_disabled"]);

export function renameLegacyBrand(db: DatabaseSync, shopName: string): { rows: number; settings: number } {
  let rows = 0;
  let settings = 0;
  withTransaction(db, () => {
    for (const [table, cols] of TEXT_COLUMNS) {
      const have = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>).map((c) => c.name));
      const use = cols.filter((c) => have.has(c));
      if (!use.length) continue;
      // rowid works for every table here, including those keyed by slug instead of an id column
      const list = db.prepare(`SELECT rowid AS _rid, ${use.join(", ")} FROM ${table}`).all() as unknown as Array<Record<string, unknown>>;
      const upd = db.prepare(`UPDATE ${table} SET ${use.map((c) => `${c} = ?`).join(", ")} WHERE rowid = ?`);
      for (const r of list) {
        if (!use.some((c) => hasLegacyBrand(r[c] as string | null))) continue;
        upd.run(...use.map((c) => (typeof r[c] === "string" ? brandify(r[c] as string, shopName) : (r[c] as null))), r._rid as number);
        rows++;
      }
    }
    const all = db.prepare("SELECT key, value FROM settings").all() as unknown as Array<{ key: string; value: string }>;
    for (const s of all) {
      if (SKIP_SETTINGS.has(s.key) || s.key.endsWith("_token") || s.key.endsWith("_key")) continue;
      if (!hasLegacyBrand(s.value)) continue;
      setSetting(db, s.key, brandify(s.value, shopName));
      settings++;
    }
  });
  return { rows, settings };
}

export async function applyBrandRenameOnce(): Promise<{ shopName: string; rows: number; settings: number } | null> {
  const db = getDb();
  if (getSetting(db, "brand_rename_rev") === "1") return null;
  const shopName = (await getSiteTheme()).shopName.trim();
  if (!shopName || /^LienStore$/i.test(shopName)) return null; // still the old name: nothing to rewrite yet
  const r = renameLegacyBrand(db, shopName);
  setSetting(db, "brand_rename_rev", "1");
  return { shopName, ...r };
}
