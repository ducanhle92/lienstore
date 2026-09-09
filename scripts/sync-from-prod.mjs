#!/usr/bin/env node
/**
 * Pull the live catalogue from a running LienStore (prod or dev) into data/seed.json, so products created or edited
 * directly in that admin reach the repo (and, after the next push/release, every other environment).
 *
 *   npm run sync:prod                              # uses SYNC_URL / SYNC_USER / SYNC_PASSWORD from .env.local or env
 *   node scripts/sync-from-prod.mjs https://linconnn.io.vn admin 'password'
 *
 * What it does:
 *  1. GET <url>/api/admin/export with HTTP Basic (env admin account of that server).
 *  2. Images uploaded through that admin live in its data volume (/api/files/…): download them into
 *     public/sites/lienstore/shared/products/uploads/ and rewrite the paths so they ship inside the image.
 *  3. Keep meta.removedSlugs from the current seed, bump meta.seededAt, write data/seed.json.
 * Afterwards restart the local dev server (LIEN_SEED_SYNC=update) and commit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = path.join(ROOT, "data", "seed.json");
const uploadsDir = path.join(ROOT, "public", "sites", "lienstore", "shared", "products", "uploads");
const WEB_PREFIX = "/sites/lienstore/shared/products/uploads/";

// .env.local (KEY=VALUE lines) as a fallback for credentials
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env.local */
}

const [urlArg, userArg, passArg] = process.argv.slice(2);
const base = (urlArg || process.env.SYNC_URL || "https://linconnn.io.vn").replace(/\/$/, "");
const user = userArg || process.env.SYNC_USER || process.env.ADMIN_USER || "admin";
const pass = passArg || process.env.SYNC_PASSWORD || process.env.ADMIN_PASSWORD;
if (!pass) {
  console.error("Thiếu mật khẩu admin của server. Truyền tham số thứ 3 hoặc đặt SYNC_PASSWORD.");
  process.exit(1);
}
const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

console.log(`→ ${base}/api/admin/export`);
const res = await fetch(`${base}/api/admin/export`, { headers: { authorization: auth } });
if (!res.ok) {
  console.error(`Export thất bại: HTTP ${res.status}. Kiểm tra URL / tài khoản / mật khẩu (tài khoản trong ADMIN_USER của server đó).`);
  process.exit(1);
}
const remote = await res.json();
const local = fs.existsSync(seedPath) ? JSON.parse(fs.readFileSync(seedPath, "utf8")) : { meta: {} };

// download admin uploads referenced by products / categories
let downloaded = 0;
let rewritten = 0;
async function localise(u) {
  if (typeof u !== "string" || !u.startsWith("/api/files/")) return u;
  const rel = u.slice("/api/files/".length); // products/2026-09/x.jpg  or categories/…
  const dest = path.join(uploadsDir, ...rel.split("/"));
  if (!fs.existsSync(dest)) {
    const r = await fetch(`${base}${u}`);
    if (!r.ok) {
      console.warn(`  ! không tải được ${u} (HTTP ${r.status}) — giữ nguyên đường dẫn`);
      return u;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    downloaded++;
  }
  rewritten++;
  return WEB_PREFIX + rel;
}
for (const p of remote.products ?? []) {
  const imgs = [];
  for (const u of p.images ?? []) imgs.push(await localise(u));
  const thumb = await localise(p.thumb);
  if (JSON.stringify(imgs) !== JSON.stringify(p.images) || thumb !== p.thumb) {
    p.images = imgs;
    p.thumb = thumb;
    // do not touch updatedAt: the server row keeps winning; path rewrite only matters for other environments
  }
}
for (const c of remote.categories ?? []) c.image = await localise(c.image);

const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
remote.meta = { nextOrderNumber: 1001, seededAt: now, removedSlugs: local.meta?.removedSlugs ?? [] };
fs.writeFileSync(seedPath, JSON.stringify(remote, null, 1) + "\n");

const before = new Set((local.products ?? []).map((p) => p.slug));
const after = new Set((remote.products ?? []).map((p) => p.slug));
const added = [...after].filter((s) => !before.has(s));
const gone = [...before].filter((s) => !after.has(s));
console.log(`✔ seed.json ← ${base}: ${remote.products?.length ?? 0} sản phẩm, ${remote.categories?.length ?? 0} danh mục`);
console.log(`  mới so với local: ${added.length}${added.length ? " (" + added.slice(0, 8).join(", ") + (added.length > 8 ? ", …" : "") + ")" : ""}`);
if (gone.length) console.log(`  có ở local nhưng không có trên server (sẽ bị coi là đã xoá khi server chạy seed này? KHÔNG — chỉ removedSlugs mới xoá): ${gone.slice(0, 8).join(", ")}${gone.length > 8 ? ", …" : ""}`);
console.log(`  ảnh upload tải về: ${downloaded}, đường dẫn đổi: ${rewritten}`);
console.log("Tiếp theo: khởi động lại dev server (LIEN_SEED_SYNC=update), kiểm tra, rồi commit + push.");
