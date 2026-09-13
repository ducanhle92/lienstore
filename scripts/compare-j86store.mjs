// Compare a j86store.com price list (CSV produced by ChatGPT — see docs/research/prompt-chatgpt-cao-j86store.md)
// with the LienStore catalogue and write docs/reports/so-sanh-j86store-<date>.csv.
//
//   node scripts/compare-j86store.mjs <file.csv> [--db data/lienstore.db] [--out docs/reports/x.csv]
//
// Matching: 1) slug from the URL (the LienStore catalogue was seeded from j86store, so most slugs coincide),
//           2) normalised name equality, 3) token overlap (Jaccard ≥ 0.6) — reported with a confidence column.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--"));
if (!input) {
  console.error("Cách dùng: node scripts/compare-j86store.mjs <j86store.csv> [--db data/lienstore.db] [--out docs/reports/so-sanh.csv]");
  process.exit(1);
}
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const dbPath = opt("--db", path.join(process.cwd(), "data", "lienstore.db"));
const today = new Date().toISOString().slice(0, 10);
const outPath = opt("--out", path.join(process.cwd(), "docs", "reports", `so-sanh-j86store-${today}.csv`));

// ---------- CSV helpers ----------
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === "," || ch === ";" && !text.includes(",")) { row.push(cell); cell = ""; }
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
const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ---------- normalisation ----------
const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const STOP = new Set(["nhat", "ban", "cua", "va", "cho", "danh", "loai", "hang", "chinh", "noi", "dia", "the", "of", "for", "and", "with"]);
const tokens = (s) => strip(s).replace(/[^a-z0-9]+/g, " ").split(" ").filter((t) => t && !STOP.has(t));
const norm = (s) => tokens(s).join(" ");
const toNumber = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[^\d]/g, "");
  return s ? Number(s) : null;
};
const jaccard = (a, b) => {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter || 1);
};
const slugFromUrl = (u) => (String(u).match(/\/product\/([^/?#]+)/) || [])[1] ?? "";

// ---------- read theirs ----------
const rows = parseCsv(fs.readFileSync(input, "utf8"));
const header = rows.shift().map((h) => strip(h).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
const col = (names) => header.findIndex((h) => names.includes(h));
const iUrl = col(["url", "link", "duong_dan"]);
const iSlug = col(["slug"]);
const iName = col(["ten_san_pham", "ten", "name", "product", "san_pham", "title"]);
const iPrice = col(["gia_ban_vnd", "gia_ban", "gia", "price", "gia_vnd", "sale_price"]);
const iRegular = col(["gia_goc_vnd", "gia_goc", "regular_price", "gia_niem_yet"]);
const iStock = col(["tinh_trang", "stock", "availability", "ton_kho"]);
const iCat = col(["danh_muc", "category", "categories"]);
if (iName < 0 || iPrice < 0) {
  console.error(`Không nhận ra cột tên/giá. Tiêu đề đọc được: ${header.join(", ")}`);
  process.exit(1);
}
const theirs = rows
  .map((r) => ({
    url: iUrl >= 0 ? r[iUrl]?.trim() ?? "" : "",
    slug: (iSlug >= 0 && r[iSlug]?.trim()) || slugFromUrl(iUrl >= 0 ? r[iUrl] : ""),
    name: r[iName]?.trim() ?? "",
    price: toNumber(r[iPrice]),
    regular: iRegular >= 0 ? toNumber(r[iRegular]) : null,
    stock: iStock >= 0 ? r[iStock]?.trim() ?? "" : "",
    cat: iCat >= 0 ? r[iCat]?.trim() ?? "" : "",
  }))
  .filter((t) => t.name);

// ---------- read ours ----------
const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
const db = new DatabaseSync(dbPath, { readOnly: true });
const ours = db
  .prepare(
    `SELECT p.id, p.slug, p.name, p.sku, p.price, p.regular_price, p.status, p.stock, p.stock_status, p.cost_price, p.cost_jpy,
            (SELECT group_concat(c.name, ' | ') FROM product_categories pc JOIN categories c ON c.slug = pc.category_slug WHERE pc.product_id = p.id) AS cats
       FROM products p`,
  )
  .all();
const fxRow = db.prepare("SELECT rate FROM fx_rates ORDER BY day DESC LIMIT 1").get();
const fx = fxRow ? Number(fxRow.rate) : null;
const bySlug = new Map(ours.map((o) => [o.slug, o]));
const byNorm = new Map();
for (const o of ours) byNorm.set(norm(o.name), o);
const ourTokens = ours.map((o) => ({ o, t: tokens(o.name) }));

// ---------- match ----------
const used = new Set();
const out = [];
for (const t of theirs) {
  let o = null, how = "", conf = 0;
  if (t.slug && bySlug.has(t.slug)) { o = bySlug.get(t.slug); how = "slug"; conf = 1; }
  else if (byNorm.has(norm(t.name))) { o = byNorm.get(norm(t.name)); how = "tên"; conf = 0.95; }
  else {
    const tt = tokens(t.name);
    let best = null, bestScore = 0;
    for (const c of ourTokens) {
      const s = jaccard(tt, c.t);
      if (s > bestScore) { bestScore = s; best = c.o; }
    }
    if (best && bestScore >= 0.6) { o = best; how = `tên gần (${Math.round(bestScore * 100)}%)`; conf = bestScore; }
  }
  if (o) used.add(o.id);
  const ourPrice = o ? Number(o.price) : null;
  const diff = o && t.price !== null && ourPrice !== null ? ourPrice - t.price : null;
  const pct = diff !== null && t.price ? Math.round((diff / t.price) * 1000) / 10 : null;
  const costVnd = o ? (o.cost_price ? Number(o.cost_price) : o.cost_jpy && fx ? Math.round(Number(o.cost_jpy) * fx) : null) : null;
  const marginOurs = costVnd && ourPrice ? Math.round(((ourPrice - costVnd) / ourPrice) * 1000) / 10 : null;
  const marginIfMatch = costVnd && t.price ? Math.round(((t.price - costVnd) / t.price) * 1000) / 10 : null;
  let verdict = "";
  if (!o) verdict = "Không có ở LienStore";
  else if (t.price === null) verdict = "j86 không có giá";
  else if (ourPrice === null || ourPrice <= 0) verdict = "LienStore chưa có giá";
  else if (Math.abs(pct) < 3) verdict = "Ngang giá";
  else if (diff > 0) verdict = `LienStore đắt hơn ${pct}%`;
  else verdict = `LienStore rẻ hơn ${Math.abs(pct)}%`;
  if (o && costVnd && t.price !== null && t.price < costVnd) verdict += " · j86 bán dưới giá vốn của mình";
  // recommendation: keep / lower towards j86 / raise / re-check the ¥ cost match
  let advice = "";
  if (o && t.price !== null && ourPrice) {
    if (!costVnd) advice = "Chưa có giá vốn — nhập giá vốn ¥ rồi xét lại";
    else if (t.price < costVnd) advice = `Kiểm tra lại giá vốn ¥ (${o.cost_jpy ?? "?"}¥): j86 bán ${t.price.toLocaleString("vi-VN")}đ < vốn ${costVnd.toLocaleString("vi-VN")}đ → khả năng khớp sai sản phẩm/dung tích`;
    else if (pct > 15 && marginIfMatch >= 20) advice = `Có thể giảm về ~${t.price.toLocaleString("vi-VN")}đ (lãi còn ${marginIfMatch}%)`;
    else if (pct > 15 && marginIfMatch >= 10) advice = `Giảm một phần (về giá j86 lãi chỉ ${marginIfMatch}%)`;
    else if (pct > 15) advice = `Giữ giá — bằng giá j86 lãi chỉ ${marginIfMatch}%`;
    else if (pct < -10) advice = `Có thể tăng ~${Math.round(Math.abs(diff) / 1000)}k lên gần giá j86`;
    else advice = "Giữ giá (chênh ≤ 15%)";
  } else if (!o) advice = "Xem có nên nhập bán";
  out.push({
    verdict, advice, how, conf: Math.round(conf * 100),
    j86_ten: t.name, j86_gia: t.price, j86_gia_goc: t.regular, j86_tinh_trang: t.stock, j86_danh_muc: t.cat, j86_url: t.url || (t.slug ? `https://j86store.com/product/${t.slug}/` : ""),
    ls_ten: o?.name ?? "", ls_sku: o?.sku ?? "", ls_gia: ourPrice ?? "", ls_gia_goc: o?.regular_price ?? "", ls_trang_thai: o ? `${o.status}${o.stock_status === "outofstock" ? " · ngừng bán" : ""}` : "", ls_danh_muc: o?.cats ?? "",
    chenh_lech_d: diff ?? "", chenh_lech_pct: pct ?? "",
    ls_gia_von_vnd: costVnd ?? "", ls_lai_pct: marginOurs ?? "", lai_neu_ban_bang_gia_j86_pct: marginIfMatch ?? "",
    ls_url: o ? `https://linconnn.io.vn/product/${o.slug}/` : "",
  });
}
// ours that j86 does not sell
for (const o of ours) {
  if (used.has(o.id) || o.status !== "publish") continue;
  out.push({ verdict: "Chỉ LienStore có", advice: "", how: "", conf: "", j86_ten: "", j86_gia: "", j86_gia_goc: "", j86_tinh_trang: "", j86_danh_muc: "", j86_url: "", ls_ten: o.name, ls_sku: o.sku, ls_gia: o.price, ls_gia_goc: o.regular_price ?? "", ls_trang_thai: o.status, ls_danh_muc: o.cats ?? "", chenh_lech_d: "", chenh_lech_pct: "", ls_gia_von_vnd: o.cost_price ?? "", ls_lai_pct: "", lai_neu_ban_bang_gia_j86_pct: "", ls_url: `https://linconnn.io.vn/product/${o.slug}/` });
}
const order = { 0: 0 };
const rank = (v) => (v.startsWith("LienStore đắt") ? 0 : v.startsWith("LienStore rẻ") ? 1 : v === "Ngang giá" ? 2 : v.startsWith("Không có") ? 3 : v.startsWith("j86") || v.startsWith("LienStore chưa") ? 4 : 5);
out.sort((a, b) => rank(a.verdict) - rank(b.verdict) || (Number(b.chenh_lech_pct) || 0) - (Number(a.chenh_lech_pct) || 0));
void order;

// ---------- write ----------
const COLS = [
  ["verdict", "Kết luận"], ["advice", "Đề xuất"], ["how", "Cách khớp"], ["conf", "Độ tin cậy %"],
  ["j86_ten", "J86 · tên"], ["j86_gia", "J86 · giá bán"], ["j86_gia_goc", "J86 · giá gốc"], ["j86_tinh_trang", "J86 · tình trạng"], ["j86_danh_muc", "J86 · danh mục"], ["j86_url", "J86 · URL"],
  ["ls_ten", "LienStore · tên"], ["ls_sku", "LienStore · SKU"], ["ls_gia", "LienStore · giá bán"], ["ls_gia_goc", "LienStore · giá gốc"], ["ls_trang_thai", "LienStore · trạng thái"], ["ls_danh_muc", "LienStore · danh mục"],
  ["chenh_lech_d", "Chênh lệch (đ) = LS − J86"], ["chenh_lech_pct", "Chênh lệch %"],
  ["ls_gia_von_vnd", "LienStore · giá vốn (đ)"], ["ls_lai_pct", "LienStore · lãi hiện tại %"], ["lai_neu_ban_bang_gia_j86_pct", "Lãi nếu bán bằng giá J86 %"], ["ls_url", "LienStore · URL"],
];
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, "﻿" + [COLS.map(([, h]) => csvCell(h)).join(","), ...out.map((r) => COLS.map(([k]) => csvCell(r[k])).join(","))].join("\r\n"), "utf8");

// ---------- summary ----------
const matched = out.filter((r) => r.how);
const count = (pred) => out.filter(pred).length;
const priced = matched.filter((r) => r.chenh_lech_pct !== "");
const avg = priced.length ? Math.round((priced.reduce((s, r) => s + Number(r.chenh_lech_pct), 0) / priced.length) * 10) / 10 : 0;
console.log(`Đọc ${theirs.length} sản phẩm j86store · khớp ${matched.length} (slug ${count((r) => r.how === "slug")}, tên ${count((r) => r.how === "tên")}, tên gần ${count((r) => r.how.startsWith("tên gần"))}) · j86 có mà LienStore không có: ${count((r) => r.verdict === "Không có ở LienStore")} · chỉ LienStore có (đang bán): ${count((r) => r.verdict === "Chỉ LienStore có")}`);
console.log(`So giá (${priced.length} cặp): LienStore đắt hơn ${count((r) => r.verdict.startsWith("LienStore đắt"))} · rẻ hơn ${count((r) => r.verdict.startsWith("LienStore rẻ"))} · ngang ${count((r) => r.verdict === "Ngang giá")} · chênh trung bình ${avg}% · j86 bán dưới giá vốn của mình: ${count((r) => r.verdict.includes("dưới giá vốn"))}`);
console.log(`→ ${path.relative(process.cwd(), outPath)}`);
