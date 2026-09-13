/**
 * j86store price list  ×  LienStore expected price (the shop's own formula) — per-product comparison.
 *
 *   npx -y tsx --conditions=react-server scripts/compare-j86store-expected.mts docs/reports/j86store-gia-2026-09-14.csv [--prod https://linconnn.io.vn] [--out file.csv]
 *
 * For every j86store row (matched by slug, the catalogue was seeded from j86store) the script computes
 *   expected = (cost ¥ × DCOM rate + pro-rata import legs) × (1 + margin % of the category)   — via suggestPrice()
 * and fetches the price currently shown on the production site, then writes a CSV with a verdict per product.
 */
import fs from "node:fs";
import path from "node:path";
import { getAllProducts, getImportQuoteConfig, getPricingConfig } from "../src/lib/db";
import { readFx } from "../src/lib/fx";
import { suggestPrice } from "../src/lib/pricing";

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--"));
if (!input) {
  console.error("Cách dùng: npx -y tsx --conditions=react-server scripts/compare-j86store-expected.mts <j86store.csv> [--prod URL] [--out file.csv]");
  process.exit(1);
}
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const prodBase = opt("--prod", "https://linconnn.io.vn").replace(/\/$/, "");
const today = new Date().toISOString().slice(0, 10);
const outPath = opt("--out", path.join(process.cwd(), "docs", "reports", `so-sanh-j86store-gia-ky-vong-${today}.csv`));

// ---- CSV ----
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some((c) => c.trim() !== "")) rows.push(row); }
  return rows;
}
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const num = (v: string | undefined) => { const s = (v ?? "").replace(/[^\d]/g, ""); return s ? Number(s) : null; };
const vnd = (n: number) => n.toLocaleString("vi-VN");
const pct = (a: number, b: number) => Math.round(((a - b) / b) * 1000) / 10;

// ---- theirs ----
const rows = parseCsv(fs.readFileSync(input, "utf8"));
const header = rows.shift()!.map((h) => h.trim().toLowerCase());
const ix = (n: string) => header.indexOf(n);
const theirs = rows
  .map((r) => ({ url: r[ix("url")] ?? "", slug: (r[ix("slug")] || (r[ix("url")] ?? "").match(/\/product\/([^/?#]+)/)?.[1]) ?? "", name: r[ix("ten_san_pham")] ?? "", price: num(r[ix("gia_ban_vnd")]), stock: r[ix("tinh_trang")] ?? "", cat: r[ix("danh_muc")] ?? "" }))
  .filter((t) => t.name);

// ---- ours ----
const [products, quote, pricing] = await Promise.all([getAllProducts(true), getImportQuoteConfig(), getPricingConfig()]);
const fx = readFx();
const bySlug = new Map(products.map((p) => [p.slug, p]));

// ---- live prod price (RSC payload of the product page) ----
async function prodPrice(slug: string): Promise<number | null> {
  try {
    const res = await fetch(`${prodBase}/product/${slug}/`, { headers: { "user-agent": "LienStore-compare/1.0" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const html = await res.text();
    const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`slug\\\\":\\\\"${esc}\\\\"[^}]{0,400}?price\\\\":(\\d+)`).exec(html) ?? new RegExp(`price\\\\":(\\d+)[^}]{0,400}?slug\\\\":\\\\"${esc}\\\\"`).exec(html);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

interface Out { [k: string]: string | number }
const out: Out[] = [];
let fetched = 0;
for (const t of theirs) {
  const p = bySlug.get(t.slug);
  const s = p ? suggestPrice({ costPrice: p.costPrice, weightG: p.weightG, dimsCm: p.dimsCm, dimsConfidence: p.dimsConfidence, marginPct: p.marginPct, categories: p.categories }, quote, pricing) : null;
  const live = p ? await prodPrice(p.slug) : null;
  if (live !== null) fetched++;
  const j = t.price;
  let verdict = "", advice = "";
  if (!p) { verdict = "Không có ở LienStore"; advice = "Xem có nên nhập bán"; }
  else if (j === null) { verdict = "j86 không có giá"; }
  else if (!s) { verdict = "LienStore chưa có giá vốn ¥"; advice = "Nhập giá vốn ¥ (nguồn mua) rồi tính lại"; }
  else {
    const d = pct(s.suggested, j);
    const marginAtJ86 = Math.round(((j - s.landed) / j) * 1000) / 10;
    if (j < s.landed) { verdict = `j86 bán DƯỚI giá vốn về VN của mình (${vnd(j)} < ${vnd(s.landed)})`; advice = `Kiểm tra lại khớp ¥ (${p.costJpy ?? "?"}¥ · ${p.costSource || "?"}): có thể sai dung tích/số viên hoặc j86 xả hàng`; }
    else if (d > 15) {
      verdict = `Giá kỳ vọng cao hơn j86 ${d}%`;
      advice = marginAtJ86 >= 20 ? `Có thể bán bằng j86 (${vnd(j)}đ), lãi còn ${marginAtJ86}%` : marginAtJ86 >= 10 ? `Cân nhắc hạ về gần j86: bán bằng j86 lãi chỉ ${marginAtJ86}%` : `Giữ giá kỳ vọng hoặc tìm nguồn ¥ rẻ hơn — bằng giá j86 lãi chỉ ${marginAtJ86}%`;
    } else if (d < -10) { verdict = `Giá kỳ vọng thấp hơn j86 ${Math.abs(d)}%`; advice = `Có thể bán cao hơn kỳ vọng, tới ~${vnd(j)}đ (thêm ${vnd(j - s.suggested)}đ/sp)`; }
    else { verdict = `Ngang giá thị trường (±15%)`; advice = `Dùng giá kỳ vọng ${vnd(s.suggested)}đ`; }
  }
  out.push({
    verdict, advice,
    j86_ten: t.name, j86_gia: j ?? "", j86_tinh_trang: t.stock, j86_url: t.url || (t.slug ? `https://j86store.com/product/${t.slug}/` : ""),
    ls_ten: p?.name ?? "", ls_sku: p?.sku ?? "", ls_gia_dang_ban_prod: live ?? "", ls_gia_ky_vong: s?.suggested ?? "",
    ls_cost_jpy: p?.costJpy ?? "", ls_nguon: p?.costSource ?? "", ls_gia_von_vnd: s?.cost ?? p?.costPrice ?? "", ls_weight_g: s?.weightG ?? "", ls_phi_3_chang: s?.shipping ?? "", ls_gia_von_ve_vn: s?.landed ?? "", ls_lai_pct_ky_vong: s?.marginPct ?? "",
    chenh_ky_vong_vs_j86_d: s && j !== null ? s.suggested - j : "", chenh_ky_vong_vs_j86_pct: s && j !== null ? pct(s.suggested, j) : "",
    lai_neu_ban_bang_j86_pct: s && j !== null ? Math.round(((j - s.landed) / j) * 1000) / 10 : "",
    prod_bang_j86: live !== null && j !== null ? (live === j ? "trùng" : `khác (${vnd(live)})`) : "",
    ls_danh_muc: p?.categories.join(" | ") ?? "", ls_url: p ? `${prodBase}/product/${p.slug}/` : "",
  });
}
const rank = (v: string) => (v.startsWith("j86 bán DƯỚI") ? 0 : v.startsWith("Giá kỳ vọng cao") ? 1 : v.startsWith("Giá kỳ vọng thấp") ? 2 : v.startsWith("Ngang") ? 3 : v.startsWith("LienStore chưa") ? 4 : 5);
out.sort((a, b) => rank(String(a.verdict)) - rank(String(b.verdict)) || Math.abs(Number(b.chenh_ky_vong_vs_j86_pct) || 0) - Math.abs(Number(a.chenh_ky_vong_vs_j86_pct) || 0));

const COLS: Array<[string, string]> = [
  ["verdict", "Kết luận"], ["advice", "Đề xuất"],
  ["j86_ten", "J86 · tên"], ["j86_gia", "J86 · giá bán (đ)"], ["j86_tinh_trang", "J86 · tình trạng"],
  ["ls_ten", "LienStore · tên"], ["ls_sku", "LienStore · SKU"], ["ls_gia_dang_ban_prod", "LienStore · giá đang bán trên web (đ)"], ["prod_bang_j86", "Giá web = giá j86?"], ["ls_gia_ky_vong", "LienStore · giá kỳ vọng (đ)"],
  ["ls_cost_jpy", "Giá vốn ¥"], ["ls_nguon", "Nguồn mua"], ["ls_gia_von_vnd", "Giá vốn (đ)"], ["ls_weight_g", "KL tính cước (g)"], ["ls_phi_3_chang", "Phí 3 chặng nhập (đ)"], ["ls_gia_von_ve_vn", "Giá vốn về VN (đ)"], ["ls_lai_pct_ky_vong", "Tỉ lệ lãi kỳ vọng %"],
  ["chenh_ky_vong_vs_j86_d", "Kỳ vọng − J86 (đ)"], ["chenh_ky_vong_vs_j86_pct", "Kỳ vọng − J86 (%)"], ["lai_neu_ban_bang_j86_pct", "Lãi nếu bán bằng giá J86 (%)"],
  ["ls_danh_muc", "LienStore · danh mục"], ["j86_url", "J86 · URL"], ["ls_url", "LienStore · URL"],
];
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, "﻿" + [COLS.map(([, h]) => csvCell(h)).join(","), ...out.map((r) => COLS.map(([k]) => csvCell(r[k])).join(","))].join("\r\n"), "utf8");

const n = (f: (r: Out) => boolean) => out.filter(f).length;
console.log(`Tỉ giá DCOM đang dùng: ${fx.effective} đ/¥ · lãi mặc định ${pricing.marginPct}% · làm tròn ${pricing.roundTo}đ · lô ${pricing.lotWeightG / 1000} kg`);
console.log(`j86: ${theirs.length} sp · khớp slug: ${n((r) => r.ls_ten !== "")} · lấy được giá prod: ${fetched} · giá web = giá j86: ${n((r) => r.prod_bang_j86 === "trùng")} · khác: ${n((r) => String(r.prod_bang_j86).startsWith("khác"))}`);
console.log(`Kỳ vọng cao hơn j86 >15%: ${n((r) => String(r.verdict).startsWith("Giá kỳ vọng cao"))} · thấp hơn >10%: ${n((r) => String(r.verdict).startsWith("Giá kỳ vọng thấp"))} · ngang: ${n((r) => String(r.verdict).startsWith("Ngang"))} · j86 dưới giá vốn về VN: ${n((r) => String(r.verdict).startsWith("j86 bán DƯỚI"))} · chưa có ¥: ${n((r) => String(r.verdict).startsWith("LienStore chưa"))} · không có ở LS: ${n((r) => r.verdict === "Không có ở LienStore")}`);
console.log(`→ ${path.relative(process.cwd(), outPath)}`);
process.exit(0);
