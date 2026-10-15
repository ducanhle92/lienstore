/**
 * End-to-end: CLI `lienstore` → HTTP /api/admin/v1 → SQLite, against a running server that uses a THROW-AWAY database.
 * Run through scripts/e2e-admin-api.sh (it copies the DB, starts `next dev`, sets the env below and cleans up):
 *   E2E_URL      server base URL (e.g. http://localhost:3100)
 *   E2E_DB       the database file THAT server uses (tokens are minted into it)
 *   E2E_SECRET   the server's ADMIN_SESSION_SECRET (to forge a session cookie for the CSRF checks)
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const URL_ = process.env.E2E_URL;
const DB = process.env.E2E_DB;
const SECRET = process.env.E2E_SECRET;
if (!URL_ || !DB || !SECRET) throw new Error("E2E_URL, E2E_DB, E2E_SECRET are required — run scripts/e2e-admin-api.sh");
if (path.resolve(DB) === path.join(ROOT, "data", "lienstore.db")) throw new Error("refusing to run e2e against data/lienstore.db — use a copy");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lien-e2e-"));
const tokens = {};

function mint(name, scopes) {
  const envFile = path.join(tmp, `${name}.env`);
  const out = execFileSync("npx", ["-y", "tsx", "--conditions=react-server", "scripts/api-token.ts", "create", "--name", `e2e ${name}`, "--scopes", scopes, "--write-env", envFile], { cwd: ROOT, env: { ...process.env, LIEN_DB_PATH: DB }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const info = JSON.parse(out);
  const token = fs.readFileSync(envFile, "utf8").match(/LIENSTORE_API_TOKEN=(\S+)/)[1];
  return { ...info, token, envFile };
}

/** Run the CLI with a token from its env file; returns { code, json, stderr }. */
function cli(tok, args, extraEnv = {}, input) {
  const env = { ...process.env, LIENSTORE_API_URL: URL_, LIENSTORE_API_TOKEN: tok?.token ?? "", LIENSTORE_PROFILE: "", ...extraEnv };
  delete env.LIENSTORE_ENV;
  Object.assign(env, extraEnv);
  const r = spawnSync("node", [path.join(ROOT, "scripts/lienstore.mjs"), ...args], { cwd: tmp, env, encoding: "utf8", input });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { code: r.status, json, stderr: r.stderr, stdout: r.stdout };
}

async function http(method, p, { token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined && typeof body !== "string") h["Content-Type"] = "application/json";
  const res = await fetch(`${URL_}/api/admin/v1/${p}`, { method, headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), redirect: "manual" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, headers: res.headers };
}

const sql = () => new DatabaseSync(DB);
let sampleId;
let sampleCategory;

before(() => {
  tokens.full = mint("full", "products:read,products:write,media:write");
  tokens.ro = mint("ro", "products:read");
  const db = sql();
  const row = db.prepare("SELECT p.id, (SELECT category_slug FROM product_categories WHERE product_id = p.id LIMIT 1) AS cat FROM products p WHERE EXISTS (SELECT 1 FROM product_categories WHERE product_id = p.id) ORDER BY p.id LIMIT 1").get();
  db.close();
  sampleId = row.id;
  sampleCategory = row.cat;
});

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("authentication & authorisation (HTTP)", () => {
  it("401 without credentials, with a garbage or unknown token", async () => {
    assert.equal((await http("GET", "me/")).json.error.code, "UNAUTHORIZED");
    const bad = await http("GET", "me/", { token: "nope" });
    assert.equal(bad.status, 401);
    assert.equal(bad.json.error.code, "TOKEN_INVALID");
    assert.equal((await http("GET", "me/", { token: `lsk_${"A".repeat(43)}` })).json.error.code, "TOKEN_INVALID");
  });
  it("revoked and expired tokens are refused", async () => {
    const t = mint("revoked", "products:read");
    assert.equal((await http("GET", "me/", { token: t.token })).status, 200);
    execFileSync("npx", ["-y", "tsx", "--conditions=react-server", "scripts/api-token.ts", "revoke", String(t.id)], { cwd: ROOT, env: { ...process.env, LIEN_DB_PATH: DB }, stdio: "ignore" });
    const r = await http("GET", "me/", { token: t.token });
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, "TOKEN_REVOKED");
    const e = mint("expired", "products:read");
    const db = sql();
    db.prepare("UPDATE api_tokens SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), e.id);
    db.close();
    assert.equal((await http("GET", "me/", { token: e.token })).json.error.code, "TOKEN_EXPIRED");
  });
  it("a read-only token can read but not write or upload (403)", async () => {
    assert.equal((await http("GET", "products/?perPage=1", { token: tokens.ro.token })).status, 200);
    const w = await http("PATCH", `products/${sampleId}/`, { token: tokens.ro.token, body: { price: 1000 } });
    assert.equal(w.status, 403);
    assert.equal(w.json.error.code, "FORBIDDEN");
    const c = cli(tokens.ro, ["products", "update", String(sampleId), "--set", "price=1000"]);
    assert.equal(c.code, 1);
    assert.equal(c.json.error.code, "FORBIDDEN");
  });
  it("cookie session writes need the CSRF header and a same-origin Origin", async () => {
    const db = sql();
    const owner = db.prepare("SELECT id FROM customers WHERE role = 'owner' AND active = 1 LIMIT 1").get();
    db.close();
    const payload = `${owner.id}.${Date.now() + 3600_000}`;
    const cookie = `lien_admin=${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
    assert.equal((await http("GET", "me/", { headers: { Cookie: cookie } })).json.data.kind, "session");
    const origin = new URL(URL_).origin;
    const body = { tags: ["csrf-ok"] };
    assert.equal((await http("PATCH", `products/${sampleId}/`, { body, headers: { Cookie: cookie, Origin: origin } })).json.error.code, "CSRF_FAILED");
    assert.equal((await http("PATCH", `products/${sampleId}/`, { body, headers: { Cookie: cookie, Origin: "https://evil.example", "X-Lien-Csrf": "1" } })).json.error.code, "CSRF_FAILED");
    const ok = await http("PATCH", `products/${sampleId}/`, { body, headers: { Cookie: cookie, Origin: origin, "X-Lien-Csrf": "1" } });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json.data.product.tags, ["csrf-ok"]);
  });
});

describe("request validation (HTTP)", () => {
  it("invalid JSON → 400, unknown field → 422, empty patch → 400, bad id → 400, missing → 404", async () => {
    assert.equal((await http("PATCH", `products/${sampleId}/`, { token: tokens.full.token, body: "{oops", headers: { "Content-Type": "application/json" } })).json.error.code, "INVALID_JSON");
    const u = await http("PATCH", `products/${sampleId}/`, { token: tokens.full.token, body: { prize: 1 } });
    assert.equal(u.status, 422);
    assert.ok(u.json.error.fields.prize);
    assert.equal((await http("PATCH", `products/${sampleId}/`, { token: tokens.full.token, body: {} })).status, 400);
    assert.equal((await http("GET", "products/abc/", { token: tokens.full.token })).status, 400);
    assert.equal((await http("GET", "products/99999999/", { token: tokens.full.token })).status, 404);
    assert.equal((await http("GET", "products/?sort=bogus", { token: tokens.full.token })).status, 400);
  });
  it("same Idempotency-Key with another body → 422", async () => {
    const key = `e2e-${randomUUID()}`;
    const a = await http("PATCH", `products/${sampleId}/`, { token: tokens.full.token, body: { tags: ["k1"] }, headers: { "Idempotency-Key": key } });
    assert.equal(a.status, 200);
    const again = await http("PATCH", `products/${sampleId}/`, { token: tokens.full.token, body: { tags: ["k1"] }, headers: { "Idempotency-Key": key } });
    assert.equal(again.headers.get("idempotent-replayed"), "true");
    assert.deepEqual(again.json, a.json, "replay returns the stored response");
    const b = await http("PATCH", `products/${sampleId}/`, { token: tokens.full.token, body: { tags: ["k2"] }, headers: { "Idempotency-Key": key } });
    assert.equal(b.status, 422);
    assert.equal(b.json.error.code, "IDEMPOTENCY_KEY_REUSED");
  });
});

describe("CLI → API → DB", () => {
  it("whoami shows the target and scopes", () => {
    const r = cli(tokens.full, ["whoami"]);
    assert.equal(r.code, 0);
    assert.deepEqual(r.json.data.scopes, ["products:read", "products:write", "media:write"]);
    assert.equal(r.json.target.env, "local");
    assert.match(r.stderr, /\[LOCAL\]/);
    assert.ok(!r.stderr.includes(tokens.full.token) && !r.stdout.includes(tokens.full.token), "token never printed");
  });
  it("list / get / update keeps unsent fields", () => {
    const before = cli(tokens.full, ["products", "get", String(sampleId)]).json.data;
    const list = cli(tokens.full, ["products", "list", "--ids", String(sampleId), "--fields", "id,name,price"]);
    assert.equal(list.code, 0);
    assert.deepEqual(Object.keys(list.json.data[0]).sort(), ["id", "name", "price"]);
    const up = cli(tokens.full, ["products", "update", String(sampleId), "--set", "price=185000"]);
    assert.equal(up.code, 0, up.stderr);
    const afterP = cli(tokens.full, ["products", "get", String(sampleId)]).json.data;
    assert.equal(afterP.price, 185000);
    for (const k of ["name", "description", "categories", "images", "sku", "status", "tags", "shortDescription"]) assert.deepEqual(afterP[k], before[k], k);
  });
  it("dry-run writes nothing; a stale --if-version is refused", () => {
    const before = cli(tokens.full, ["products", "get", String(sampleId)]).json.data;
    const dry = cli(tokens.full, ["products", "update", String(sampleId), "--set", "price=199000", "--dry-run"]);
    assert.equal(dry.code, 0);
    assert.deepEqual(dry.json.data.changes.price, { before: before.price, after: 199000 });
    assert.equal(cli(tokens.full, ["products", "get", String(sampleId)]).json.data.version, before.version);
    cli(tokens.full, ["products", "update", String(sampleId), "--set", 'tags=["moved"]']);
    const stale = cli(tokens.full, ["products", "update", String(sampleId), "--set", "price=199000", "--if-version", before.version]);
    assert.equal(stale.code, 1);
    assert.equal(stale.json.error.code, "VERSION_CONFLICT");
  });
  it("create twice from the same file → one product (idempotent replay); another file with the same name → DUPLICATE_SLUG", () => {
    const name = `E2E sản phẩm ${Date.now()}`;
    const file = path.join(tmp, "product.json");
    fs.writeFileSync(file, JSON.stringify({ name, categories: [sampleCategory], price: 150000, status: "draft" }));
    const a = cli(tokens.full, ["products", "create", "--file", file]);
    assert.equal(a.code, 0, a.stderr);
    const b = cli(tokens.full, ["products", "create", "--file", file]);
    assert.equal(b.code, 0);
    assert.equal(b.json.meta.idempotentReplay, true);
    assert.equal(b.json.data.product.id, a.json.data.product.id);
    const db = sql();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM products WHERE name = ?").get(name).n, 1);
    db.close();
    fs.writeFileSync(file, JSON.stringify({ name, categories: [sampleCategory], price: 160000 }));
    const c = cli(tokens.full, ["products", "create", "--file", file]);
    assert.equal(c.code, 1);
    assert.equal(c.json.error.code, "DUPLICATE_SLUG");
    assert.equal(c.json.error.existingId, a.json.data.product.id);
  });
  it("two concurrent creates with one Idempotency-Key make one product", async () => {
    const name = `E2E song song ${Date.now()}`;
    const key = `e2e-${randomUUID()}`;
    const req = () => http("POST", "products/", { token: tokens.full.token, body: { name, categories: [sampleCategory] }, headers: { "Idempotency-Key": key } });
    const rs = await Promise.all([req(), req(), req()]);
    assert.ok(rs.some((r) => r.status === 201));
    for (const r of rs) assert.ok([201, 409].includes(r.status), `status ${r.status}`);
    const db = sql();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM products WHERE name = ?").get(name).n, 1);
    db.close();
  });
  it("media upload → product with image (thumb picked up), re-upload of the same file is a replay", async () => {
    const sharp = (await import("sharp")).default;
    const img = path.join(tmp, "anh-thu.jpg");
    fs.writeFileSync(img, await sharp({ create: { width: 1500, height: 1000, channels: 3, background: "#3366cc" } }).jpeg().toBuffer());
    const up = cli(tokens.full, ["media", "upload", img]);
    assert.equal(up.code, 0, up.stderr);
    assert.match(up.json.data.image, /^\/api\/files\/products\//);
    const served = await fetch(`${URL_}${up.json.data.image}`);
    assert.equal(served.status, 200);
    assert.match(served.headers.get("content-type") ?? "", /image\/jpeg/);
    const again = cli(tokens.full, ["media", "upload", img]);
    assert.equal(again.json.data.image, up.json.data.image);
    assert.equal(again.json.data.replayed, true);
    const file = path.join(tmp, "with-image.json");
    fs.writeFileSync(file, JSON.stringify({ name: `E2E có ảnh ${Date.now()}`, categories: [sampleCategory], images: [up.json.data.image], status: "publish" }));
    const c = cli(tokens.full, ["products", "create", "--file", file]);
    assert.equal(c.code, 0, c.stderr);
    assert.deepEqual(c.json.data.product.images, [up.json.data.image]);
    assert.equal(c.json.data.product.thumb, up.json.data.thumb);
    const bad = path.join(tmp, "fake.png");
    fs.writeFileSync(bad, "this is not a png");
    const b = cli(tokens.full, ["media", "upload", bad]);
    assert.equal(b.code, 1);
    assert.equal(b.json.error.code, "INVALID_IMAGE");
  });
  it("bulk-update: dry-run --out plan → apply; a change after the dry-run rejects the whole plan", () => {
    const db = sql();
    const ids = db.prepare("SELECT p.id FROM products p WHERE EXISTS (SELECT 1 FROM product_categories WHERE product_id = p.id) ORDER BY p.id LIMIT 3 OFFSET 5").all().map((r) => r.id);
    db.close();
    const changes = path.join(tmp, "changes.json");
    const plan = path.join(tmp, "plan.json");
    const tag = `bulk-e2e-${Date.now()}`;
    fs.writeFileSync(changes, JSON.stringify({ ids, set: { tags: [tag] } }));
    const dry = cli(tokens.full, ["products", "bulk-update", "--file", changes, "--dry-run", "--out", plan]);
    assert.equal(dry.code, 0, dry.stderr);
    assert.equal(dry.json.data.applied, false);
    assert.ok(fs.existsSync(plan));
    const ok = cli(tokens.full, ["products", "bulk-update", "--file", plan]);
    assert.equal(ok.code, 0, ok.stderr);
    assert.equal(ok.json.data.applied, true);
    // second round: plan, then someone edits one product, then apply → 409, nothing written
    fs.writeFileSync(changes, JSON.stringify({ ids, set: { tags: [`${tag}-2`] } }));
    cli(tokens.full, ["products", "bulk-update", "--file", changes, "--dry-run", "--out", plan]);
    cli(tokens.full, ["products", "update", String(ids[1]), "--set", `sku=CHANGED-${Date.now()}`]);
    const rej = cli(tokens.full, ["products", "bulk-update", "--file", plan]);
    assert.equal(rej.code, 1);
    assert.equal(rej.json.error.code, "BULK_REJECTED");
    const db2 = sql();
    const tags = db2.prepare(`SELECT tags FROM products WHERE id IN (${ids.join(",")})`).all().map((r) => JSON.parse(r.tags));
    db2.close();
    assert.ok(tags.every((t) => !t.includes(`${tag}-2`)), "no item of the rejected plan was written");
  });
  it("production target needs --yes for writes (dry-run allowed); network errors exit 4; token flag refused", () => {
    const r = cli(tokens.full, ["products", "update", String(sampleId), "--set", "price=1"], { LIENSTORE_ENV: "production" });
    assert.equal(r.code, 3);
    assert.equal(r.json.error.code, "CONFIRMATION_REQUIRED");
    assert.equal(cli(tokens.full, ["products", "update", String(sampleId), "--set", "price=1", "--dry-run"], { LIENSTORE_ENV: "production" }).code, 0);
    const n = cli(tokens.full, ["whoami"], { LIENSTORE_API_URL: "http://127.0.0.1:9", LIENSTORE_TIMEOUT_MS: "2000" });
    assert.equal(n.code, 4);
    assert.equal(n.json.error.code, "NETWORK");
    assert.equal(cli(tokens.full, ["whoami", "--token", "x"]).code, 2);
    assert.equal(cli(null, ["whoami"], { LIENSTORE_API_TOKEN: "" }).code, 2);
  });
  it("audit shows the API writes without secrets", () => {
    const r = cli(tokens.full, ["audit", "--product", String(sampleId), "--limit", "50"]);
    assert.equal(r.code, 0);
    assert.ok(r.json.data.some((a) => a.action === "products.update" && a.actor.startsWith("API e2e full")));
    const db = sql();
    const all = db.prepare("SELECT changes, actor FROM api_audit_log").all();
    db.close();
    for (const t of Object.values(tokens)) assert.ok(!JSON.stringify(all).includes(t.token));
  });
});
