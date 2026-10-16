#!/usr/bin/env node
/**
 * lienstore — CLI for the Admin API v1 (/api/admin/v1). Output is JSON on stdout; a one-line target banner and error
 * summaries go to stderr. Docs: docs/ADMIN_API.md.
 *
 *   node scripts/lienstore.mjs <command> [options]        (or: npm run -s lienstore -- <command> …)
 *
 * Config (environment variables win over the file):
 *   LIENSTORE_API_URL     base URL (default http://localhost:3000)
 *   LIENSTORE_API_TOKEN   Bearer token lsk_… — never pass it as an argument
 *   LIENSTORE_ENV         label shown on every call: local | staging | production (default: guessed from the URL)
 *   LIENSTORE_TIMEOUT_MS  per request (default 30000; uploads ×4)
 * File: .env.lienstore.local at the repo root, or .env.lienstore.<profile>.local with --profile <name> /
 * LIENSTORE_PROFILE=<name>.
 *
 * Exit codes: 0 ok · 1 API error (4xx/5xx) · 2 usage / config · 3 production write without --yes · 4 network / timeout.
 */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXIT = { OK: 0, API: 1, USAGE: 2, CONFIRM: 3, NETWORK: 4 };

const HELP = `lienstore — Admin API v1 CLI (JSON out). Docs: docs/ADMIN_API.md

  whoami                                     token, scopes, server, environment
  products list [--search "Hada Labo"] [--category slug] [--status publish|draft|all]
                [--sale-status instock|discontinued] [--sku X] [--ids 1,2] [--has-image true|false]
                [--price-min N] [--price-max N] [--updated-since 2026-10-01] [--sort -updated]
                [--page N] [--per-page N] [--fields id,name,price|all] [--all-pages]
  products get <id> [--fields …]
  products create --file product.json [--dry-run] [--allow-duplicate-sku] [--idempotency-key K]
  products update <id> (--file patch.json | --set price=185000 [--set status=publish …])
                [--if-version V] [--dry-run]
  products bulk-update --file changes.json [--dry-run [--out plan.json]]
  media upload <image> [<image> …] [--folder products|categories|posts] [--name label]
  categories list
  audit [--product <id>] [--limit N]

  codes resolve <code>                       what a scanned / typed code is (product, unit H…, unknown, conflict)
  stock <productId>                          stock by warehouse / expiry, held for orders, incoming
  barcodes list <productId> [--all]
  barcodes add <productId> <code> [--pack-qty 12] [--pack-label thùng] [--force]
  barcodes remove <barcodeId>
  barcodes import --file links.json [--dry-run] [--force]   many links: [{ "productId", "code", "packQty"? }] —
                                             per-item report (not atomic); dry-run only resolves, writes nothing
  receipts|counts|picks list [--status draft|confirmed|cancelled|all] [--warehouse vn|jp]
  receipts create --warehouse vn|jp [--mode direct|shipment --shipment <id>]   (receipts shipments = runs to receive)
  counts create --warehouse vn|jp            picks create --order <orderId> | --order-number <n>   (picks orders)
  receipts|counts|picks get <docId>
  receipts|counts|picks scan <docId> <code> [--qty N] [--op-id X]
  receipts|counts|picks add-line <docId> <productId>
  receipts|counts|picks set-line <docId> <lineId> --rev R [--qty N|null] [--expiry 2027-03] [--cost-jpy N] [--bill X] [--recount] [--accept-drift]
  receipts|counts|picks undo <docId> [--op-id X]
  receipts|counts|picks confirm <docId> --version V      (counts: close, picks: complete — same command)
  picks carriers                             carriers for the VN leg; picks confirm … --method <id|pickup> [--tracking <mã vận đơn>]
  receipts|counts|picks cancel <docId>
  shipments list                             open packing runs (Đóng hàng JP)
  shipments create [--label …] [--note …]
  shipments get <id>
  shipments pack <id> <code|--product <id>> [--qty N]
  shipments unpack <id> --product <id> [--qty N]

Global: --profile <name>  --yes (required for writes when the target is production)  --timeout <ms>
--file - reads JSON from stdin. --set key=value parses value as JSON when possible (numbers, null, ["a","b"]).`;

// ---------------------------------------------------------------------------------------------------------------- args

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  const multi = new Set(["set"]);
  const flags = new Set(["dry-run", "yes", "all-pages", "allow-duplicate-sku", "help", "h", "force", "all", "recount", "accept-drift"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      pos.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      let key = a.slice(2);
      let val;
      const eq = key.indexOf("=");
      if (eq >= 0) {
        val = key.slice(eq + 1);
        key = key.slice(0, eq);
      } else if (flags.has(key)) val = true;
      else {
        val = argv[i + 1];
        if (val === undefined) usage(`thiếu giá trị cho --${key}`);
        i++;
      }
      if (/^token$|^api-token$/i.test(key)) usage("không nhận token qua tham số dòng lệnh (lộ trong process list) — dùng LIENSTORE_API_TOKEN hoặc file .env.lienstore.local");
      if (multi.has(key)) (opts[key] ??= []).push(val);
      else opts[key] = val;
    } else if (a === "-h") opts.help = true;
    else pos.push(a);
  }
  return { pos, opts };
}

function usage(msg) {
  process.stderr.write(`lienstore: ${msg}\n(lienstore help để xem lệnh)\n`);
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code: "USAGE", message: msg } }, null, 2)}\n`);
  process.exit(EXIT.USAGE);
}

// -------------------------------------------------------------------------------------------------------------- config

function readDotenv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function loadConfig(opts) {
  const profile = opts.profile ?? process.env.LIENSTORE_PROFILE ?? "";
  const name = profile ? `.env.lienstore.${profile}.local` : ".env.lienstore.local";
  const candidates = [path.join(process.cwd(), name), path.join(ROOT, name)];
  const file = candidates.find((f) => fs.existsSync(f)) ?? null;
  if (profile && !file) usage(`không thấy file cấu hình ${name} cho profile "${profile}"`);
  const fromFile = file ? readDotenv(file) : {};
  const get = (k) => process.env[k] ?? fromFile[k];
  const url = (get("LIENSTORE_API_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    usage(`LIENSTORE_API_URL không hợp lệ: ${url}`);
  }
  const local = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0)$/.test(host);
  const env = get("LIENSTORE_ENV") || (local ? "local" : "production");
  const timeout = Number(opts.timeout ?? get("LIENSTORE_TIMEOUT_MS") ?? 30000);
  return { url, env, profile: profile || "default", file, token: get("LIENSTORE_API_TOKEN") ?? "", timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 30000 };
}

// ---------------------------------------------------------------------------------------------------------------- http

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY_STATUS = new Set([502, 503, 504]);

/**
 * One API call. GETs are retried on network errors / 502-504. Writes are retried the same way ONLY because they always
 * carry an Idempotency-Key (the server replays the first result instead of applying twice).
 */
async function call(cfg, method, apiPath, { query, json, form, idempotencyKey, timeoutMs } = {}) {
  const u = new URL(`${cfg.url}/api/admin/v1/${apiPath.replace(/^\/+/, "")}`);
  if (!u.pathname.endsWith("/")) u.pathname += "/";
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== false) u.searchParams.set(k, String(v));
  const headers = { Accept: "application/json", Authorization: `Bearer ${cfg.token}`, "User-Agent": "lienstore-cli/1" };
  if (json !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  if (cfg.ifMatch) headers["If-Match"] = cfg.ifMatch;
  const body = json !== undefined ? JSON.stringify(json) : form;
  const write = method !== "GET";
  const attempts = write && !idempotencyKey ? 1 : 3;
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    let res;
    try {
      res = await fetch(u, { method, headers, body: typeof form === "function" ? await form() : body, signal: AbortSignal.timeout(timeoutMs ?? cfg.timeout), redirect: "manual" });
    } catch (e) {
      lastErr = e;
      const what = e?.name === "TimeoutError" ? `quá thời gian ${timeoutMs ?? cfg.timeout} ms` : e?.cause?.code || e?.message || String(e);
      process.stderr.write(`[lienstore] lần ${i}/${attempts}: không kết nối được ${u.origin} (${what})${i < attempts ? " — thử lại" : ""}\n`);
      if (i < attempts) await sleep(500 * 3 ** (i - 1));
      continue;
    }
    if (res.status >= 300 && res.status < 400) {
      return { status: res.status, body: { ok: false, error: { code: "REDIRECT", message: `Máy chủ chuyển hướng tới ${res.headers.get("location")} — kiểm tra LIENSTORE_API_URL (http/https, www).` } } };
    }
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { ok: false, error: { code: "NON_JSON_RESPONSE", message: `HTTP ${res.status}: ${text.slice(0, 300)}` } };
    }
    const inProgress = res.status === 409 && parsed?.error?.code === "IDEMPOTENCY_IN_PROGRESS";
    if ((RETRY_STATUS.has(res.status) || inProgress) && i < attempts) {
      process.stderr.write(`[lienstore] HTTP ${res.status} — thử lại (${i}/${attempts})\n`);
      await sleep(800 * i);
      continue;
    }
    if (res.headers.get("idempotent-replayed")) parsed.meta = { ...(parsed.meta ?? {}), idempotentReplay: true };
    return { status: res.status, body: parsed };
  }
  const err = new Error(lastErr?.message ?? "network error");
  err.network = true;
  throw err;
}

// ------------------------------------------------------------------------------------------------------------- helpers

function readJsonFile(file) {
  if (!file) usage("thiếu --file <đường dẫn JSON> (hoặc --file - để đọc stdin)");
  let text;
  try {
    text = file === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(path.resolve(file), "utf8");
  } catch (e) {
    usage(`không đọc được ${file}: ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    usage(`${file} không phải JSON hợp lệ: ${e.message}`);
  }
}

function parseSets(list) {
  const out = {};
  for (const s of list ?? []) {
    const i = s.indexOf("=");
    if (i <= 0) usage(`--set cần dạng key=value (nhận "${s}")`);
    const k = s.slice(0, i).trim();
    const raw = s.slice(i + 1);
    let v;
    try {
      v = JSON.parse(raw);
    } catch {
      v = raw;
    }
    // keep leading-zero codes / long digit strings as text (JSON would turn "0123" into an error and "4961…" into a number)
    if (typeof v === "number" && (k === "sku" || /^0\d/.test(raw))) v = raw;
    out[k] = v;
  }
  return out;
}

const stableHash = (v) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex").slice(0, 40);

function print(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function finish(cfg, r, extra = {}) {
  const target = { url: cfg.url, env: cfg.env, profile: cfg.profile };
  print({ ...r.body, ...extra, target });
  if (!r.body?.ok) {
    const e = r.body?.error ?? {};
    process.stderr.write(`[lienstore] LỖI ${r.status} ${e.code ?? ""}: ${e.message ?? ""}\n`);
    if (e.fields) process.stderr.write(`[lienstore] trường lỗi: ${JSON.stringify(e.fields)}\n`);
    process.exit(EXIT.API);
  }
}

function guardWrite(cfg, opts) {
  if (cfg.env === "production" && !opts.yes && !opts["dry-run"]) {
    const msg = `Đích là PRODUCTION (${cfg.url}). Chạy --dry-run để xem trước, rồi thêm --yes để ghi thật.`;
    process.stderr.write(`[lienstore] ${msg}\n`);
    print({ ok: false, error: { code: "CONFIRMATION_REQUIRED", message: msg }, target: { url: cfg.url, env: cfg.env, profile: cfg.profile } });
    process.exit(EXIT.CONFIRM);
  }
}

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif" };

// ------------------------------------------------------------------------------------------------------------ commands

async function run() {
  const { pos, opts } = parseArgs(process.argv.slice(2));
  const [group, action, ...rest] = pos;
  if (!group || group === "help" || opts.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const cfg = loadConfig(opts);
  if (!cfg.token) usage(`chưa có token: đặt LIENSTORE_API_TOKEN trong ${cfg.profile === "default" ? ".env.lienstore.local" : `.env.lienstore.${cfg.profile}.local`} (xem docs/ADMIN_API.md — cấp token ở /admin/api-tokens/ hoặc npm run api-token)`);
  const tokenHint = /^lsk_/.test(cfg.token) ? `${cfg.token.slice(0, 12)}…` : "(token lạ)";
  process.stderr.write(`[lienstore] → ${cfg.url}  [${cfg.env.toUpperCase()}] profile=${cfg.profile} token=${tokenHint}\n`);

  const key = `${group} ${action ?? ""}`.trim();
  if (group === "stock") {
    const id = action === "get" ? rest[0] : action;
    if (!/^\d+$/.test(String(id ?? ""))) usage("stock <productId>");
    return finish(cfg, await call(cfg, "GET", `products/${id}/stock`));
  }
  switch (key) {
    case "whoami":
      return finish(cfg, await call(cfg, "GET", "me"));

    case "categories list":
    case "categories":
      return finish(cfg, await call(cfg, "GET", "categories"));

    case "audit":
    case "audit list":
      return finish(cfg, await call(cfg, "GET", "audit", { query: { product: opts.product, limit: opts.limit } }));

    case "products list": {
      const query = {
        search: opts.search ?? opts.q,
        category: opts.category,
        status: opts.status,
        saleStatus: opts["sale-status"],
        sku: opts.sku,
        ids: opts.ids,
        hasImage: opts["has-image"],
        priceMin: opts["price-min"],
        priceMax: opts["price-max"],
        updatedSince: opts["updated-since"],
        sort: opts.sort,
        page: opts.page,
        perPage: opts["per-page"],
        fields: opts.fields,
      };
      if (!opts["all-pages"]) return finish(cfg, await call(cfg, "GET", "products", { query }));
      const all = [];
      let r;
      for (let page = 1; page <= 50; page++) {
        r = await call(cfg, "GET", "products", { query: { ...query, page, perPage: query.perPage ?? 200 } });
        if (!r.body?.ok) return finish(cfg, r);
        all.push(...r.body.data);
        if (page >= r.body.meta.totalPages) break;
      }
      return finish(cfg, { status: 200, body: { ok: true, data: all, meta: { total: r.body.meta.total, returned: all.length } } });
    }

    case "products get": {
      const id = rest[0] ?? opts.id;
      if (!/^\d+$/.test(String(id ?? ""))) usage("products get <id>");
      return finish(cfg, await call(cfg, "GET", `products/${id}`, { query: { fields: opts.fields } }));
    }

    case "products create": {
      const body = readJsonFile(opts.file);
      guardWrite(cfg, opts);
      // same file → same key: re-running after a timeout returns the product created the first time, not a twin
      const idem = opts["idempotency-key"] ?? `create-${stableHash(body)}`;
      return finish(cfg, await call(cfg, "POST", "products", { json: body, query: { dryRun: opts["dry-run"] ? 1 : undefined, allowDuplicateSku: opts["allow-duplicate-sku"] ? 1 : undefined }, idempotencyKey: opts["dry-run"] ? undefined : idem }));
    }

    case "products update": {
      const id = rest[0] ?? opts.id;
      if (!/^\d+$/.test(String(id ?? ""))) usage("products update <id> --file patch.json | --set key=value");
      const body = opts.file ? readJsonFile(opts.file) : {};
      Object.assign(body, parseSets(opts.set));
      if (!Object.keys(body).length) usage("không có gì để cập nhật (--file hoặc --set)");
      if (opts["if-version"]) cfg.ifMatch = String(opts["if-version"]);
      guardWrite(cfg, opts);
      return finish(cfg, await call(cfg, "PATCH", `products/${id}`, { json: body, query: { dryRun: opts["dry-run"] ? 1 : undefined }, idempotencyKey: opts["dry-run"] ? undefined : (opts["idempotency-key"] ?? `update-${randomUUID()}`) }));
    }

    case "products bulk-update": {
      const body = readJsonFile(opts.file);
      guardWrite(cfg, opts);
      const r = await call(cfg, "POST", "products/bulk-update", { json: body, query: { dryRun: opts["dry-run"] ? 1 : undefined }, idempotencyKey: opts["dry-run"] ? undefined : (opts["idempotency-key"] ?? `bulk-${randomUUID()}`) });
      const extra = {};
      if (opts["dry-run"] && opts.out && r.body?.ok) {
        if (r.body.data?.apply) {
          fs.writeFileSync(path.resolve(opts.out), `${JSON.stringify(r.body.data.apply, null, 2)}\n`);
          extra.planWritten = path.resolve(opts.out);
          process.stderr.write(`[lienstore] đã ghi kế hoạch (khoá version) vào ${opts.out} — áp dụng: lienstore products bulk-update --file ${opts.out}\n`);
        } else process.stderr.write(`[lienstore] ${r.body.data?.summary?.failed ? "dry-run có mục lỗi" : "không có gì thay đổi"} — không ghi kế hoạch\n`);
      }
      return finish(cfg, r, extra);
    }

    case "media upload": {
      const files = rest.length ? rest : opts.file ? [opts.file] : [];
      if (!files.length) usage("media upload <ảnh> [<ảnh> …]");
      guardWrite(cfg, opts);
      const results = [];
      let failed = null;
      for (const f of files) {
        const abs = path.resolve(f);
        if (!fs.existsSync(abs)) usage(`không có file ${f}`);
        const mime = MIME[path.extname(abs).toLowerCase()];
        if (!mime) usage(`${f}: chỉ nhận ${Object.keys(MIME).join(" ")}`);
        const size = fs.statSync(abs).size;
        if (size > 10 * 1024 * 1024) usage(`${f}: ${(size / 1048576).toFixed(1)} MB > 10 MB`);
        const buf = fs.readFileSync(abs);
        const folder = opts.folder ?? "products";
        const label = opts.name ?? path.basename(abs);
        const form = async () => {
          const fd = new FormData();
          fd.append("file", new Blob([buf], { type: mime }), path.basename(abs));
          fd.append("folder", folder);
          fd.append("name", label);
          return fd;
        };
        // same bytes + folder → same key: a retry or a re-run returns the first upload instead of a second copy
        const r = await call(cfg, "POST", "media", { form, idempotencyKey: `media-${stableHash(createHash("sha256").update(buf).digest("hex") + folder + label)}`, timeoutMs: cfg.timeout * 4 });
        if (!r.body?.ok) {
          failed = r;
          results.push({ file: f, ok: false, error: r.body?.error });
          break;
        }
        results.push({ file: f, ok: true, ...r.body.data, ...(r.body.meta?.idempotentReplay ? { replayed: true } : {}) });
      }
      if (failed) return finish(cfg, { status: failed.status, body: { ok: false, error: failed.body?.error, data: results } });
      return finish(cfg, { status: 201, body: { ok: true, data: results.length === 1 ? results[0] : results } });
    }

    case "codes resolve": {
      const code = rest[0] ?? opts.code;
      if (!code) usage("codes resolve <mã>");
      return finish(cfg, await call(cfg, "GET", "codes/resolve", { query: { code } }));
    }

    case "shipments":
    case "shipments list":
      return finish(cfg, await call(cfg, "GET", "shipments", { query: { editable: "1" } }));
    case "shipments create": {
      guardWrite(cfg, opts);
      return finish(cfg, await call(cfg, "POST", "shipments", { json: { label: opts.label ?? "", note: opts.note ?? "" }, idempotencyKey: opts["idempotency-key"] ?? `ship-create-${randomUUID()}` }));
    }
    case "shipments get": {
      if (!/^\d+$/.test(String(rest[0] ?? ""))) usage("shipments get <id>");
      return finish(cfg, await call(cfg, "GET", `shipments/${rest[0]}`));
    }
    case "shipments pack": {
      const id = rest[0];
      if (!/^\d+$/.test(String(id ?? ""))) usage("shipments pack <id> <code|--product <id>> [--qty N]");
      guardWrite(cfg, opts);
      const code = rest[1];
      const productId = opts.product ? Number(opts.product) : undefined;
      if (!code && !productId) usage("shipments pack <id> <code> hoặc --product <id>");
      const qty = opts.qty !== undefined ? Number(opts.qty) : 1;
      return finish(cfg, await call(cfg, "POST", `shipments/${id}/pack`, { json: { code, productId, qty }, idempotencyKey: opts["idempotency-key"] ?? `pack-${randomUUID()}` }));
    }
    case "shipments unpack": {
      const id = rest[0];
      if (!/^\d+$/.test(String(id ?? "")) || !opts.product) usage("shipments unpack <id> --product <id> [--qty N]");
      guardWrite(cfg, opts);
      return finish(cfg, await call(cfg, "POST", `shipments/${id}/unpack`, { json: { productId: Number(opts.product), qty: opts.qty !== undefined ? Number(opts.qty) : 1 }, idempotencyKey: opts["idempotency-key"] ?? `unpack-${randomUUID()}` }));
    }
    case "barcodes list": {
      if (!/^\d+$/.test(String(rest[0] ?? ""))) usage("barcodes list <productId>");
      return finish(cfg, await call(cfg, "GET", `products/${rest[0]}/barcodes`, { query: { all: opts.all ? 1 : undefined } }));
    }
    case "barcodes add": {
      const [pid, code] = rest;
      if (!/^\d+$/.test(String(pid ?? "")) || !code) usage("barcodes add <productId> <mã> [--pack-qty N]");
      guardWrite(cfg, opts);
      const body = { code: String(code), packQty: opts["pack-qty"] ? Number(opts["pack-qty"]) : 1, packLabel: opts["pack-label"] ?? "", force: !!opts.force };
      return finish(cfg, await call(cfg, "POST", `products/${pid}/barcodes`, { json: body, idempotencyKey: `barcode-${stableHash(JSON.stringify([pid, body]))}` }));
    }
    case "barcodes import": {
      const raw = readJsonFile(opts.file);
      const list = Array.isArray(raw) ? raw : raw?.items;
      if (!Array.isArray(list) || !list.length) usage('barcodes import --file: mảng [{ "productId", "code" }] hoặc { "items": [...] }');
      if (list.length > 5000) usage("tối đa 5000 mục mỗi lần");
      const items = list.map((it, i) => {
        const productId = Number(it?.productId);
        const code = typeof it?.code === "string" ? it.code.trim() : "";
        if (!Number.isInteger(productId) || productId <= 0 || !code) usage(`mục ${i}: cần productId (số) và code (chuỗi)`);
        return { productId, code, packQty: it.packQty === undefined ? 1 : Number(it.packQty), packLabel: typeof it.packLabel === "string" ? it.packLabel : "", note: typeof it.note === "string" ? it.note.slice(0, 200) : "" };
      });
      if (!opts["dry-run"]) guardWrite(cfg, opts);
      const results = [];
      const count = {};
      for (const it of items) {
        let r;
        if (opts["dry-run"]) {
          // what the code is today: already ours / someone else's / free
          const res = await call(cfg, "GET", "codes/resolve", { query: { code: it.code } });
          const d = res.body?.data;
          const outcome = !res.body?.ok ? "error" : d.kind === "invalid" || d.kind === "unsupported_qr" ? "invalid" : d.kind === "unknown" ? "would_link" : d.kind === "product" && d.product.id === it.productId ? (d.via === "barcode" ? "already_linked" : "would_link") : d.kind === "product" ? (d.via === "barcode" ? "linked_elsewhere" : "sku_of_other") : d.kind === "conflict" ? (d.candidates.some((c) => c.id === it.productId) ? "would_link" : "sku_of_other") : "error";
          r = { ...it, outcome, ...(d?.product && d.product.id !== it.productId ? { otherProduct: { id: d.product.id, name: d.product.name } } : {}), ...(!res.body?.ok || outcome === "invalid" ? { message: res.body?.error?.message ?? d?.message } : {}) };
        } else {
          const body = { code: it.code, packQty: it.packQty, packLabel: it.packLabel, note: it.note, force: !!opts.force };
          const res = await call(cfg, "POST", `products/${it.productId}/barcodes`, { json: body, idempotencyKey: `barcode-${stableHash(JSON.stringify([it.productId, body]))}` });
          // a replayed Idempotency-Key = this exact link was written by an earlier run
          r = res.body?.ok ? { ...it, outcome: res.body.meta?.idempotentReplay ? "unchanged" : res.body.data.status } : { ...it, outcome: (res.body?.error?.code ?? "ERROR").toLowerCase(), message: res.body?.error?.message };
        }
        count[r.outcome] = (count[r.outcome] ?? 0) + 1;
        results.push(r);
      }
      process.stderr.write(`[lienstore] ${opts["dry-run"] ? "dry-run" : "đã ghi"}: ${JSON.stringify(count)}\n`);
      const failed = results.filter((r) => !["created", "updated", "unchanged", "already_linked", "would_link"].includes(r.outcome));
      return finish(cfg, { status: failed.length ? 207 : 200, body: { ok: !failed.length || !!opts["dry-run"], data: { dryRun: !!opts["dry-run"], summary: count, results }, ...(failed.length && !opts["dry-run"] ? { error: { code: "PARTIAL", message: `${failed.length}/${results.length} mục không liên kết được — xem results` } } : {}) } });
    }
    case "barcodes remove": {
      if (!/^\d+$/.test(String(rest[0] ?? ""))) usage("barcodes remove <barcodeId>");
      guardWrite(cfg, opts);
      return finish(cfg, await call(cfg, "DELETE", `barcodes/${rest[0]}`));
    }

    default: {
      const DOCS = { receipts: ["stock-receipts", "confirm"], counts: ["stock-counts", "close"], picks: ["picks", "complete"] };
      if (DOCS[group]) return docCommand(cfg, opts, DOCS[group][0], DOCS[group][1], action, rest);
      usage(`lệnh không rõ: ${key}`);
    }
  }
}

/** receipts / counts / picks — scan documents (docs/SCANNING.md). */
async function docCommand(cfg, opts, fam, confirmPath, action, rest) {
  const id = rest[0];
  const needId = () => {
    if (!/^\d+$/.test(String(id ?? ""))) usage(`${action} <docId>`);
  };
  const int = (v, name) => {
    if (v === undefined) return undefined;
    if (v === "null") return null;
    if (!/^\d+$/.test(String(v))) usage(`--${name} phải là số`);
    return Number(v);
  };
  switch (action) {
    case "list":
      return finish(cfg, await call(cfg, "GET", fam, { query: { status: opts.status, warehouse: opts.warehouse } }));
    case "shipments":
      return finish(cfg, await call(cfg, "GET", "stock-receipts/shipments"));
    case "orders":
      return finish(cfg, await call(cfg, "GET", "picks/orders"));
    case "carriers":
      return finish(cfg, await call(cfg, "GET", "picks/carriers"));
    case "get":
      needId();
      return finish(cfg, await call(cfg, "GET", `${fam}/${id}`));
    case "create": {
      guardWrite(cfg, opts);
      const body = { warehouse: opts.warehouse, mode: opts.mode ?? (opts.shipment ? "shipment" : undefined), shipmentId: int(opts.shipment, "shipment"), orderId: opts.order, orderNumber: int(opts["order-number"], "order-number"), note: opts.note };
      return finish(cfg, await call(cfg, "POST", fam, { json: body, idempotencyKey: opts["idempotency-key"] ?? `create-${randomUUID()}` }));
    }
    case "scan": {
      needId();
      const code = rest[1];
      if (!code) usage("scan <docId> <mã> [--qty N]");
      guardWrite(cfg, opts);
      // one CLI call = one deliberate scan; network retries inside reuse the same opId (never counted twice)
      const opId = opts["op-id"] ?? `cli-${randomUUID()}`;
      return finish(cfg, await call(cfg, "POST", `${fam}/${id}/scans`, { json: { code: String(code), opId, qty: int(opts.qty, "qty") }, idempotencyKey: `scan-${opId}` }));
    }
    case "add-line": {
      needId();
      if (!/^\d+$/.test(String(rest[1] ?? ""))) usage("add-line <docId> <productId>");
      guardWrite(cfg, opts);
      return finish(cfg, await call(cfg, "POST", `${fam}/${id}/lines`, { json: { productId: Number(rest[1]) }, idempotencyKey: `line-${randomUUID()}` }));
    }
    case "set-line": {
      needId();
      if (!/^\d+$/.test(String(rest[1] ?? ""))) usage("set-line <docId> <lineId> --rev R …");
      if (opts.rev === undefined) usage("--rev (lấy từ get) là bắt buộc — tránh ghi đè sửa của máy khác");
      guardWrite(cfg, opts);
      const body = { rev: int(opts.rev, "rev"), qty: int(opts.qty, "qty"), expiry: opts.expiry === "null" ? null : opts.expiry, unitCostJpy: int(opts["cost-jpy"], "cost-jpy"), billCode: opts.bill, recount: opts.recount ? true : undefined, acceptDrift: opts["accept-drift"] ? true : undefined };
      return finish(cfg, await call(cfg, "PATCH", `${fam}/${id}/lines/${rest[1]}`, { json: body }));
    }
    case "undo":
      needId();
      guardWrite(cfg, opts);
      return finish(cfg, await call(cfg, "POST", `${fam}/${id}/undo`, { json: opts["op-id"] ? { opId: opts["op-id"] } : {} }));
    case "confirm":
    case "close":
    case "complete": {
      needId();
      if (opts.version === undefined) usage("--version (lấy từ get, sau khi đã xem lại phiếu) là bắt buộc");
      guardWrite(cfg, opts);
      const version = int(opts.version, "version");
      const json = fam === "picks" ? { version, method: opts.method, tracking: opts.tracking } : { version };
      return finish(cfg, await call(cfg, "POST", `${fam}/${id}/${confirmPath}`, { json, idempotencyKey: `confirm-${fam}-${id}-${version}-${stableHash(JSON.stringify(json)).slice(0, 12)}` }));
    }
    case "cancel":
      needId();
      guardWrite(cfg, opts);
      return finish(cfg, await call(cfg, "POST", `${fam}/${id}/cancel`, { json: {}, idempotencyKey: `cancel-${fam}-${id}` }));
    default:
      usage(`lệnh không rõ: ${fam} ${action ?? ""}`);
  }
}

run().catch((e) => {
  const network = !!e?.network;
  process.stderr.write(`[lienstore] ${network ? "LỖI MẠNG" : "LỖI"}: ${e?.message ?? e}\n`);
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code: network ? "NETWORK" : "CLI_ERROR", message: String(e?.message ?? e) } }, null, 2)}\n`);
  process.exit(network ? EXIT.NETWORK : EXIT.API);
});
