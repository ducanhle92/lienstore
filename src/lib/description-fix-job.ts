import "server-only";
import { restructureInlineDescription } from "./description-restructure";
import { getDb, getSetting, setSetting } from "./sqlite";

/**
 * One-time data fix (per DESC_FIX_REV): the 2026-09-14 OS Drug Store import wrote each product's researched copy as
 * ONE paragraph with inline labels ("Công dụng: … Thành phần chính: … Cách dùng: … Lưu ý: …"), so the product page and
 * the admin "Soạn theo mục" editor showed empty sections. Re-shape those descriptions into headed sections; anything
 * already structured, or edited into another shape since, is left alone (the restructurer returns null for it).
 */
export const DESC_FIX_REV = "1";

export async function restructureImportedDescriptions(): Promise<{ updated: number; skipped: number } | null> {
  const db = getDb();
  if (getSetting(db, "desc_restructure_rev") === DESC_FIX_REV) return null;
  const rows = db.prepare("SELECT id, description FROM products WHERE description LIKE '%<p>Công dụng:%' AND description NOT LIKE '%<h3%'").all() as unknown as Array<{ id: number; description: string }>;
  const upd = db.prepare("UPDATE products SET description = ?, updated_at = ? WHERE id = ?");
  const now = new Date().toISOString();
  let updated = 0;
  let skipped = 0;
  for (const r of rows) {
    const next = restructureInlineDescription(r.description);
    if (next && next !== r.description) {
      upd.run(next, now, r.id);
      updated++;
    } else skipped++;
  }
  setSetting(db, "desc_restructure_rev", DESC_FIX_REV);
  return { updated, skipped };
}
