/**
 * Admin API v1 — service-level tests on a throw-away COPY of the local database (never the real file):
 *   npm run test:admin-api
 * Covers tokens (invalid / expired / revoked / owner removed / scopes), idempotency records, PATCH keeping unsent
 * fields, dry-run writing nothing, version conflicts, duplicate guards, atomic bulk updates, image upload checks, audit.
 * The HTTP + CLI path is exercised by scripts/e2e-admin-api.sh.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const root = path.resolve(__dirname, "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lien-admin-api-"));
const source = process.env.LIEN_TEST_DB_SOURCE ?? path.join(root, "data", "lienstore.db");
if (fs.existsSync(source)) fs.copyFileSync(source, path.join(tmp, "lienstore.db")); // else: seeded from data/seed.json
process.env.LIEN_DB_PATH = path.join(tmp, "lienstore.db");
process.env.LIEN_UPLOAD_DIR = path.join(tmp, "uploads");

type Tokens = typeof import("../../src/lib/api-tokens");
type Format = typeof import("../../src/lib/api-token-format");
type Svc = typeof import("../../src/lib/product-service");
type Db = typeof import("../../src/lib/db");
type Media = typeof import("../../src/lib/media-service");
type Sqlite = typeof import("../../src/lib/sqlite");
let tokens: Tokens;
let format: Format;
let svc: Svc;
let db: Db;
let media: Media;
let sqlite: Sqlite;
let ownerId = "";
const ctx = { actor: "API test (owner)", tokenId: 1 };

/** A product we can freely change: the first one with a category. */
async function sample() {
  const all = await db.getAllProducts(true);
  const p = all.find((x) => x.categories.length > 0 && x.name.length > 3)!;
  assert.ok(p, "the test database needs at least one product with a category");
  return p;
}

before(async () => {
  sqlite = await import("../../src/lib/sqlite");
  db = await import("../../src/lib/db");
  tokens = await import("../../src/lib/api-tokens");
  format = await import("../../src/lib/api-token-format");
  svc = await import("../../src/lib/product-service");
  media = await import("../../src/lib/media-service");
  const owner = (await db.listCustomers()).find((c) => c.role === "owner" && c.active);
  assert.ok(owner, "owner account exists (ensureOwnerAccounts)");
  ownerId = owner.id;
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("token format", () => {
  it("generates lsk_ tokens, stores only a hash, parses Bearer", () => {
    const t = format.generateRawToken();
    assert.match(t, /^lsk_[A-Za-z0-9_-]{43}$/);
    assert.ok(format.looksLikeToken(t));
    assert.equal(format.hashToken(t).length, 64);
    assert.notEqual(format.hashToken(t), format.hashToken(format.generateRawToken()));
    assert.equal(format.bearerFrom(`Bearer ${t}`), t);
    assert.equal(format.bearerFrom(`Basic abc`), null);
    assert.equal(format.bearerFrom(null), null);
    assert.deepEqual(format.sanitizeScopes(["media:write", "x", "products:read"]), ["products:read", "media:write"]);
  });
});

describe("token lifecycle", () => {
  it("authenticates a fresh token and never stores the raw value", async () => {
    const { token, info } = await tokens.createApiToken({ name: "t1", scopes: ["products:read", "products:write"], ownerId, createdBy: "test", expiresAt: null });
    const r = await tokens.authenticateApiToken(token, "127.0.0.1");
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.principal.scopes, ["products:read", "products:write"]);
    const rows = sqlite.getDb().prepare("SELECT * FROM api_tokens WHERE id = ?").all(info.id) as Array<Record<string, unknown>>;
    assert.ok(!JSON.stringify(rows).includes(token), "raw token must not be stored");
    const audit = sqlite.getDb().prepare("SELECT changes FROM api_audit_log").all() as Array<{ changes: string }>;
    assert.ok(!audit.some((a) => a.changes.includes(token)), "raw token must not be in the audit log");
  });
  it("rejects missing, malformed and unknown tokens", async () => {
    assert.equal(((await tokens.authenticateApiToken(null)) as { error: { code: string } }).error.code, "UNAUTHORIZED");
    assert.equal(((await tokens.authenticateApiToken("abc")) as { error: { code: string } }).error.code, "TOKEN_INVALID");
    assert.equal(((await tokens.authenticateApiToken(format.generateRawToken())) as { error: { code: string } }).error.code, "TOKEN_INVALID");
  });
  it("rejects revoked and expired tokens", async () => {
    const a = await tokens.createApiToken({ name: "revoke-me", scopes: ["products:read"], ownerId, createdBy: "test", expiresAt: null });
    assert.ok(await tokens.revokeApiToken(a.info.id, "test"));
    assert.equal(((await tokens.authenticateApiToken(a.token)) as { error: { code: string } }).error.code, "TOKEN_REVOKED");
    const b = await tokens.createApiToken({ name: "expire-me", scopes: ["products:read"], ownerId, createdBy: "test", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    sqlite.getDb().prepare("UPDATE api_tokens SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), b.info.id);
    assert.equal(((await tokens.authenticateApiToken(b.token)) as { error: { code: string } }).error.code, "TOKEN_EXPIRED");
    await assert.rejects(tokens.createApiToken({ name: "past", scopes: ["products:read"], ownerId, createdBy: "test", expiresAt: new Date(Date.now() - 1000).toISOString() }));
  });
  it("follows the owner's permissions: lost module → no scope, locked account → refused", async () => {
    const staff = await db.adminCreateUser({ email: "api-staff@example.test", password: "password-123", role: "staff", permissions: ["products"], username: "apistaff" });
    const t = await tokens.createApiToken({ name: "staff", scopes: ["products:read", "media:write"], ownerId: staff.id, createdBy: "test", expiresAt: null });
    assert.ok((await tokens.authenticateApiToken(t.token)).ok);
    await db.adminUpdateUser(staff.id, { permissions: ["orders"] });
    const r = await tokens.authenticateApiToken(t.token);
    assert.ok(r.ok && r.principal.scopes.length === 0, "scopes drop when the owner loses the products module");
    await db.adminUpdateUser(staff.id, { active: false });
    assert.equal(((await tokens.authenticateApiToken(t.token)) as { error: { code: string } }).error.code, "TOKEN_OWNER_INACTIVE");
    // a staff account without the module cannot be given a token for it
    await db.adminUpdateUser(staff.id, { active: true, permissions: ["orders"] });
    await assert.rejects(tokens.createApiToken({ name: "x", scopes: ["products:write"], ownerId: staff.id, createdBy: "test", expiresAt: null }), /không có quyền/);
  });
});

describe("idempotency records", () => {
  it("new → in progress → replay; another body with the same key is refused", () => {
    const h1 = tokens.requestHash("POST", "/api/admin/v1/products/", '{"a":1}');
    const h2 = tokens.requestHash("POST", "/api/admin/v1/products/", '{"a":2}');
    assert.equal(tokens.beginIdempotent(99, "key-00000001", h1).state, "new");
    assert.equal(tokens.beginIdempotent(99, "key-00000001", h1).state, "in_progress");
    tokens.finishIdempotent(99, "key-00000001", 201, '{"ok":true}');
    const r = tokens.beginIdempotent(99, "key-00000001", h1);
    assert.deepEqual(r, { state: "replay", status: 201, body: '{"ok":true}' });
    assert.equal(tokens.beginIdempotent(99, "key-00000001", h2).state, "mismatch");
    assert.equal(tokens.beginIdempotent(100, "key-00000001", h2).state, "new", "keys are per token");
  });
  it("a 5xx releases the key so the client can retry", () => {
    const h = tokens.requestHash("POST", "/x", "{}");
    tokens.beginIdempotent(99, "key-5xx-0001", h);
    tokens.finishIdempotent(99, "key-5xx-0001", 500, "{}");
    assert.equal(tokens.beginIdempotent(99, "key-5xx-0001", h).state, "new");
  });
});

describe("write input parsing", () => {
  it("rejects unknown and read-only fields, wrong types", () => {
    const r = svc.parseWriteInput({ prize: 1, stock: 3, price: "185000", name: "ok", status: "hidden", categories: "a" });
    assert.ok(r.fields.prize?.includes("không tồn tại"));
    assert.ok(r.fields.stock?.includes("chỉ đọc"));
    assert.ok(r.fields.price);
    assert.ok(r.fields.status);
    assert.ok(r.fields.categories);
    assert.equal(r.input.name, "ok");
  });
  it("keeps leading zeros and text of codes", () => {
    const r = svc.parseWriteInput({ sku: " 0049619894 " });
    assert.equal(r.input.sku, "0049619894");
  });
});

describe("product update (PATCH)", () => {
  it("changes only the sent fields", async () => {
    const p = await sample();
    const r = await svc.updateProduct(p.id, { price: 185000 }, {}, ctx);
    const after = (await db.getProductById(p.id))!;
    assert.equal(r.product.price, 185000);
    assert.equal(after.name, p.name);
    assert.equal(after.description, p.description);
    assert.deepEqual(after.categories, p.categories);
    assert.deepEqual(after.images, p.images);
    assert.equal(after.sku, p.sku);
    assert.equal(after.status, p.status);
    assert.equal(after.stock, p.stock);
    assert.equal(after.costPrice, p.costPrice);
    assert.ok("price" in r.changes || p.price === 185000);
    // history row written with the API actor
    const hist = db.listProductChanges(p.id, 5);
    if (p.price !== 185000) assert.ok(hist.some((h) => h.actor === ctx.actor));
  });
  it("keeps a running promotion when only the web price changes", async () => {
    const p = await sample();
    await svc.updateProduct(p.id, { price: 300000, promoPrice: 250000, marketPrice: null }, {}, ctx);
    const r = await svc.updateProduct(p.id, { price: 320000 }, {}, ctx);
    assert.equal(r.product.price, 320000);
    assert.equal(r.product.promoPrice, 250000);
    assert.equal(r.product.currentPrice, 250000);
    await svc.updateProduct(p.id, { promoPrice: null }, {}, ctx);
    assert.equal((await db.getProductById(p.id))!.price, 320000);
  });
  it("dry-run reports before/after and writes nothing", async () => {
    const p = await sample();
    const before = (await db.getProductById(p.id))!;
    const r = await svc.updateProduct(p.id, { name: `${before.name} (thử)`, price: before.price + 1000 }, { dryRun: true }, ctx);
    assert.equal(r.dryRun, true);
    assert.deepEqual(r.changes.name, { before: before.name, after: `${before.name} (thử)` });
    const now = (await db.getProductById(p.id))!;
    assert.equal(now.name, before.name);
    assert.equal(now.updatedAt, before.updatedAt);
  });
  it("no-op update does not bump the version", async () => {
    const p = await sample();
    const v1 = svc.toApiProduct((await db.getProductById(p.id))!).version;
    const r = await svc.updateProduct(p.id, { name: p.name }, {}, ctx);
    assert.equal(r.unchanged, true);
    assert.equal(svc.toApiProduct((await db.getProductById(p.id))!).version, v1);
  });
  it("refuses to overwrite a newer edit when the version is pinned", async () => {
    const p = await sample();
    const seen = svc.toApiProduct((await db.getProductById(p.id))!).version;
    await db.updateProductSku(p.id, `SKU-${Date.now()}`); // someone else edits in between
    await assert.rejects(svc.updateProduct(p.id, { price: 199000 }, { expectedVersion: seen }, ctx), (e: unknown) => e instanceof svc.ProductServiceError && e.code === "VERSION_CONFLICT" && e.status === 409);
    // without a pinned version the update is planned on the fresh row and keeps the other edit
    const sku = (await db.getProductById(p.id))!.sku;
    await svc.updateProduct(p.id, { price: 199000 }, {}, ctx);
    const now = (await db.getProductById(p.id))!;
    assert.equal(now.sku, sku);
    assert.equal(now.price, 199000);
  });
  it("saveProduct itself refuses a stale expectedVersion (inside the transaction)", async () => {
    const p = (await db.getProductById((await sample()).id))!;
    const { ProductVersionConflictError } = await import("../../src/lib/product-version");
    assert.throws(() => db.saveProductSync(sqlite.getDb(), { ...p, expectedVersion: "0000000000000000" }), ProductVersionConflictError);
  });
  it("validates like the admin form", async () => {
    const p = await sample();
    const bad = async (input: Record<string, unknown>, field: string) => {
      await assert.rejects(svc.updateProduct(p.id, input as never, {}, ctx), (e: unknown) => e instanceof svc.ProductServiceError && e.status === 422 && !!(e.details.fields as Record<string, string>)[field]);
    };
    await bad({ price: -1 }, "price");
    await bad({ promoPrice: 500000, marketPrice: 400000 }, "promoPrice");
    await bad({ name: "  " }, "name");
    await bad({ categories: ["khong-ton-tai-xyz"] }, "categories");
    await bad({ categories: [] }, "categories");
    await bad({ weightG: 0 }, "weightG");
    await bad({ dimsCm: "12 by 8" }, "dimsCm");
    await bad({ images: ["/api/files/products/2099-01/khong-co.jpg"] }, "images");
    await bad({ images: ["https://example.com/a.jpg"] }, "images");
    const other = (await db.getAllProducts(true)).find((x) => x.id !== p.id)!;
    await bad({ slug: other.slug }, "slug");
  });
  it("404 for a missing product", async () => {
    await assert.rejects(svc.updateProduct(99999999, { price: 1 }, {}, ctx), (e: unknown) => e instanceof svc.ProductServiceError && e.status === 404);
  });
});

describe("product create", () => {
  const name = `Sản phẩm thử API ${Date.now()}`;
  it("creates a draft with defaults and records the audit row", async () => {
    const cat = (await db.getCategories())[0];
    const r = await svc.createProduct({ name, categories: [cat.name], price: 120000, sku: `T-${Date.now()}`, shortDescription: "Dòng 1\n\nDòng 2" }, {}, ctx);
    assert.equal(r.created, true);
    assert.equal(r.product.status, "draft");
    assert.deepEqual(r.product.categories, [cat.slug], "category names resolve to slugs");
    assert.equal(r.product.price, 120000);
    assert.match(r.product.shortDescription, /<p>/);
    const audit = await tokens.listAudit({ target: `product:${r.product.id}` });
    assert.equal(audit[0]?.action, "products.create");
  });
  it("refuses a second product with the same slug or SKU (retry without idempotency key)", async () => {
    const cat = (await db.getCategories())[0];
    await assert.rejects(svc.createProduct({ name, categories: [cat.slug] }, {}, ctx), (e: unknown) => e instanceof svc.ProductServiceError && e.code === "DUPLICATE_SLUG");
    const existing = (await db.getAllProducts(true)).find((p) => p.name === name)!;
    await assert.rejects(svc.createProduct({ name: `${name} khác`, categories: [cat.slug], sku: existing.sku }, {}, ctx), (e: unknown) => e instanceof svc.ProductServiceError && e.code === "DUPLICATE_SKU");
    const ok = await svc.createProduct({ name: `${name} khác`, categories: [cat.slug], sku: existing.sku }, { allowDuplicateSku: true }, ctx);
    assert.equal(ok.created, true);
  });
  it("requires name and categories; dry-run creates nothing", async () => {
    await assert.rejects(svc.createProduct({ price: 1 }, {}, ctx), (e: unknown) => e instanceof svc.ProductServiceError && e.status === 422);
    const n = (await db.getAllProducts(true)).length;
    const cat = (await db.getCategories())[0];
    const r = await svc.createProduct({ name: `Dry ${Date.now()}`, categories: [cat.slug] }, { dryRun: true }, ctx);
    assert.equal(r.created, false);
    assert.equal((await db.getAllProducts(true)).length, n);
  });
});

describe("bulk update", () => {
  it("is atomic: one invalid item → nothing written", async () => {
    const [a, b] = (await db.getAllProducts(true)).filter((p) => p.categories.length).slice(0, 2);
    const before = [(await db.getProductById(a.id))!, (await db.getProductById(b.id))!];
    await assert.rejects(
      svc.bulkUpdateProducts([{ id: a.id, set: { price: 111000 } }, { id: b.id, set: { price: -5 } }], {}, ctx),
      (e: unknown) => e instanceof svc.ProductServiceError && e.code === "BULK_REJECTED" && e.status === 422,
    );
    assert.equal((await db.getProductById(a.id))!.price, before[0].price);
    assert.equal((await db.getProductById(b.id))!.price, before[1].price);
  });
  it("dry-run → apply plan pinned to versions; a change in between rejects the whole plan", async () => {
    const [a, b] = (await db.getAllProducts(true)).filter((p) => p.categories.length).slice(2, 4);
    const plan = await svc.bulkUpdateProducts([{ id: a.id, set: { price: a.price + 1000 } }, { id: b.id, set: { status: b.status === "draft" ? "publish" : "draft" } }], { dryRun: true }, ctx);
    assert.equal(plan.applied, false);
    assert.ok(plan.apply && plan.apply.items.length === 2 && plan.apply.items.every((i) => i.version));
    assert.equal((await db.getProductById(a.id))!.price, a.price, "dry-run wrote nothing");
    await db.updateProductSku(b.id, `CHANGED-${Date.now()}`);
    await assert.rejects(svc.bulkUpdateProducts(plan.apply!.items, {}, ctx), (e: unknown) => e instanceof svc.ProductServiceError && e.status === 409);
    assert.equal((await db.getProductById(a.id))!.price, a.price, "the valid item was not written either");
  });
  it("applies all items in one go", async () => {
    const [a, b] = (await db.getAllProducts(true)).filter((p) => p.categories.length).slice(4, 6);
    const r = await svc.bulkUpdateProducts([{ id: a.id, set: { tags: ["api-test"] } }, { id: b.id, set: { tags: ["api-test"] } }], {}, ctx);
    assert.equal(r.applied, true);
    assert.equal(r.summary.changed, 2);
    assert.deepEqual((await db.getProductById(a.id))!.tags, ["api-test"]);
    assert.deepEqual((await db.getProductById(b.id))!.tags, ["api-test"]);
  });
  it("rejects duplicates and oversize batches", async () => {
    await assert.rejects(svc.bulkUpdateProducts([{ id: 1, set: { price: 1 } }, { id: 1, set: { price: 2 } }], {}, ctx), /hai lần/);
    await assert.rejects(svc.bulkUpdateProducts(Array.from({ length: 201 }, (_, i) => ({ id: i + 1, set: { price: 1 } })), {}, ctx), /200/);
  });
});

describe("listing", () => {
  it("searches accent-insensitively, by id and sku, and paginates", async () => {
    const p = await sample();
    const word = p.name.split(/\s+/).find((w) => w.length > 3)!;
    const r = await svc.listProducts({ search: word.toUpperCase(), perPage: 200 });
    assert.ok(r.items.some((x) => x.id === p.id));
    assert.ok((await svc.listProducts({ search: String(p.id) })).items.some((x) => x.id === p.id));
    const page = await svc.listProducts({ perPage: 2, page: 1, sort: "id" });
    assert.equal(page.items.length, 2);
    assert.ok(page.items[0].id < page.items[1].id);
  });
  it("selects fields", () => {
    assert.deepEqual(svc.parseFieldList("id,name,nope", false), { fields: ["id", "name"], unknown: ["nope"] });
    assert.deepEqual(svc.parseFieldList("costPrice", false).unknown, ["costPrice"]);
    assert.deepEqual(svc.parseFieldList("costPrice", true).fields, ["costPrice"]);
  });
});

describe("image upload rules (same as the admin widget)", () => {
  it("accepts a real image, writes the 300x300 thumb, and the product can use it", async () => {
    const sharp = (await import("sharp")).default;
    const png = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#ff0000" } }).extend({ top: 50, bottom: 50, left: 50, right: 50, background: "#ffffff" }).png().toBuffer();
    const r = await media.storeImageUpload({ data: png, mime: "image/png", label: "Ảnh thử.png", folder: "products", generateThumb: true });
    assert.match(r.image, /^\/api\/files\/products\/\d{4}-\d{2}\/anh-thu-[0-9a-f]{8}\.png$/);
    assert.equal(r.thumb, r.image.replace(/\.png$/, "-300x300.png"));
    assert.ok((r.width ?? 0) <= 1200, "resized to ≤1200px");
    const p = await sample();
    const u = await svc.updateProduct(p.id, { images: [r.image] }, {}, ctx);
    assert.deepEqual(u.product.images, [r.image]);
    assert.equal(u.product.thumb, r.thumb, "thumb picked up from the -300x300 sibling");
  });
  it("rejects wrong type, spoofed content, garbage and oversize files", async () => {
    const sharp = (await import("sharp")).default;
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).png().toBuffer();
    await assert.rejects(media.checkImage(png, "image/svg+xml"), (e: unknown) => e instanceof media.MediaError && e.status === 415);
    await assert.rejects(media.checkImage(png, "image/jpeg"), (e: unknown) => e instanceof media.MediaError && e.status === 415);
    await assert.rejects(media.checkImage(Buffer.from("not an image at all"), "image/png"), (e: unknown) => e instanceof media.MediaError && e.status === 422);
    await assert.rejects(media.checkImage(Buffer.alloc(10 * 1024 * 1024 + 1), "image/png"), (e: unknown) => e instanceof media.MediaError && e.status === 413);
    await assert.rejects(media.checkImage(Buffer.alloc(0), "image/png"), (e: unknown) => e instanceof media.MediaError && e.status === 400);
  });
});

describe("audit redaction", () => {
  it("drops secret-looking keys and shortens long text", () => {
    const r = tokens.redactForAudit({ token: "lsk_x", nested: { Authorization: "Bearer x", ok: 1 }, long: "a".repeat(3000) }) as Record<string, unknown>;
    assert.equal(r.token, "[redacted]");
    assert.deepEqual(r.nested, { Authorization: "[redacted]", ok: 1 });
    assert.ok((r.long as string).length < 2100);
  });
});
