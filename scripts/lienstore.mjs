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

Global: --profile <name>  --yes (required for writes when the target is production)  --timeout <ms>
--file - reads JSON from stdin. --set key=value parses value as JSON when possible (numbers, null, ["a","b"]).`;

// ---------------------------------------------------------------------------------------------------------------- args

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  const multi = new Set(["set"]);
  const flags = new Set(["dry-run", "yes", "all-pages", "allow-duplicate-sku", "help", "h"]);
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

    default:
      usage(`lệnh không rõ: ${key}`);
  }
}

run().catch((e) => {
  const network = !!e?.network;
  process.stderr.write(`[lienstore] ${network ? "LỖI MẠNG" : "LỖI"}: ${e?.message ?? e}\n`);
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code: network ? "NETWORK" : "CLI_ERROR", message: String(e?.message ?? e) } }, null, 2)}\n`);
  process.exit(network ? EXIT.NETWORK : EXIT.API);
});
