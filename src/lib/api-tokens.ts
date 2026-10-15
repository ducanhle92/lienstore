import "server-only";
import { createHash } from "node:crypto";
import { findCustomerByLogin, getCustomerById, hasOwnerAccount } from "@/lib/db";
import { effectivePermissions, isAdminRole } from "@/lib/permissions";
import { type ApiScope, generateRawToken, hashToken, looksLikeToken, sanitizeScopes, scopeAllowed, tokenPrefix } from "@/lib/api-token-format";
import { getDb, withTransaction } from "@/lib/sqlite";

/**
 * Admin API v1 tokens, audit log and idempotency records (tables from migration 73).
 *
 * A token always acts FOR an admin account (its owner): every request re-checks that the owner is still active, still
 * has admin access and still holds the module behind each scope, so demoting / locking the account switches its tokens
 * off. Only the SHA-256 of the raw token is stored; the raw value is returned once by `createApiToken`.
 */

export interface ApiTokenInfo {
  id: number;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  ownerId: string;
  ownerLabel: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: string;
  lastUsedAt: string | null;
  lastUsedIp: string;
  state: "active" | "expired" | "revoked";
}

interface TokenRow {
  id: number;
  name: string;
  prefix: string;
  token_hash: string;
  scopes: string;
  owner_id: string;
  owner_label: string;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: string;
  last_used_at: string | null;
  last_used_ip: string;
}

function parseScopes(s: string): ApiScope[] {
  try {
    return sanitizeScopes(JSON.parse(s));
  } catch {
    return [];
  }
}

function rowToInfo(r: TokenRow, now = Date.now()): ApiTokenInfo {
  const state = r.revoked_at ? "revoked" : r.expires_at && Date.parse(r.expires_at) <= now ? "expired" : "active";
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    scopes: parseScopes(r.scopes),
    ownerId: r.owner_id,
    ownerLabel: r.owner_label,
    createdBy: r.created_by,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    revokedBy: r.revoked_by,
    lastUsedAt: r.last_used_at,
    lastUsedIp: r.last_used_ip,
    state,
  };
}

/** The admin a token acts for, with its current module permissions; null when it may not use the admin any more. */
async function resolveOwner(ownerId: string): Promise<{ id: string; label: string; permissions: string[] } | null> {
  if (ownerId === "env") {
    if (await hasOwnerAccount()) return null; // the env bootstrap account retires once the owner row exists
    return { id: "env", label: process.env.ADMIN_USER ?? "admin", permissions: effectivePermissions("owner", []) };
  }
  const c = await getCustomerById(ownerId);
  if (!c || !c.active || !isAdminRole(c.role)) return null;
  const name = `${c.lastName} ${c.firstName}`.trim();
  return { id: c.id, label: name || c.username || c.email, permissions: effectivePermissions(c.role, c.permissions) };
}

/** Look up an admin account by login ID / email (for `npm run api-token`). */
export async function findTokenOwner(login: string): Promise<{ id: string; label: string; permissions: string[] } | null> {
  const c = await findCustomerByLogin(login);
  return c ? resolveOwner(c.id) : null;
}

export async function createApiToken(input: { name: string; scopes: ApiScope[]; ownerId: string; createdBy: string; expiresAt: string | null }): Promise<{ token: string; info: ApiTokenInfo }> {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error("Cần đặt tên cho token (ví dụ: T3 Code agent).");
  const scopes = sanitizeScopes(input.scopes);
  if (!scopes.length) throw new Error("Chọn ít nhất một quyền cho token.");
  if (input.expiresAt && Date.parse(input.expiresAt) <= Date.now()) throw new Error("Ngày hết hạn phải ở tương lai.");
  const owner = await resolveOwner(input.ownerId);
  if (!owner) throw new Error("Tài khoản chủ token không còn quyền quản trị.");
  const missing = scopes.filter((s) => !scopeAllowed(s, owner.permissions));
  if (missing.length) throw new Error(`Tài khoản ${owner.label} không có quyền cho: ${missing.join(", ")}.`);
  const token = generateRawToken();
  const now = new Date().toISOString();
  const db = getDb();
  const res = db
    .prepare("INSERT INTO api_tokens (name, prefix, token_hash, scopes, owner_id, owner_label, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(name, tokenPrefix(token), hashToken(token), JSON.stringify(scopes), owner.id, owner.label, input.createdBy.slice(0, 120), now, input.expiresAt);
  const id = Number(res.lastInsertRowid);
  recordAudit({ actor: input.createdBy, tokenId: id, action: "token.create", target: `token:${id}`, changes: { name, prefix: tokenPrefix(token), scopes, owner: owner.label, expiresAt: input.expiresAt } });
  return { token, info: (await getApiToken(id))! };
}

export async function getApiToken(id: number): Promise<ApiTokenInfo | null> {
  const r = getDb().prepare("SELECT * FROM api_tokens WHERE id = ?").get(id) as TokenRow | undefined;
  return r ? rowToInfo(r) : null;
}

export async function listApiTokens(): Promise<ApiTokenInfo[]> {
  return (getDb().prepare("SELECT * FROM api_tokens ORDER BY revoked_at IS NOT NULL, id DESC").all() as unknown as TokenRow[]).map((r) => rowToInfo(r));
}

export async function revokeApiToken(id: number, by: string): Promise<boolean> {
  const now = new Date().toISOString();
  const res = getDb().prepare("UPDATE api_tokens SET revoked_at = ?, revoked_by = ? WHERE id = ? AND revoked_at IS NULL").run(now, by.slice(0, 120), id);
  const ok = Number(res.changes) > 0;
  if (ok) recordAudit({ actor: by, tokenId: id, action: "token.revoke", target: `token:${id}` });
  return ok;
}

// ---------- request authentication ----------

export interface ApiPrincipal {
  tokenId: number;
  tokenName: string;
  prefix: string;
  /** Scopes granted to the token that the owner can still use. */
  scopes: ApiScope[];
  ownerId: string;
  ownerLabel: string;
  /** The owner's admin module permissions (e.g. "see_cost"). */
  permissions: string[];
  /** Label written into histories and the audit log. */
  actor: string;
}

export type ApiAuthFailure = { code: "UNAUTHORIZED" | "TOKEN_INVALID" | "TOKEN_EXPIRED" | "TOKEN_REVOKED" | "TOKEN_OWNER_INACTIVE"; message: string };

const LAST_USED_EVERY_MS = 60_000;

/** Validates a raw Bearer token. Never logs or returns the token itself. */
export async function authenticateApiToken(raw: string | null, ip = ""): Promise<{ ok: true; principal: ApiPrincipal } | { ok: false; error: ApiAuthFailure }> {
  if (!raw) return { ok: false, error: { code: "UNAUTHORIZED", message: "Thiếu header Authorization: Bearer <token>." } };
  if (!looksLikeToken(raw)) return { ok: false, error: { code: "TOKEN_INVALID", message: "Token không hợp lệ." } };
  const db = getDb();
  const r = db.prepare("SELECT * FROM api_tokens WHERE token_hash = ?").get(hashToken(raw)) as TokenRow | undefined;
  if (!r) return { ok: false, error: { code: "TOKEN_INVALID", message: "Token không hợp lệ." } };
  const info = rowToInfo(r);
  if (info.state === "revoked") return { ok: false, error: { code: "TOKEN_REVOKED", message: `Token ${info.prefix}… đã bị thu hồi.` } };
  if (info.state === "expired") return { ok: false, error: { code: "TOKEN_EXPIRED", message: `Token ${info.prefix}… đã hết hạn (${info.expiresAt}).` } };
  const owner = await resolveOwner(r.owner_id);
  if (!owner) return { ok: false, error: { code: "TOKEN_OWNER_INACTIVE", message: `Tài khoản chủ của token ${info.prefix}… không còn quyền quản trị.` } };
  const now = Date.now();
  if (!r.last_used_at || now - Date.parse(r.last_used_at) > LAST_USED_EVERY_MS || r.last_used_ip !== ip) {
    db.prepare("UPDATE api_tokens SET last_used_at = ?, last_used_ip = ? WHERE id = ?").run(new Date(now).toISOString(), ip.slice(0, 64), r.id);
  }
  return {
    ok: true,
    principal: {
      tokenId: r.id,
      tokenName: r.name,
      prefix: r.prefix,
      scopes: info.scopes.filter((s) => scopeAllowed(s, owner.permissions)),
      ownerId: owner.id,
      ownerLabel: owner.label,
      permissions: owner.permissions,
      actor: `API ${r.name} (${owner.label})`,
    },
  };
}

// ---------- audit log ----------

const SECRET_KEY_RE = /token|password|secret|authorization|cookie|api[-_]?key/i;

/** Deep copy without secret-looking keys; long strings are shortened so a description edit does not bloat the log. */
export function redactForAudit(v: unknown, depth = 0): unknown {
  if (depth > 6) return "…";
  if (typeof v === "string") return v.length > 2000 ? `${v.slice(0, 2000)}… (${v.length} ký tự)` : v;
  if (Array.isArray(v)) return v.map((x) => redactForAudit(x, depth + 1));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = SECRET_KEY_RE.test(k) ? "[redacted]" : redactForAudit(x, depth + 1);
    return out;
  }
  return v;
}

export interface AuditEntry {
  actor: string;
  tokenId?: number | null;
  action: string;
  target?: string;
  changes?: unknown;
  status?: "ok" | "error";
  requestId?: string;
  ip?: string;
}

export function recordAudit(e: AuditEntry): void {
  getDb()
    .prepare("INSERT INTO api_audit_log (at, actor, token_id, action, target, changes, status, request_id, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(new Date().toISOString(), e.actor.slice(0, 200), e.tokenId ?? null, e.action, e.target ?? "", JSON.stringify(redactForAudit(e.changes ?? {})), e.status ?? "ok", e.requestId ?? "", (e.ip ?? "").slice(0, 64));
}

export interface AuditRow {
  id: number;
  at: string;
  actor: string;
  tokenId: number | null;
  action: string;
  target: string;
  changes: unknown;
  status: string;
  requestId: string;
}

export async function listAudit(opts: { target?: string; limit?: number } = {}): Promise<AuditRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const rows = (
    opts.target
      ? getDb().prepare("SELECT * FROM api_audit_log WHERE target = ? ORDER BY id DESC LIMIT ?").all(opts.target, limit)
      : getDb().prepare("SELECT * FROM api_audit_log ORDER BY id DESC LIMIT ?").all(limit)
  ) as unknown as Array<{ id: number; at: string; actor: string; token_id: number | null; action: string; target: string; changes: string; status: string; request_id: string }>;
  return rows.map((r) => {
    let changes: unknown = {};
    try {
      changes = JSON.parse(r.changes);
    } catch {
      changes = r.changes;
    }
    return { id: r.id, at: r.at, actor: r.actor, tokenId: r.token_id, action: r.action, target: r.target, changes, status: r.status, requestId: r.request_id };
  });
}

// ---------- idempotency ----------

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,200}$/;

export function requestHash(method: string, path: string, body: string): string {
  return createHash("sha256").update(`${method}\n${path}\n${body}`).digest("hex");
}

export type IdempotencyStart = { state: "new" } | { state: "replay"; status: number; body: string } | { state: "in_progress" } | { state: "mismatch" };

/** Claims `key` for this token. Synchronous, so two concurrent requests with the same key cannot both get "new". */
export function beginIdempotent(tokenId: number, key: string, hash: string): IdempotencyStart {
  const db = getDb();
  return withTransaction(db, () => {
    db.prepare("DELETE FROM api_idempotency WHERE created_at < ?").run(new Date(Date.now() - IDEMPOTENCY_TTL_MS).toISOString());
    const cur = db.prepare("SELECT request_hash, status, response FROM api_idempotency WHERE token_id = ? AND key = ?").get(tokenId, key) as { request_hash: string; status: number | null; response: string | null } | undefined;
    if (!cur) {
      db.prepare("INSERT INTO api_idempotency (token_id, key, request_hash, status, response, created_at) VALUES (?, ?, ?, NULL, NULL, ?)").run(tokenId, key, hash, new Date().toISOString());
      return { state: "new" } as const;
    }
    if (cur.request_hash !== hash) return { state: "mismatch" } as const;
    if (cur.status === null) return { state: "in_progress" } as const;
    return { state: "replay", status: cur.status, body: cur.response ?? "" } as const;
  });
}

/** Stores the final response (2xx/4xx); a 5xx or a thrown error releases the key so the client may retry. */
export function finishIdempotent(tokenId: number, key: string, status: number, body: string): void {
  const db = getDb();
  if (status >= 500) db.prepare("DELETE FROM api_idempotency WHERE token_id = ? AND key = ?").run(tokenId, key);
  else db.prepare("UPDATE api_idempotency SET status = ?, response = ? WHERE token_id = ? AND key = ?").run(status, body, tokenId, key);
}
