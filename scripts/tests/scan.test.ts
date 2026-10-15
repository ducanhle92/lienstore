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
  it("Bluetooth HID timing (~90 ms per key, iOS) is still a scan; inside a field only long codes count", () => {
    const w = new WedgeBuffer();
    let t = 0;
    for (const ch of "4961989409139") w.feed(ch, (t += 90));
    assert.equal(w.feed("Enter", (t += 90)), "4961989409139");
    for (const ch of "1200") w.feed(ch, (t += 40));
    assert.equal(w.feed("Enter", (t += 40), 8), null, "a quantity typed quickly in a field is not a scan");
    for (const ch of "H0001235") w.feed(ch, (t += 20));
    assert.equal(w.feed("Enter", (t += 20), 8), "H0001235");
    assert.equal(w.empty, true);
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

// ---------------------------------------------------------------------------------------------------------------------
// Scan documents: receive / count / pick

type Docs = typeof import("../../src/lib/scan-docs");
type UnitsDb = typeof import("../../src/lib/units-db");
let docs: Docs;
let units: UnitsDb;
let owner: { actor: string; permissions: string[] };
before(async () => {
  docs = await import("../../src/lib/scan-docs");
  units = await import("../../src/lib/units-db");
  const { effectivePermissions } = await import("../../src/lib/permissions");
  owner = { actor: "Tester (owner)", permissions: effectivePermissions("owner", []) };
});

let opSeq = 0;
const op = () => `op-test-${Date.now()}-${++opSeq}`;
const errCode = (code: string) => (e: unknown) => (e as { code?: string }).code === code;
let eanSeq = 0;
/** A fresh valid EAN-13 for each call (2 = "in-store" prefix, never a real product). */
const freshEan = () => {
  const body = `2${String(Date.now() % 1e7).padStart(7, "0")}${String(++eanSeq).padStart(4, "0")}`;
  return `${body}${gs1CheckDigit(body)}`;
};

/** `qty` units of a product at a place, optionally boxed in a shipment. */
function makeUnits(productId: number, qty: number, status: "at_shop" | "bought" | "shipped_jp_vn" | "at_carrier_vn", extra: { expiry?: string } = {}) {
  const d = sqlite.getDb();
  return sqlite.withTransaction(d, () => {
    const ids = units.createUnitsSync(d, { productId, qty, status, origin: "manual", expiry: extra.expiry ?? null });
    units.touchSync(d, { unitIds: ids });
    return ids;
  });
}
const total = (productId: number, status: string) => Number((sqlite.getDb().prepare("SELECT COUNT(*) AS n FROM stock_units WHERE product_id = ? AND removed IS NULL AND status = ?").get(productId, status) as { n: number }).n);

describe("receive — new goods (direct)", () => {
  it("draft scans change nothing in stock; confirm creates the units once", async () => {
    const [a, b] = await twoProducts("rcv");
    bc.linkBarcode({ productId: a.id, code: "4955555555559", packQty: 6, packLabel: "hộp" }, ctx);
    await db.updateProductSku(b.id, "4966666666669");
    const doc = docs.createDoc("receive", { warehouse: "vn", mode: "direct" }, owner);
    assert.equal(doc.status, "draft");
    const s1 = docs.scanIntoDoc("receive", doc.id, { code: "4955555555559", opId: op() }, owner);
    assert.equal(s1.op.delta, 6, "one box = 6 units");
    docs.scanIntoDoc("receive", doc.id, { code: "4966666666669", opId: op(), qty: 3 }, owner);
    assert.equal(total(a.id, "at_shop"), 0, "a draft never touches stock");
    const lineA = docs.getDoc("receive", doc.id).lines.find((l) => l.product.id === a.id)!;
    const v1 = docs.updateLine("receive", doc.id, lineA.id, { rev: lineA.rev, expiry: "2027-03", unitCostJpy: 500 }, owner);
    const r = docs.confirmDoc("receive", doc.id, { version: v1.version }, owner);
    assert.equal(r.alreadyConfirmed, false);
    assert.equal(total(a.id, "at_shop"), 6);
    assert.equal(total(b.id, "at_shop"), 3);
    const unitA = sqlite.getDb().prepare("SELECT expiry, unit_cost_jpy, origin FROM stock_units WHERE product_id = ? LIMIT 1").get(a.id) as { expiry: string; unit_cost_jpy: number; origin: string };
    assert.deepEqual({ ...unitA }, { expiry: "2027-03-31", unit_cost_jpy: 500, origin: "manual" });
    // the same confirm again (lost response, retry) returns the stored result and does not add units
    const again = docs.confirmDoc("receive", doc.id, { version: v1.version }, owner);
    assert.equal(again.alreadyConfirmed, true);
    assert.equal(total(a.id, "at_shop"), 6);
    assert.throws(() => docs.scanIntoDoc("receive", doc.id, { code: "4955555555559", opId: op() }, owner), errCode("DOC_NOT_DRAFT"));
    assert.equal((await db.getProductById(a.id))!.stock, 6, "storefront stock follows the units");
  });
  it("a retried scan (same opId) is applied once; the same opId with another code is refused", async () => {
    const [a] = await twoProducts("retry");
    await db.updateProductSku(a.id, "4977777777779");
    const doc = docs.createDoc("receive", { warehouse: "jp", mode: "direct" }, owner);
    const id = op();
    const r1 = docs.scanIntoDoc("receive", doc.id, { code: "4977777777779", opId: id }, owner);
    const r2 = docs.scanIntoDoc("receive", doc.id, { code: "4977777777779", opId: id }, owner);
    assert.equal(r2.op.replayed, true);
    assert.equal(r2.doc.lines[0].qty, 1);
    assert.equal(r1.op.lineId, r2.op.lineId);
    assert.throws(() => docs.scanIntoDoc("receive", doc.id, { code: "4977777777779", opId: id, qty: 2 }, owner), errCode("OP_ID_REUSED"));
    // deliberate second scan = new opId = +1
    assert.equal(docs.scanIntoDoc("receive", doc.id, { code: "4977777777779", opId: op() }, owner).doc.lines[0].qty, 2);
    // undo the last one
    assert.equal(docs.undoScan("receive", doc.id, {}, owner).doc.lines[0].qty, 1);
  });
  it("two phones: absolute edits need the line rev; confirm needs the document version", async () => {
    const [a] = await twoProducts("phones");
    await db.updateProductSku(a.id, "4988888888889");
    const doc = docs.createDoc("receive", { warehouse: "vn", mode: "direct" }, owner);
    const seen = docs.scanIntoDoc("receive", doc.id, { code: "4988888888889", opId: op() }, owner).doc;
    const line = seen.lines[0];
    docs.updateLine("receive", doc.id, line.id, { rev: line.rev, qty: 5 }, owner); // phone 1
    assert.throws(() => docs.updateLine("receive", doc.id, line.id, { rev: line.rev, qty: 7 }, owner), errCode("LINE_CHANGED")); // phone 2, stale
    docs.scanIntoDoc("receive", doc.id, { code: "4988888888889", opId: op() }, owner); // phone 2 scans (commutative)
    assert.throws(() => docs.confirmDoc("receive", doc.id, { version: seen.version }, owner), errCode("DOC_CHANGED"));
    const fresh = docs.getDoc("receive", doc.id);
    assert.equal(fresh.lines[0].qty, 6);
    docs.confirmDoc("receive", doc.id, { version: fresh.version }, owner);
    assert.equal(total(a.id, "at_shop"), 6);
  });
  it("refuses unknown / conflicting / unit codes, wrong warehouse rights, bad quantities", async () => {
    const doc = docs.createDoc("receive", { warehouse: "vn", mode: "direct" }, owner);
    assert.throws(() => docs.scanIntoDoc("receive", doc.id, { code: "4922222222229", opId: op() }, owner), errCode("UNKNOWN_CODE"));
    assert.throws(() => docs.scanIntoDoc("receive", doc.id, { code: "4961989409138", opId: op() }, owner), errCode("INVALID_CODE"));
    assert.throws(() => docs.scanIntoDoc("receive", doc.id, { code: "4911111111119", opId: op(), qty: 0 }, owner), errCode("VALIDATION_FAILED"));
    assert.throws(() => docs.scanIntoDoc("receive", doc.id, { code: "4911111111119", opId: "x" }, owner), errCode("VALIDATION_FAILED"));
    const [a] = await twoProducts("unitrcv");
    const [uid] = makeUnits(a.id, 1, "at_shop");
    assert.throws(() => docs.scanIntoDoc("receive", doc.id, { code: unitCode(uid), opId: op() }, owner), errCode("UNIT_ALREADY_IN_STOCK"));
    const vnOnly = { actor: "staff vn", permissions: ["kho_vn", "inventory"] };
    assert.throws(() => docs.createDoc("receive", { warehouse: "jp", mode: "direct" }, vnOnly), errCode("WAREHOUSE_FORBIDDEN"));
    assert.throws(() => docs.scanIntoDoc("receive", docs.createDoc("receive", { warehouse: "jp", mode: "direct" }, owner).id, { code: "4911111111119", opId: op() }, vnOnly), errCode("WAREHOUSE_FORBIDDEN"));
    assert.throws(() => docs.confirmDoc("receive", doc.id, { version: docs.getDoc("receive", doc.id).version }, owner), errCode("NOTHING_TO_CONFIRM"));
  });
  it("a failing confirm leaves stock and document untouched (one transaction)", async () => {
    const [a] = await twoProducts("atomic");
    await db.updateProductSku(a.id, "4999999999999");
    const doc = docs.createDoc("receive", { warehouse: "vn", mode: "direct" }, owner);
    docs.scanIntoDoc("receive", doc.id, { code: "4999999999999", opId: op(), qty: 2 }, owner);
    const v = docs.getDoc("receive", doc.id);
    docs.updateLine("receive", doc.id, v.lines[0].id, { rev: v.lines[0].rev, billCode: "BILL-TEST-1" }, owner);
    // make the second step fail: a trigger that aborts unit creation for this product
    const d = sqlite.getDb();
    d.exec(`CREATE TEMP TRIGGER boom BEFORE INSERT ON stock_units WHEN NEW.product_id = ${a.id} BEGIN SELECT RAISE(ABORT, 'boom'); END`);
    try {
      assert.throws(() => docs.confirmDoc("receive", doc.id, { version: docs.getDoc("receive", doc.id).version }, owner), /boom/);
    } finally {
      d.exec("DROP TRIGGER IF EXISTS temp.boom");
    }
    assert.equal(docs.getDoc("receive", doc.id).status, "draft");
    assert.equal(total(a.id, "at_shop"), 0);
    assert.equal(d.prepare("SELECT COUNT(*) AS n FROM purchase_receipts WHERE code = 'BILL-TEST-1'").get()!.n, 0, "bill created in the failed transaction was rolled back");
  });
});

describe("receive — a packing run arriving at Kho VN (shipment)", () => {
  it("partial receive moves exactly the scanned units; over-receiving and foreign units are refused", async () => {
    const { createShipment, packUnits, setShipmentStatus } = await import("../../src/lib/shipments-db");
    const [a, b] = await twoProducts("ship");
    const shipEan = freshEan();
    await db.updateProductSku(a.id, shipEan);
    const aIds = makeUnits(a.id, 3, "bought");
    const bIds = makeUnits(b.id, 1, "bought");
    const sh = createShipment({ label: "test", plannedAt: null, note: "" });
    packUnits(sh.id, [...aIds, ...bIds]);
    await setShipmentStatus(sh.id, "flying");
    assert.equal(total(a.id, "shipped_jp_vn"), 3);
    const doc = docs.createDoc("receive", { mode: "shipment", shipmentId: sh.id }, owner);
    assert.deepEqual(doc.lines.map((l) => l.expected).sort(), [1, 3]);
    assert.throws(() => docs.createDoc("receive", { mode: "shipment", shipmentId: sh.id }, owner), errCode("DOC_EXISTS"));
    docs.scanIntoDoc("receive", doc.id, { code: unitCode(aIds[1]), opId: op() }, owner);
    assert.equal(docs.scanIntoDoc("receive", doc.id, { code: unitCode(aIds[1]), opId: op() }, owner).op.outcome, "duplicate_unit");
    docs.scanIntoDoc("receive", doc.id, { code: shipEan, opId: op() }, owner);
    assert.throws(() => docs.scanIntoDoc("receive", doc.id, { code: shipEan, opId: op(), qty: 2 }, owner), errCode("OVER_QUANTITY"));
    const [other] = makeUnits(b.id, 1, "at_carrier_vn");
    assert.throws(() => docs.scanIntoDoc("receive", doc.id, { code: unitCode(other), opId: op() }, owner), errCode("UNIT_NOT_IN_SHIPMENT"));
    const r = docs.confirmDoc("receive", doc.id, { version: docs.getDoc("receive", doc.id).version }, owner);
    const res = r.result as { units: number; shipmentDone: boolean; received: Array<{ codes: string[] }> };
    assert.equal(res.units, 2);
    assert.equal(res.shipmentDone, false);
    assert.ok(res.received[0].codes.includes(unitCode(aIds[1])), "the scanned unit itself was received");
    assert.equal(total(a.id, "at_shop"), 2);
    assert.equal(total(b.id, "shipped_jp_vn"), 1, "not scanned = not received");
    // the rest arrives on a second receipt; the run is then done
    const doc2 = docs.createDoc("receive", { mode: "shipment", shipmentId: sh.id }, owner);
    docs.scanIntoDoc("receive", doc2.id, { code: shipEan, opId: op() }, owner);
    docs.scanIntoDoc("receive", doc2.id, { code: unitCode(bIds[0]), opId: op() }, owner);
    const r2 = docs.confirmDoc("receive", doc2.id, { version: docs.getDoc("receive", doc2.id).version }, owner);
    assert.equal((r2.result as { shipmentDone: boolean }).shipmentDone, true);
    assert.equal((sqlite.getDb().prepare("SELECT status FROM shipments WHERE id = ?").get(sh.id) as { status: string }).status, "done");
  });
});

describe("stock count", () => {
  it("not counted ≠ counted 0; difference is applied with the existing stocktake rule", async () => {
    const [a, b] = await twoProducts("count");
    await db.updateProductSku(a.id, "4933333333339");
    makeUnits(a.id, 5, "at_shop");
    makeUnits(b.id, 2, "at_shop");
    const doc = docs.createDoc("count", { warehouse: "vn" }, owner);
    docs.scanIntoDoc("count", doc.id, { code: "4933333333339", opId: op(), qty: 3 }, owner);
    let v = docs.addLine("count", doc.id, { productId: b.id }, owner);
    const lineB = v.lines.find((l) => l.product.id === b.id)!;
    assert.equal(lineB.qty, null);
    assert.equal(lineB.state, "uncounted");
    v = docs.getDoc("count", doc.id);
    const lineA = v.lines.find((l) => l.product.id === a.id)!;
    assert.equal(lineA.expected, 5);
    assert.equal(lineA.message, "Chênh -2");
    const r = docs.confirmDoc("count", doc.id, { version: v.version }, owner);
    const res = r.result as { removed: number; added: number; uncountedIgnored: number };
    assert.equal(res.removed, 2);
    assert.equal(res.uncountedIgnored, 1);
    assert.equal(total(a.id, "at_shop"), 3);
    assert.equal(total(b.id, "at_shop"), 2, "an uncounted product is NOT treated as 0");
    // counted 0 really means 0
    const doc2 = docs.createDoc("count", { warehouse: "vn" }, owner);
    const v2 = docs.addLine("count", doc2.id, { productId: b.id }, owner);
    const l2 = v2.lines[0];
    const v3 = docs.updateLine("count", doc2.id, l2.id, { rev: l2.rev, qty: 0 }, owner);
    docs.confirmDoc("count", doc2.id, { version: v3.version }, owner);
    assert.equal(total(b.id, "at_shop"), 0);
  });
  it("stock moving during the count blocks closing until recounted or accepted", async () => {
    const [a] = await twoProducts("drift");
    await db.updateProductSku(a.id, "4900000000016");
    makeUnits(a.id, 4, "at_shop");
    const doc = docs.createDoc("count", { warehouse: "vn" }, owner);
    docs.scanIntoDoc("count", doc.id, { code: "4900000000016", opId: op(), qty: 4 }, owner);
    makeUnits(a.id, 2, "at_shop"); // goods received while counting
    let v = docs.getDoc("count", doc.id);
    assert.equal(v.lines[0].state, "drift");
    assert.throws(() => docs.confirmDoc("count", doc.id, { version: v.version }, owner), errCode("COUNT_DRIFT"));
    assert.equal(total(a.id, "at_shop"), 6, "nothing applied from the old snapshot");
    // the counter checks again: the 2 new ones were on another shelf, count is 6
    v = docs.updateLine("count", doc.id, v.lines[0].id, { rev: v.lines[0].rev, acceptDrift: true, qty: 6 }, owner);
    assert.equal(v.lines[0].state, "match");
    docs.confirmDoc("count", doc.id, { version: v.version }, owner);
    assert.equal(total(a.id, "at_shop"), 6);
  });
  it("cannot write off units held for orders: closing is blocked for manual handling", async () => {
    const [a] = await twoProducts("held");
    const ids = makeUnits(a.id, 2, "at_shop");
    sqlite.getDb().prepare(`UPDATE stock_units SET shipment_id = -1 WHERE id = ?`).run(ids[0]); // boxed: not adjustable
    const doc = docs.createDoc("count", { warehouse: "vn" }, owner);
    const v = docs.addLine("count", doc.id, { productId: a.id }, owner);
    const v2 = docs.updateLine("count", doc.id, v.lines[0].id, { rev: v.lines[0].rev, qty: 0 }, owner);
    assert.throws(() => docs.confirmDoc("count", doc.id, { version: v2.version }, owner), errCode("COUNT_SHORT_HELD"));
    assert.equal(total(a.id, "at_shop"), 2);
  });
  it("a unit code is counted once however often it is scanned", async () => {
    const [a] = await twoProducts("unitcount");
    const [u] = makeUnits(a.id, 1, "at_shop");
    const doc = docs.createDoc("count", { warehouse: "vn" }, owner);
    for (let i = 0; i < 5; i++) docs.scanIntoDoc("count", doc.id, { code: unitCode(u), opId: op() }, owner);
    assert.equal(docs.getDoc("count", doc.id).lines[0].qty, 1);
  });
});

describe("pick — order check before delivery", () => {
  async function readyOrder(tag: string) {
    const [a, b] = await twoProducts(tag);
    const ean = freshEan();
    await db.updateProductSku(a.id, ean);
    const d = sqlite.getDb();
    const id = `test-order-${tag}-${Date.now()}`;
    const number = 900000 + Math.floor(Math.random() * 99999);
    const ts = new Date().toISOString();
    d.prepare("INSERT INTO orders (id, number, status, payment_method, subtotal, total, created_at, updated_at, stock_committed_at, paid_at, ship_stage) VALUES (?, ?, 'processing', 'bacs', 0, 0, ?, ?, ?, ?, 'vn_warehouse')").run(id, number, ts, ts, ts, ts);
    const ia = Number(d.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, quantity) VALUES (?, ?, ?, ?, 0, 2)").run(id, a.id, a.slug, a.name).lastInsertRowid);
    const ib = Number(d.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, quantity) VALUES (?, ?, ?, ?, 0, 1)").run(id, b.id, b.slug, b.name).lastInsertRowid);
    const aUnits = makeUnits(a.id, 2, "at_shop");
    const bUnits = makeUnits(b.id, 1, "at_shop");
    d.prepare(`UPDATE stock_units SET order_item_id = ?, committed_at = ? WHERE id IN (${aUnits.join(",")})`).run(ia, ts);
    d.prepare("UPDATE stock_units SET order_item_id = ?, committed_at = ? WHERE id = ?").run(ib, ts, bUnits[0]);
    return { id, number, a, b, aUnits, bUnits, ean };
  }

  it("wrong product / unit and over-picking are refused; incomplete picks cannot be completed", async () => {
    const o = await readyOrder("pick1");
    const doc = docs.createDoc("pick", { orderId: o.id }, owner);
    assert.deepEqual(doc.lines.map((l) => l.expected), [2, 1]);
    assert.throws(() => docs.createDoc("pick", { orderId: o.id }, owner), errCode("DOC_EXISTS"));
    const [stranger] = await twoProducts("stranger");
    const [su] = makeUnits(stranger.id, 1, "at_shop");
    assert.throws(() => docs.scanIntoDoc("pick", doc.id, { code: unitCode(su), opId: op() }, owner), errCode("WRONG_PRODUCT"));
    const [freeA] = makeUnits(o.a.id, 1, "at_shop");
    assert.throws(() => docs.scanIntoDoc("pick", doc.id, { code: unitCode(freeA), opId: op() }, owner), errCode("WRONG_UNIT"));
    docs.scanIntoDoc("pick", doc.id, { code: o.ean, opId: op() }, owner);
    docs.scanIntoDoc("pick", doc.id, { code: unitCode(o.aUnits[1]), opId: op() }, owner);
    assert.throws(() => docs.scanIntoDoc("pick", doc.id, { code: o.ean, opId: op() }, owner), errCode("OVER_QUANTITY"));
    const v = docs.getDoc("pick", doc.id);
    assert.ok(v.blockers.length > 0);
    assert.throws(() => docs.confirmDoc("pick", doc.id, { version: v.version }, owner), errCode("PICK_INCOMPLETE"));
    assert.equal(total(o.a.id, "at_shop"), 3, "nothing left the shop");
  });
  it("complete = the ⑦ 'bắt đầu giao' step, exactly once", async () => {
    const o = await readyOrder("pick2");
    const doc = docs.createDoc("pick", { orderId: o.id }, owner);
    docs.scanIntoDoc("pick", doc.id, { code: o.ean, opId: op(), qty: 2 }, owner);
    const v = docs.scanIntoDoc("pick", doc.id, { code: unitCode(o.bUnits[0]), opId: op() }, owner).doc;
    assert.deepEqual(v.blockers, []);
    assert.throws(() => docs.confirmDoc("pick", doc.id, { version: v.version }, owner), errCode("CARRIER_REQUIRED"));
    assert.throws(() => docs.confirmDoc("pick", doc.id, { version: v.version, method: "999999" }, owner), errCode("VALIDATION_FAILED"));
    const r = docs.confirmDoc("pick", doc.id, { version: v.version, method: "pickup", tracking: "GHN-TEST-1" }, owner);
    assert.equal((r.result as { units: number }).units, 3);
    assert.equal((r.result as { carrier: string }).carrier, "Khách tự tới kho lấy");
    const legRow = sqlite.getDb().prepare("SELECT label, tracking, status FROM order_legs WHERE order_id = ? AND leg = 'vn_domestic'").get(o.id) as { label: string; tracking: string; status: string };
    assert.deepEqual({ ...legRow }, { label: "Khách tự tới kho lấy", tracking: "GHN-TEST-1", status: "sent" });
    assert.equal(total(o.a.id, "shipped_to_customer"), 2);
    assert.equal(total(o.b.id, "shipped_to_customer"), 1);
    const order = sqlite.getDb().prepare("SELECT ship_stage FROM orders WHERE id = ?").get(o.id) as { ship_stage: string };
    assert.equal(order.ship_stage, "delivering");
    const events = Number((sqlite.getDb().prepare("SELECT COUNT(*) AS n FROM order_leg_events WHERE order_id = ? AND leg = 'vn_domestic' AND status = 'sent'").get(o.id) as { n: number }).n);
    assert.equal(events, 1);
    assert.equal(docs.confirmDoc("pick", doc.id, { version: v.version }, owner).alreadyConfirmed, true);
    assert.equal(Number((sqlite.getDb().prepare("SELECT COUNT(*) AS n FROM order_leg_events WHERE order_id = ? AND leg = 'vn_domestic' AND status = 'sent'").get(o.id) as { n: number }).n), 1, "not shipped twice");
    // an order already on its way cannot get a new pick
    assert.throws(() => docs.createDoc("pick", { orderId: o.id }, owner), errCode("ORDER_NOT_READY"));
  });
  it("needs the delivery permission", async () => {
    const o = await readyOrder("pick3");
    assert.throws(() => docs.createDoc("pick", { orderId: o.id }, { actor: "kho", permissions: ["kho_vn", "inventory"] }), errCode("FORBIDDEN"));
  });
});
