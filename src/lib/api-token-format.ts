import { createHash, randomBytes } from "node:crypto";

/**
 * Admin API v1 tokens — pure helpers (no database), shared by the server, the admin page and the tests.
 *
 * Raw token: `lsk_` + 43 chars base64url (32 random bytes). Only `sha256(raw)` is stored; the first 12 characters
 * (`lsk_xxxxxxxx`) are kept as a non-secret prefix so a token can be recognised in lists and audit rows.
 */
export { API_SCOPES, API_SCOPE_LABELS, isApiScope, sanitizeScopes, SCOPE_MODULE, scopeAllowed, type ApiScope } from "@/lib/api-scopes";

const TOKEN_RE = /^lsk_[A-Za-z0-9_-]{43}$/;
export const TOKEN_PREFIX_LEN = 12;

export function generateRawToken(): string {
  return `lsk_${randomBytes(32).toString("base64url")}`;
}

export function looksLikeToken(raw: string): boolean {
  return TOKEN_RE.test(raw);
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function tokenPrefix(raw: string): string {
  return raw.slice(0, TOKEN_PREFIX_LEN);
}

/** "Bearer <token>" → token, else null. */
export function bearerFrom(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return m ? m[1] : null;
}

/** Expiry from a number of days (0 / blank = never). */
export function expiryFromDays(days: number | null | undefined, now = new Date()): string | null {
  if (!days || !Number.isFinite(days) || days <= 0) return null;
  return new Date(now.getTime() + Math.round(days * 86400000)).toISOString();
}
