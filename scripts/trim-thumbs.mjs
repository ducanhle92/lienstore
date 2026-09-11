#!/usr/bin/env node
/**
 * One-off: trim the white margins of every product thumbnail under public/ (and, when reachable, data/uploads) so the
 * product fills its card frame evenly. Idempotent — a trimmed picture trims to itself.
 *   node scripts/trim-thumbs.mjs            # thumbs of all products in data/lienstore.db
 *   node scripts/trim-thumbs.mjs --dry      # report only
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";

const ROOT = process.cwd();
const DB = process.env.LIEN_DB_PATH ?? path.join(ROOT, "data", "lienstore.db");
const UPLOADS = process.env.LIEN_UPLOAD_DIR ?? path.join(path.dirname(DB), "uploads");
const dry = process.argv.includes("--dry");

function fileFor(url) {
  const clean = url.split("?")[0];
  if (clean.startsWith("/api/files/")) return path.join(UPLOADS, clean.slice("/api/files/".length));
  if (clean.startsWith("/") && !clean.startsWith("//")) return path.join(ROOT, "public", clean);
  return null;
}

async function trim(file) {
  const input = fs.readFileSync(file);
  const base = sharp(input, { failOn: "none" }).rotate().flatten({ background: "#ffffff" });
  const meta = await base.metadata();
  const t = await base.clone().trim({ background: "#ffffff", threshold: 18 }).toBuffer({ resolveWithObject: true });
  const w = t.info.width;
  const h = t.info.height;
  if (!w || !h || w < 8 || h < 8) return null;
  const long = Math.max(w, h);
  const pad = Math.round(long * 0.04);
  const side = long + pad * 2;
  const left = Math.round((side - w) / 2);
  const top = Math.round((side - h) / 2);
  let p = sharp(t.data).extend({ top, bottom: side - h - top, left, right: side - w - left, background: "#ffffff" });
  const size = Math.min(side, Math.max(300, Math.min(meta.width ?? 300, meta.height ?? 300)));
  p = p.resize(size, size, { fit: "contain", background: "#ffffff" });
  const ext = path.extname(file).toLowerCase();
  p = ext === ".png" ? p.png({ compressionLevel: 9 }) : ext === ".webp" ? p.webp({ quality: 88 }) : p.jpeg({ quality: 88, mozjpeg: true });
  const before = { w: meta.width, h: meta.height };
  const changed = Math.abs(w - before.w) > 2 || Math.abs(h - before.h) > 2;
  return { buffer: await p.toBuffer(), before, after: { w, h }, changed };
}

const db = new DatabaseSync(DB, { readOnly: true });
const rows = db.prepare("SELECT id, thumb FROM products WHERE thumb <> ''").all();
let done = 0;
let skipped = 0;
const seen = new Set();
for (const r of rows) {
  const file = fileFor(r.thumb);
  if (!file || seen.has(file) || !fs.existsSync(file) || !/\.(jpe?g|png|webp)$/i.test(file)) {
    skipped++;
    continue;
  }
  seen.add(file);
  try {
    const res = await trim(file);
    if (!res) {
      skipped++;
      continue;
    }
    if (res.changed) {
      if (!dry) fs.writeFileSync(file, res.buffer);
      done++;
      if (done <= 15 || done % 50 === 0) console.log(`${dry ? "would trim" : "trimmed"} #${r.id} ${path.basename(file)} ${res.before.w}×${res.before.h} → object ${res.after.w}×${res.after.h}`);
    } else skipped++;
  } catch (e) {
    console.warn(`skip #${r.id} ${file}: ${e.message}`);
    skipped++;
  }
}
console.log(`${dry ? "would trim" : "trimmed"} ${done} thumbnails, ${skipped} unchanged/skipped`);
