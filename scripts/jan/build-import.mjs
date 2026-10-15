#!/usr/bin/env node
/**
 * Merge what we know about JAN codes into one import file for `lienstore barcodes import`.
 *
 *   node scripts/jan/build-import.mjs <prod-products.json|-> data/jan/extracted*.json data/jan/pilot-result.json data/jan/lookup/*.json
 *
 * Inputs: extract-jan.mjs outputs ({ found: [...] }) and web-lookup arrays ([{ productId, code, confidence, … }]).
 * Policy: codes from the shop's own text / SKU and lookups with confidence high | medium are imported; low / none are
 * listed for review only. A code proposed for two different products is NOT imported (review). With the prod product
 * list (from `lienstore products list --all-pages`), ids that no longer exist on prod are dropped.
 * Writes data/jan/import.json (items) and data/jan/review.json (everything not imported, with reasons).
 */
import fs from "node:fs";

const [prodFile, ...inputs] = process.argv.slice(2);
const validGtin = (c) => {
  if (!/^\d{8}$|^\d{13}$/.test(c)) return false;
  const b = c.slice(0, -1);
  let s = 0;
  for (let i = 0; i < b.length; i++) s += (i % 2 === 0 ? 3 : 1) * Number(b[b.length - 1 - i]);
  return (10 - (s % 10)) % 10 === Number(c.slice(-1));
};
const prod = prodFile && prodFile !== "-" ? (() => {
  const raw = JSON.parse(fs.readFileSync(prodFile, "utf8"));
  return new Map((Array.isArray(raw) ? raw : raw.data).map((p) => [p.id, p]));
})() : null;

// optional: status of products when no prod list is given (local snapshot)
let localStatus = null;
if (!prod && process.env.LOCAL_STATUS) localStatus = new Map(JSON.parse(fs.readFileSync(process.env.LOCAL_STATUS, "utf8")).map((p) => [p.id, p.status]));
const proposals = []; // { productId, code, source, confidence, evidence, note }
for (const f of inputs) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  if (Array.isArray(j))
    for (const r of j) {
      proposals.push({ productId: r.productId, code: r.code, source: `web:${f.split("/").pop()}`, confidence: r.confidence, evidence: (r.evidence ?? []).join(" "), note: r.note ?? "", matchedTitle: r.matchedTitle ?? "" });
      // older / newer packaging of the same item: an extra code on the same product (old stock still carries it)
      for (const a of r.altCodes ?? []) if (a?.code) proposals.push({ productId: r.productId, code: a.code, source: `web:${f.split("/").pop()}:alt`, confidence: r.confidence, evidence: (r.evidence ?? []).join(" "), note: a.note ?? "", alt: true });
    }
  else for (const r of j.found ?? []) proposals.push({ productId: r.productId, code: r.code, source: r.source, confidence: "shop-data", evidence: r.evidence, note: "" });
}

const review = [];
const byProduct = new Map();
for (const p of proposals) {
  if (prod && !prod.has(p.productId)) {
    review.push({ ...p, reason: "product not on prod" });
    continue;
  }
  if (!p.code) {
    review.push({ ...p, reason: "no code found" });
    continue;
  }
  if (!validGtin(p.code)) {
    review.push({ ...p, reason: "bad check digit" });
    continue;
  }
  if (!["shop-data", "high", "medium"].includes(p.confidence)) {
    review.push({ ...p, reason: `confidence ${p.confidence}` });
    continue;
  }
  const list = byProduct.get(p.productId) ?? [];
  if (!list.some((x) => x.code === p.code)) list.push(p);
  byProduct.set(p.productId, list);
}
const items = [];
const byCode = new Map();
const add = (productId, x, kind) => {
  items.push({ productId, code: x.code, note: `${x.source} ${x.confidence}${kind === "alt" ? " (bao bì khác)" : ""}${x.evidence ? ` ${x.evidence}` : ""}`.slice(0, 200), confidence: x.confidence, kind, name: prod?.get(productId)?.name ?? "" });
  byCode.set(x.code, [...(byCode.get(x.code) ?? []), productId]);
};
for (const [productId, list] of byProduct) {
  // the shop's own data wins over a web lookup when they disagree, but the disagreement goes to review
  const mains = list.filter((x) => !x.alt);
  const shop = mains.find((x) => x.confidence === "shop-data");
  const pick = shop ?? mains.find((x) => x.confidence === "high") ?? mains[0];
  if (!pick) {
    for (const x of list) review.push({ ...x, reason: "alt code without a main code" });
    continue;
  }
  add(productId, pick, "main");
  for (const x of mains) if (x !== pick) review.push({ ...x, reason: `other code proposed; kept ${pick.code} (${pick.source})` });
  for (const x of list.filter((x) => x.alt && x.code !== pick.code)) add(productId, x, "alt");
}
// one code proposed for several products (mostly the same item listed twice, a live copy + a draft): keep ONE —
// the shop's own text beats a web lookup, then a published product beats a draft; otherwise nobody gets it (review)
const statusOf = (id) => prod?.get(id)?.status ?? localStatus?.get(id) ?? "";
const shared = new Set();
const winners = new Map();
for (const [code, ids] of byCode) {
  if (ids.length < 2) continue;
  const cands = items.filter((i) => i.code === code);
  const rank = (i) => (i.confidence === "shop-data" ? 4 : 0) + (statusOf(i.productId) === "publish" ? 2 : 0) + (i.kind === "main" ? 1 : 0);
  const best = [...cands].sort((a, b) => rank(b) - rank(a));
  if (rank(best[0]) > rank(best[1])) winners.set(code, best[0].productId);
  else shared.add(code);
}
const final = items.filter((i) => !shared.has(i.code) && (!winners.has(i.code) || winners.get(i.code) === i.productId));
for (const i of items.filter((i) => shared.has(i.code))) review.push({ ...i, reason: `same code proposed for products ${byCode.get(i.code).join(", ")} — catalogue duplicate? decide which product keeps it` });
for (const i of items.filter((i) => winners.has(i.code) && winners.get(i.code) !== i.productId)) review.push({ ...i, reason: `duplicate of product ${winners.get(i.code)} (that one got the code)` });
fs.mkdirSync("data/jan", { recursive: true });
fs.writeFileSync("data/jan/import.json", `${JSON.stringify(final, null, 1)}\n`);
fs.writeFileSync("data/jan/review.json", `${JSON.stringify(review, null, 1)}\n`);
const conf = {};
for (const i of final) conf[i.confidence] = (conf[i.confidence] ?? 0) + 1;
console.log(JSON.stringify({ proposals: proposals.length, import: final.length, byConfidence: conf, review: review.length, sharedUnresolved: shared.size, duplicatesResolved: winners.size, prodProducts: prod?.size ?? null }));
