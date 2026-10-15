#!/usr/bin/env node
/**
 * Find the JAN / EAN printed on each product from what the catalogue already says (descriptions, SKU).
 *
 *   npm run -s lienstore -- --profile prod products list --all-pages --status all \
 *     --fields id,name,nameJa,sku,shortDescription,description,descriptionJa > /tmp/products.json
 *   node scripts/jan/extract-jan.mjs /tmp/products.json data/jan/extracted.json
 *
 * Output: { found: [{ productId, code, source, evidence }], ambiguous: [...], duplicates: [...], missing: [...] }
 * Only codes with a valid GS1 check digit are kept; "found" = exactly one JAN for the product, from a labelled place
 * ("JAN: …" in the text, or the SKU). Nothing is written to the shop — feed "found" to `lienstore barcodes import`.
 */
import fs from "node:fs";

const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) {
  console.error("usage: extract-jan.mjs <products.json from `lienstore products list`> <out.json>");
  process.exit(2);
}
const raw = JSON.parse(fs.readFileSync(inFile, "utf8"));
const products = Array.isArray(raw) ? raw : raw.data;

export function validGtin(c) {
  if (!/^\d{8}$|^\d{12,14}$/.test(c)) return false;
  const b = c.slice(0, -1);
  let s = 0;
  for (let i = 0; i < b.length; i++) s += (i % 2 === 0 ? 3 : 1) * Number(b[b.length - 1 - i]);
  return (10 - (s % 10)) % 10 === Number(c.slice(-1));
}
const canon = (c) => (c.length === 12 ? `0${c}` : c.length === 14 && c.startsWith("0") ? c.slice(1) : c);
const text = (html) =>
  String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, " ");
// a code next to its label: "JAN: 4901234567894", "JANコード：…", "Mã vạch 490…", "EAN 13: …"
const LABELLED = /(?:JAN|ＪＡＮ|EAN(?:[\s-]*13)?|バーコード|商品コード|mã vạch|ma vach)[^0-9]{0,24}((?:\d[\s-]?){8,14})/gi;

const found = [];
const ambiguous = [];
const missing = [];
for (const p of products) {
  const body = [p.description, p.descriptionJa, p.shortDescription].map(text).join(" | ");
  const fromText = new Map();
  for (const m of body.matchAll(LABELLED)) {
    const digits = m[1].replace(/[\s-]/g, "");
    for (const len of [13, 8, 12, 14]) {
      const c = digits.slice(0, len);
      if (c.length === len && validGtin(c)) {
        fromText.set(canon(c), body.slice(Math.max(0, m.index - 10), m.index + m[0].length + 5).trim());
        break;
      }
    }
  }
  const fromSku = new Map();
  for (const m of String(p.sku ?? "").matchAll(/(?<!\d)(\d{13}|\d{12}|\d{8})(?!\d)/g)) if (validGtin(m[1])) fromSku.set(canon(m[1]), `SKU ${p.sku}`);
  const all = new Map([...fromSku, ...fromText]);
  const base = { productId: p.id, name: p.name, nameJa: p.nameJa ?? "" };
  if (all.size === 1) {
    const [[code, evidence]] = [...all];
    found.push({ ...base, code, source: fromText.has(code) ? (fromSku.has(code) ? "description+sku" : "description") : "sku", evidence });
  } else if (all.size > 1) ambiguous.push({ ...base, codes: [...all].map(([code, evidence]) => ({ code, evidence })) });
  else missing.push({ ...base, sku: p.sku ?? null });
}
// one JAN on several products = a copy-paste error somewhere (or true duplicates): never auto-link those
const byCode = new Map();
for (const f of found) byCode.set(f.code, [...(byCode.get(f.code) ?? []), f]);
const duplicates = [...byCode].filter(([, l]) => l.length > 1).map(([code, l]) => ({ code, products: l.map((x) => ({ productId: x.productId, name: x.name })) }));
const dupCodes = new Set(duplicates.map((d) => d.code));
const clean = found.filter((f) => !dupCodes.has(f.code));
fs.mkdirSync(new URL(".", `file://${process.cwd()}/${outFile}`).pathname, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), total: products.length, found: clean, ambiguous, duplicates, missing }, null, 1)}\n`);
console.log(JSON.stringify({ total: products.length, found: clean.length, ambiguous: ambiguous.length, duplicateCodes: duplicates.length, missing: missing.length }));
