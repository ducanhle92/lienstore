import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getDb, getSetting, setSetting, withTransaction } from "./sqlite";

/**
 * One-time (per CATALOG_SCOPE_REV), owner's decision of 2026-09-17: the shop sells only what it sources from OS Drug
 * Store and iHerb for now, and nothing has actually been stocked yet.
 *  1. iHerb becomes a purchase source; the three products bought there (supplier link on jp.iherb.com) move to it.
 *  2. Every other published product goes to draft (hidden). The ids are kept in `catalog_scope_hidden_ids` so the
 *     step can be undone from a script if the owner changes their mind.
 *  3. Warehouse data is reset to "everything is bought to order": stock lots and stock purchases are removed and every
 *     product becomes untracked / order-fulfilled. A JSON snapshot of what was removed is kept in
 *     `inventory_clean_backup` for the same reason.
 * Nothing here touches orders, prices or descriptions.
 */
export const CATALOG_SCOPE_REV = "1";

/** Products that stay visible besides the two sources: the OS Drug duplicates the shop already listed. */
const KEEP_IDS = [1274, 1564, 2121, 280];
const OS_DRUG_IMPORT_PATH = process.env.LIEN_OS_DRUG_IMPORT_PATH ?? path.join(process.cwd(), "data", "os-drug-import-2026-09-14.json");

function osDrugSlugs(): string[] {
  try {
    const payload = JSON.parse(fs.readFileSync(OS_DRUG_IMPORT_PATH, "utf8")) as { newProducts?: Array<{ slug: string }> };
    return (payload.newProducts ?? []).map((p) => p.slug);
  } catch {
    return [];
  }
}

export async function applyCatalogScopeOnce(): Promise<{ iherb: number; hidden: number; lotsRemoved: number; purchasesRemoved: number; untracked: number } | null> {
  const db = getDb();
  if (getSetting(db, "catalog_scope_rev") === CATALOG_SCOPE_REV) return null;
  const now = new Date().toISOString();
  const slugs = osDrugSlugs();
  const result = withTransaction(db, () => {
    // 1. iHerb
    db.prepare("INSERT OR IGNORE INTO purchase_sources (key, kind, name, url, address, branch, note, builtin, active, created_at) VALUES ('iherb', 'website', 'iHerb', 'https://jp.iherb.com/', '', '', 'Hàng Mỹ / quốc tế đặt qua iHerb Nhật Bản, giá niêm yết bằng ¥.', 0, 1, ?)").run(now);
    const iherb = db.prepare("SELECT id, cost_jpy, supplier_url FROM products WHERE supplier_url LIKE '%iherb.com%'").all() as unknown as Array<{ id: number; cost_jpy: number | null; supplier_url: string }>;
    const setSource = db.prepare("UPDATE products SET cost_source = 'iherb', cost_url = ?, updated_at = ? WHERE id = ?");
    const hasQuote = db.prepare("SELECT 1 FROM product_cost_sources WHERE product_id = ? AND source = 'iherb'");
    const addQuote = db.prepare("INSERT INTO product_cost_sources (product_id, source, price_jpy, url, note, checked_at, created_at) VALUES (?, 'iherb', ?, ?, '', ?, ?)");
    for (const p of iherb) {
      setSource.run(p.supplier_url, now, p.id);
      if (p.cost_jpy && p.cost_jpy > 0 && !hasQuote.get(p.id)) addQuote.run(p.id, p.cost_jpy, p.supplier_url, now, now);
    }

    // 2. hide everything not from OS Drug / iHerb
    const keep = new Set<number>([...KEEP_IDS, ...iherb.map((p) => p.id)]);
    for (const r of db.prepare("SELECT id FROM products WHERE cost_source IN ('os-drug-store', 'iherb')").all() as unknown as Array<{ id: number }>) keep.add(r.id);
    const bySlug = db.prepare("SELECT id FROM products WHERE slug = ?");
    for (const s of slugs) {
      const r = bySlug.get(s) as { id: number } | undefined;
      if (r) keep.add(r.id);
    }
    const hidden = (db.prepare("SELECT id FROM products WHERE status = 'publish'").all() as unknown as Array<{ id: number }>).map((r) => r.id).filter((id) => !keep.has(id));
    const hide = db.prepare("UPDATE products SET status = 'draft', updated_at = ? WHERE id = ?");
    for (const id of hidden) hide.run(now, id);
    setSetting(db, "catalog_scope_hidden_ids", JSON.stringify(hidden));

    // 3. warehouse reset, with a snapshot
    const backup = {
      at: now,
      products: db.prepare("SELECT id, stock, min_stock, fulfillment FROM products WHERE stock IS NOT NULL OR min_stock IS NOT NULL OR fulfillment <> 'order'").all(),
      stock_lots: db.prepare("SELECT * FROM stock_lots").all(),
      stock_purchases: db.prepare("SELECT * FROM stock_purchases").all(),
    };
    setSetting(db, "inventory_clean_backup", JSON.stringify(backup));
    const lotsRemoved = Number(db.prepare("DELETE FROM stock_lots").run().changes);
    const purchasesRemoved = Number(db.prepare("DELETE FROM stock_purchases").run().changes);
    const untracked = Number(db.prepare("UPDATE products SET stock = NULL, min_stock = NULL, fulfillment = 'order', updated_at = ? WHERE stock IS NOT NULL OR min_stock IS NOT NULL OR fulfillment <> 'order'").run(now).changes);
    return { iherb: iherb.length, hidden: hidden.length, lotsRemoved, purchasesRemoved, untracked };
  });
  setSetting(db, "catalog_scope_rev", CATALOG_SCOPE_REV);
  return result;
}
