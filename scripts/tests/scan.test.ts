/**
 * Quét mã (phone scanning) — codes, input pipeline, resolution, documents — on a throw-away COPY of the local DB:
 *   npm run test:scan
 * See docs/architecture/mobile-scanning.md.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { canonicalGtin, gs1CheckDigit, isValidGtin, linkableCode, parseScannedCode } from "../../src/lib/barcodes";
import { PresenceGate, WedgeBuffer } from "../../src/lib/scan-input";
import { unitCode } from "../../src/lib/units";

const root = path.resolve(__dirname, "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lien-scan-"));
const source = process.env.LIEN_TEST_DB_SOURCE ?? path.join(root, "data", "lienstore.db");
if (fs.existsSync(source)) fs.copyFileSync(source, path.join(tmp, "lienstore.db"));
process.env.LIEN_DB_PATH = path.join(tmp, "lienstore.db");
process.env.LIEN_UPLOAD_DIR = path.join(tmp, "uploads");

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// ---------------------------------------------------------------------------------------------------------------------
describe("code normalisation (pure)", () => {
  it("validates GS1 check digits and keeps leading zeros as text", () => {
    assert.equal(gs1CheckDigit("496198940913"), 9);
    assert.ok(isValidGtin("4961989409139"));
    assert.ok(!isValidGtin("4961989409138"));
    const p = parseScannedCode("0049000006582"); // EAN-13 with two leading zeros
    assert.equal(p.kind, "gtin");
    if (p.kind === "gtin") assert.equal(p.code, "0049000006582");
    assert.equal(typeof (p as { code: string }).code, "string");
  });
  it("maps UPC-A and GTIN-14 (leading 0) to the same EAN-13; EAN-8 and ITF-14 stay apart", () => {
    const upc = parseScannedCode("036000291452");
    const ean = parseScannedCode("0036000291452");
    const g14 = parseScannedCode("00036000291452");
    assert.equal(upc.kind, "gtin");
    assert.equal((upc as { code: string }).code, "0036000291452");
    assert.equal((ean as { code: string }).code, "0036000291452");
    assert.equal((g14 as { code: string }).code, "0036000291452");
    assert.equal((parseScannedCode("96385074") as { code: string; symbology: string }).symbology, "ean8");
    // a real GTIN-14 (packaging indicator 1) is a different item from its EAN-13
    const case14 = canonicalGtin("10036000291459");
    assert.ok(case14 && case14.symbology === "itf14" && case14.code === "10036000291459");
    // 11 digits is not a GTIN: kept as a text code, never padded into one
    assert.equal(parseScannedCode("36000291452").kind, "text");
  });
  it("rejects wrong check digits instead of guessing", () => {
    assert.equal(parseScannedCode("4961989409138").kind, "invalid");
    assert.equal(parseScannedCode("036000291453").kind, "invalid");
    assert.equal(parseScannedCode("96385075").kind, "invalid");
  });
  it("reads unit codes (Damm check) typed or scanned, and internal QR payloads", () => {
    const c = unitCode(1234);
    assert.deepEqual(parseScannedCode(c.toLowerCase()), { kind: "unit", code: c, symbology: "unit", raw: c.toLowerCase() });
    assert.equal(parseScannedCode(`${c.slice(0, -1)}${(Number(c.slice(-1)) + 1) % 10}`).kind, "invalid");
    assert.equal(parseScannedCode(`LS1:U:${c}`).kind, "unit");
    assert.deepEqual(parseScannedCode("LS1:P:2710"), { kind: "product_ref", productId: 2710, raw: "LS1:P:2710" });
    assert.equal(parseScannedCode("LS2:U:H0000000").kind, "unsupported_qr");
    assert.equal(parseScannedCode("https://evil.example/pay").kind, "unsupported_qr");
    assert.equal(parseScannedCode("WIFI:S:x;;").kind, "unsupported_qr");
  });
  it("cleans scanner noise, limits length, keeps text codes as typed", () => {
    assert.equal((parseScannedCode("4961989409139\r\n") as { code: string }).code, "4961989409139");
    assert.equal((parseScannedCode("]E04961989409139") as { code: string }).code, "4961989409139");
    assert.equal(parseScannedCode("x".repeat(200)).kind, "invalid");
    assert.equal(parseScannedCode("   ").kind, "invalid");
    assert.deepEqual(parseScannedCode("DHC-SK-2601-0007"), { kind: "text", code: "DHC-SK-2601-0007", symbology: "text", raw: "DHC-SK-2601-0007" });
    assert.equal(parseScannedCode("mã có dấu").kind, "invalid");
    assert.ok("error" in linkableCode(unitCode(5)));
  });
});

describe("scan input pipeline (pure)", () => {
  it("a code held in front of the camera is reported once, again only after leaving the frame", () => {
    const g = new PresenceGate(1000);
    const emitted: string[] = [];
    for (let t = 0; t <= 5000; t += 100) emitted.push(...g.observe(["4961989409139"], t)); // 51 frames, same code
    assert.deepEqual(emitted, ["4961989409139"]);
    assert.deepEqual(g.observe([], 5500), []);
    assert.deepEqual(g.observe(["4961989409139"], 6200), ["4961989409139"], "gone > 1 s, then back → counts again");
    assert.deepEqual(g.observe(["4961989409139"], 6300), []);
    g.forget("4961989409139"); // "Quét lại"
    assert.deepEqual(g.observe(["4961989409139"], 6400), ["4961989409139"]);
    assert.deepEqual(g.observe(["A", "B", "A"], 7000), ["A", "B"]);
  });
  it("keyboard-wedge scanners (fast keys + Enter) are recognised, people typing are not", () => {
    const w = new WedgeBuffer();
    let t = 0;
    let out: string | null = null;
    for (const ch of "4961989409139") out = w.feed(ch, (t += 8));
    assert.equal(out, null);
    assert.equal(w.feed("Enter", (t += 8)), "4961989409139");
    for (const ch of "4961") w.feed(ch, (t += 300));
    assert.equal(w.feed("Enter", (t += 300)), null, "slow typing is not a scan");
    w.feed("1", (t += 5));
    assert.equal(w.feed("Enter", (t += 5)), null, "too short");
    assert.equal(w.feed("Shift", (t += 5)), null);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
type Barcodes = typeof import("../../src/lib/barcodes-db");
type Db = typeof import("../../src/lib/db");
type Sqlite = typeof import("../../src/lib/sqlite");
let bc: Barcodes;
let db: Db;
let sqlite: Sqlite;
const ctx = { actor: "test" };

before(async () => {
  sqlite = await import("../../src/lib/sqlite");
  db = await import("../../src/lib/db");
  bc = await import("../../src/lib/barcodes-db");
});

/** Two fresh products in one category, made for the test. */
async function twoProducts(tag: string) {
  const cat = (await db.getCategories())[0].slug;
  const mk = (n: string) => db.saveProduct({ slug: `scan-${tag}-${n}-${Date.now()}`, name: `Scan ${tag} ${n}`, nameJa: "", price: 1000, regularPrice: null, marketPrice: null, costPrice: null, supplierUrl: null, minStock: null, weightG: null, dimsCm: null, dimsConfidence: null, dimsSource: "", currency: "VNĐ", sku: null, stock: null, stockStatus: "instock", fulfillment: "order", costJpy: null, costSource: "", costUrl: "", costCheckedAt: null, marginPct: null, categories: [cat], tags: [], images: [], hot: false, labelId: null, label: null, thumb: "", shortDescription: "", description: "", shortDescriptionJa: "", descriptionJa: "", related: [], rating: null, reviewCount: 0, status: "draft" });
  return [await mk("a"), await mk("b")];
}

describe("barcode links and resolution (DB)", () => {
  it("migration 74 backfilled unique GTIN SKUs only", () => {
    const d = sqlite.getDb();
    const dupSkus = d.prepare("SELECT sku FROM products WHERE sku GLOB '[0-9]*' GROUP BY sku HAVING COUNT(*) > 1").all() as Array<{ sku: string }>;
    for (const r of dupSkus) assert.equal((d.prepare("SELECT COUNT(*) AS n FROM product_barcodes WHERE code = ? AND source = 'sku'").get(r.sku) as { n: number }).n, 0);
  });
  it("links a code (with pack size), resolves it, and refuses the same code for another product", async () => {
    const [a, b] = await twoProducts("link");
    const code = "4900000000009"; // valid EAN-13
    assert.ok(isValidGtin(code));
    const r1 = bc.linkBarcode({ productId: a.id, code, packQty: 12, packLabel: "thùng" }, ctx);
    assert.equal(r1.status, "created");
    assert.equal(bc.linkBarcode({ productId: a.id, code, packQty: 12, packLabel: "thùng" }, ctx).status, "unchanged", "idempotent");
    const res = bc.resolveCode(code);
    assert.equal(res.kind, "product");
    if (res.kind === "product") {
      assert.equal(res.product.id, a.id);
      assert.equal(res.packQty, 12);
      assert.equal(res.via, "barcode");
    }
    assert.throws(() => bc.linkBarcode({ productId: b.id, code }, ctx), (e: unknown) => (e as { code: string }).code === "CODE_LINKED_ELSEWHERE");
    // after unlinking, the other product may take it
    bc.unlinkBarcode(r1.link.id, ctx);
    assert.equal(bc.resolveCode(code).kind, "unknown");
    assert.equal(bc.linkBarcode({ productId: b.id, code }, ctx).status, "created");
    assert.equal((bc.resolveCode(code) as { product: { id: number } }).product.id, b.id);
  });
  it("UPC-A typed or scanned finds the product whose SKU holds the 12-digit form", async () => {
    const [a] = await twoProducts("upc");
    await db.updateProductSku(a.id, "036000291452");
    const r = bc.resolveCode("0036000291452");
    assert.equal(r.kind, "product");
    assert.equal((r as { product: { id: number }; via: string }).product.id, a.id);
    assert.equal((r as { via: string }).via, "sku");
  });
  it("duplicate SKUs are a conflict, never 'the first product'; an explicit link settles it", async () => {
    const [a, b] = await twoProducts("dup");
    const code = "4911111111119";
    assert.ok(isValidGtin(code));
    await db.updateProductSku(a.id, code);
    await db.updateProductSku(b.id, code);
    const r = bc.resolveCode(code);
    assert.equal(r.kind, "conflict");
    if (r.kind === "conflict") assert.deepEqual(r.candidates.map((c) => c.id).sort(), [a.id, b.id].sort());
    assert.throws(() => bc.linkBarcode({ productId: a.id, code }, ctx), (e: unknown) => (e as { code: string }).code === "CODE_IS_SKU_OF_OTHER");
    bc.linkBarcode({ productId: a.id, code, force: true }, ctx);
    const r2 = bc.resolveCode(code);
    assert.equal(r2.kind, "product");
    assert.equal((r2 as { product: { id: number }; warnings: string[] }).product.id, a.id);
    assert.ok((r2 as { warnings: string[] }).warnings.length > 0);
  });
  it("unknown, invalid, unit and QR codes resolve to the right kind", async () => {
    assert.equal(bc.resolveCode("4922222222229").kind, "unknown");
    assert.equal(bc.resolveCode("4961989409138").kind, "invalid");
    assert.equal(bc.resolveCode("https://x.example").kind, "unsupported_qr");
    const [a] = await twoProducts("unit");
    const { createUnitsSync, touchSync } = await import("../../src/lib/units-db");
    const d = sqlite.getDb();
    const ids = sqlite.withTransaction(d, () => {
      const made = createUnitsSync(d, { productId: a.id, qty: 1, status: "at_shop", origin: "manual" });
      touchSync(d, { unitIds: made });
      return made;
    });
    const code = unitCode(ids[0]);
    const r = bc.resolveCode(`LS1:U:${code}`);
    assert.equal(r.kind, "unit");
    if (r.kind === "unit") {
      assert.equal(r.product.id, a.id);
      assert.equal(r.unit.warehouse, "vn");
    }
    assert.equal(bc.resolveCode(unitCode(99999990)).kind, "unknown");
    assert.equal(bc.resolveCode(`LS1:P:${a.id}`).kind, "product");
    const st = bc.getProductStock(a.id, { seePrices: false });
    assert.equal(st.places.find((p) => p.warehouse === "vn")!.total, 1);
    assert.equal(st.price, undefined, "no prices without see_prices");
  });
  it("pack size must be a sane integer", async () => {
    const [a] = await twoProducts("pack");
    assert.throws(() => bc.linkBarcode({ productId: a.id, code: "4933333333339", packQty: 0 }, ctx));
    assert.throws(() => bc.linkBarcode({ productId: a.id, code: "4933333333339", packQty: 1.5 }, ctx));
  });
});

describe("self-hosted ZXing WASM", () => {
  it("public copy matches the installed zxing-wasm build used by barcode-detector", async () => {
    const { createHash } = await import("node:crypto");
    const detector = fs.readFileSync(path.join(root, "src/components/sites/lienstore/admin/scan/detector.ts"), "utf8");
    const url = /ZXING_WASM_URL = "([^"]+)"/.exec(detector)![1];
    const served = fs.readFileSync(path.join(root, "public", url));
    const zxing = (await import("zxing-wasm/reader")) as { ZXING_WASM_SHA256: string; ZXING_WASM_VERSION: string };
    assert.equal(createHash("sha256").update(served).digest("hex"), zxing.ZXING_WASM_SHA256, `re-copy node_modules/zxing-wasm/dist/reader/zxing_reader.wasm to public${url} (and rename to the new version)`);
    assert.ok(url.includes(zxing.ZXING_WASM_VERSION));
  });
});
