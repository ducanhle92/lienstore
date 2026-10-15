/**
 * End-to-end for the scan documents over HTTP (concurrency, retries, CSRF, scopes) on a THROW-AWAY database.
 * Run through scripts/e2e-admin-api.sh (same E2E_URL / E2E_DB / E2E_SECRET as admin-api.e2e.mjs).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
if (path.resolve(DB) === path.join(ROOT, "data", "lienstore.db")) throw new Error("refusing to run e2e against data/lienstore.db");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lien-scan-e2e-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function mint(name, scopes) {
  const envFile = path.join(tmp, `${name}.env`);
  execFileSync("npx", ["-y", "tsx", "--conditions=react-server", "scripts/api-token.ts", "create", "--name", `scan e2e ${name}`, "--scopes", scopes, "--write-env", envFile], { cwd: ROOT, env: { ...process.env, LIEN_DB_PATH: DB }, stdio: "ignore" });
  return fs.readFileSync(envFile, "utf8").match(/LIENSTORE_API_TOKEN=(\S+)/)[1];
}
async function http(method, p, { token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h["Content-Type"] = "application/json";
  const res = await fetch(`${URL_}/api/admin/v1/${p}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  return { status: res.status, json: await res.json().catch(() => null), headers: res.headers };
}
const ean = () => {
  const body = `2${String(Date.now() % 1e7).padStart(7, "0")}${String(Math.floor(Math.random() * 1e4)).padStart(4, "0")}`;
  let s = 0;
  for (let i = 0; i < body.length; i++) s += (i % 2 === 0 ? 3 : 1) * Number(body[body.length - 1 - i]);
  return `${body}${(10 - (s % 10)) % 10}`;
};

let full;
let readOnly;
let productsOnly;
let productId;
let code;
before(async () => {
  full = mint("full", "products:read,products:write,inventory:read,inventory:write");
  readOnly = mint("ro", "inventory:read");
  productsOnly = mint("prod", "products:read");
  const db = new DatabaseSync(DB);
  productId = db.prepare("SELECT p.id FROM products p WHERE EXISTS (SELECT 1 FROM product_categories WHERE product_id = p.id) ORDER BY p.id DESC LIMIT 1").get().id;
  db.close();
  code = ean();
  const r = await http("POST", `products/${productId}/barcodes/`, { token: full, body: { code, force: true } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
});

const units = (status) => {
  const db = new DatabaseSync(DB);
  const n = db.prepare("SELECT COUNT(*) AS n FROM stock_units WHERE product_id = ? AND removed IS NULL AND status = ?").get(productId, status).n;
  db.close();
  return n;
};

describe("scan documents over HTTP", () => {
  it("scopes: inventory:read cannot scan, products-only cannot resolve", async () => {
    assert.equal((await http("GET", `codes/resolve/?code=${code}`, { token: readOnly })).json.data.kind, "product");
    assert.equal((await http("GET", `codes/resolve/?code=${code}`, { token: productsOnly })).status, 403);
    assert.equal((await http("POST", "stock-receipts/", { token: readOnly, body: { warehouse: "vn", mode: "direct" } })).status, 403);
  });
  it("the same scan sent 5 times at once (same opId) is counted once", async () => {
    const doc = (await http("POST", "stock-receipts/", { token: full, body: { warehouse: "vn", mode: "direct" } })).json.data;
    const opId = `e2e-${randomUUID()}`;
    const rs = await Promise.all(Array.from({ length: 5 }, () => http("POST", `stock-receipts/${doc.id}/scans/`, { token: full, body: { code, opId } })));
    for (const r of rs) assert.equal(r.status, 200, JSON.stringify(r.json));
    const fresh = (await http("GET", `stock-receipts/${doc.id}/`, { token: full })).json.data;
    assert.equal(fresh.lines[0].qty, 1);
    // two DIFFERENT deliberate scans at once both count
    await Promise.all([1, 2].map(() => http("POST", `stock-receipts/${doc.id}/scans/`, { token: full, body: { code, opId: `e2e-${randomUUID()}` } })));
    const v = (await http("GET", `stock-receipts/${doc.id}/`, { token: full })).json.data;
    assert.equal(v.lines[0].qty, 3);
    // confirm sent 3 times at once (lost answers / double tap): units created once
    const before = units("at_shop");
    const key = `confirm-${doc.id}-${v.version}`;
    const cs = await Promise.all([1, 2, 3].map(() => http("POST", `stock-receipts/${doc.id}/confirm/`, { token: full, body: { version: v.version }, headers: { "Idempotency-Key": key } })));
    assert.ok(cs.some((r) => r.status === 200));
    for (const r of cs) assert.ok([200, 409].includes(r.status), `${r.status} ${JSON.stringify(r.json)}`);
    assert.equal(units("at_shop"), before + 3);
    // and once more later without the key: stored result, nothing new
    const again = await http("POST", `stock-receipts/${doc.id}/confirm/`, { token: full, body: { version: v.version } });
    assert.equal(again.json.data.alreadyConfirmed, true);
    assert.equal(units("at_shop"), before + 3);
  });
  it("two phones: stale line rev and stale document version are refused", async () => {
    const doc = (await http("POST", "stock-counts/", { token: full, body: { warehouse: "vn" } })).json.data;
    const seen = (await http("POST", `stock-counts/${doc.id}/scans/`, { token: full, body: { code, opId: `e2e-${randomUUID()}` } })).json.data.doc;
    const l = seen.lines[0];
    assert.equal((await http("PATCH", `stock-counts/${doc.id}/lines/${l.id}/`, { token: full, body: { rev: l.rev, qty: 7 } })).status, 200);
    const stale = await http("PATCH", `stock-counts/${doc.id}/lines/${l.id}/`, { token: full, body: { rev: l.rev, qty: 9 } });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.error.code, "LINE_CHANGED");
    const c = await http("POST", `stock-counts/${doc.id}/close/`, { token: full, body: { version: seen.version } });
    assert.equal(c.status, 409);
    assert.equal(c.json.error.code, "DOC_CHANGED");
    assert.equal((await http("POST", `stock-counts/${doc.id}/cancel/`, { token: full })).json.data.status, "cancelled");
  });
  it("cookie session (phone web app): writes need the CSRF header + same origin", async () => {
    const db = new DatabaseSync(DB);
    const owner = db.prepare("SELECT id FROM customers WHERE role = 'owner' AND active = 1 LIMIT 1").get();
    db.close();
    const payload = `${owner.id}.${Date.now() + 3600_000}`;
    const cookie = `lien_admin=${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
    const origin = new URL(URL_).origin;
    const body = { warehouse: "vn", mode: "direct" };
    assert.equal((await http("POST", "stock-receipts/", { body, headers: { Cookie: cookie, Origin: origin } })).json.error.code, "CSRF_FAILED");
    assert.equal((await http("POST", "stock-receipts/", { body, headers: { Cookie: cookie, Origin: "https://evil.example", "X-Lien-Csrf": "1" } })).json.error.code, "CSRF_FAILED");
    const ok = await http("POST", "stock-receipts/", { body, headers: { Cookie: cookie, Origin: origin, "X-Lien-Csrf": "1" } });
    assert.equal(ok.status, 201);
    assert.equal((await http("GET", `codes/resolve/?code=${code}`, { headers: { Cookie: cookie } })).json.data.kind, "product", "reads need no CSRF header");
  });
  it("invalid / unknown codes and oversize input are rejected cleanly", async () => {
    const doc = (await http("POST", "stock-receipts/", { token: full, body: { warehouse: "vn", mode: "direct" } })).json.data;
    assert.equal((await http("POST", `stock-receipts/${doc.id}/scans/`, { token: full, body: { code: "4961989409138", opId: `e2e-${randomUUID()}` } })).json.error.code, "INVALID_CODE");
    assert.equal((await http("POST", `stock-receipts/${doc.id}/scans/`, { token: full, body: { code: ean(), opId: `e2e-${randomUUID()}` } })).json.error.code, "UNKNOWN_CODE");
    assert.equal((await http("POST", `stock-receipts/${doc.id}/scans/`, { token: full, body: { code: "x".repeat(300), opId: `e2e-${randomUUID()}` } })).status, 422);
    assert.equal((await http("POST", `stock-receipts/${doc.id}/scans/`, { token: full, body: { code, opId: `e2e-${randomUUID()}`, qty: 100000 } })).status, 422);
    assert.equal((await http("GET", `codes/resolve/?code=${"9".repeat(400)}`, { token: full })).status, 400);
  });
});
