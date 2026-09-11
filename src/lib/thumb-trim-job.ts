import "server-only";
import fs from "node:fs";
import { trimToFrame } from "./image-trim";
import { getDb, getSetting, setSetting } from "./sqlite";
import { absolutePath, relFromUrl } from "./uploads";

/**
 * One-time pass (per `thumb_trim_rev`) over product thumbnails that live in the uploads volume (/api/files/…): trim the
 * white margins in place so cards look even. Thumbnails under public/ are trimmed in the repo (scripts/trim-thumbs.mjs).
 */
export const THUMB_TRIM_REV = "1";

export async function trimUploadedThumbs(): Promise<{ trimmed: number; skipped: number } | null> {
  const db = getDb();
  if (getSetting(db, "thumb_trim_rev") === THUMB_TRIM_REV) return null;
  const rows = db.prepare("SELECT id, thumb FROM products WHERE thumb LIKE '/api/files/%'").all() as unknown as Array<{ id: number; thumb: string }>;
  let trimmed = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    const rel = relFromUrl(r.thumb);
    const abs = rel ? absolutePath(rel) : null;
    if (!abs || seen.has(abs) || !fs.existsSync(abs) || !/\.(jpe?g|png|webp)$/i.test(abs)) {
      skipped++;
      continue;
    }
    seen.add(abs);
    try {
      const res = await trimToFrame(fs.readFileSync(abs), { size: 300 });
      if (res.changed) {
        fs.writeFileSync(abs, res.buffer);
        trimmed++;
      } else skipped++;
    } catch {
      skipped++;
    }
  }
  setSetting(db, "thumb_trim_rev", THUMB_TRIM_REV);
  return { trimmed, skipped };
}
