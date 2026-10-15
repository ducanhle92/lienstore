import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { API_SCOPES, type ApiScope, bearerFrom, scopeAllowed } from "@/lib/api-token-format";
import { authenticateApiToken, beginIdempotent, finishIdempotent, IDEMPOTENCY_KEY_RE, requestHash } from "@/lib/api-tokens";
import { MediaError } from "@/lib/media-service";
import { ProductServiceError } from "@/lib/product-service";
import { DomainError } from "@/lib/service-error";

/**
 * HTTP plumbing for the Admin API v1 (`/api/admin/v1/**`).
 *
 * Identity: `Authorization: Bearer lsk_…` (agents / CLI) OR the signed-in admin's session cookie (admin web pages such as
 * the phone scanner). Both become one `Principal` with the same permission model, so services never care which.
 * Cookie-authenticated writes must pass a CSRF check: same-origin `Origin`/`Sec-Fetch-Site` AND the custom header
 * `X-Lien-Csrf: 1` (a cross-site form cannot set it). Bearer requests carry no ambient credentials, so they skip it.
 *
 * Responses: `{ ok: true, data, meta }` or `{ ok: false, error: { code, message, … }, meta }`, `Cache-Control: no-store`,
 * `X-Request-Id`. Writes may send `Idempotency-Key`: the first response is stored and replayed for the same key + body.
 */

export interface Principal {
  kind: "token" | "session";
  /** Label written into histories and the audit log. */
  actor: string;
  tokenId: number | null;
  /** Admin account the request acts for ("env" = bootstrap account). */
  userId: string;
  userLabel: string;
  /** Admin module permissions of that account. */
  permissions: string[];
  /** API scopes usable on this request. */
  scopes: ApiScope[];
  tokenName?: string;
  tokenPrefix?: string;
}

export interface ApiContext {
  req: NextRequest;
  principal: Principal;
  requestId: string;
  ip: string;
}

const MAX_JSON_BYTES = 1024 * 1024;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function baseHeaders(requestId: string): Record<string, string> {
  return { "Cache-Control": "no-store", "X-Request-Id": requestId, "Content-Type": "application/json; charset=utf-8" };
}

export function okBody(data: unknown, requestId: string, meta: Record<string, unknown> = {}): string {
  return JSON.stringify({ ok: true, data, meta: { requestId, ...meta } });
}

export function errorBody(status: number, code: string, message: string, requestId: string, details: Record<string, unknown> = {}): string {
  // details never override the error's own code / message / status
  return JSON.stringify({ ok: false, error: { ...details, code, message, status }, meta: { requestId } });
}

export function clientIp(req: NextRequest): string {
  return (req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "").trim();
}

/** Same-origin check for cookie-authenticated writes. */
function csrfOk(req: NextRequest): boolean {
  if (req.headers.get("x-lien-csrf") !== "1") return false;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return !!site; // no Origin: only trust browsers that told us the request is same-origin
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function resolvePrincipal(req: NextRequest, ip: string, write: boolean): Promise<Principal> {
  const auth = req.headers.get("authorization");
  if (auth) {
    const raw = bearerFrom(auth);
    const r = await authenticateApiToken(raw, ip);
    if (!r.ok) throw new ApiError(401, r.error.code, r.error.message);
    const p = r.principal;
    return { kind: "token", actor: p.actor, tokenId: p.tokenId, userId: p.ownerId, userLabel: p.ownerLabel, permissions: p.permissions, scopes: p.scopes, tokenName: p.tokenName, tokenPrefix: p.prefix };
  }
  const s = await getAdminSession();
  if (!s) throw new ApiError(401, "UNAUTHORIZED", "Thiếu header Authorization: Bearer <token> (hoặc phiên đăng nhập quản trị).");
  if (write && !csrfOk(req)) throw new ApiError(403, "CSRF_FAILED", "Yêu cầu ghi bằng phiên đăng nhập phải gửi từ chính trang quản trị (thiếu X-Lien-Csrf / sai Origin).");
  return { kind: "session", actor: s.label, tokenId: null, userId: s.id, userLabel: s.label, permissions: s.permissions, scopes: API_SCOPES.filter((sc) => scopeAllowed(sc, s.permissions)) };
}

export function requireScope(p: Principal, scope: ApiScope): void {
  if (!p.scopes.includes(scope)) {
    throw new ApiError(403, "FORBIDDEN", p.kind === "token" ? `Token thiếu quyền "${scope}" (hoặc tài khoản chủ token không còn quyền tương ứng).` : `Tài khoản không có quyền "${scope}".`, { requiredScope: scope });
  }
}

export function requirePermission(p: Principal, module: string): void {
  if (!p.permissions.includes(module)) throw new ApiError(403, "FORBIDDEN", `Tài khoản ${p.userLabel} không có quyền "${module}".`, { requiredPermission: module });
}

/** Reads a JSON body (≤ 1 MB). */
export async function readJson(req: NextRequest): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_JSON_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Body JSON tối đa 1 MB.");
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_JSON_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Body JSON tối đa 1 MB.");
  if (!text.trim()) throw new ApiError(400, "INVALID_JSON", "Body trống — cần JSON.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Body không phải JSON hợp lệ.");
  }
}

export function queryFlag(req: NextRequest, name: string): boolean {
  const v = req.nextUrl.searchParams.get(name);
  return v === "1" || v === "true" || v === "yes";
}

function toErrorResponse(e: unknown, requestId: string): { status: number; body: string } {
  if (e instanceof ApiError) return { status: e.status, body: errorBody(e.status, e.code, e.message, requestId, e.details) };
  if (e instanceof ProductServiceError) return { status: e.status, body: errorBody(e.status, e.code, e.message, requestId, e.details) };
  if (e instanceof DomainError) return { status: e.status, body: errorBody(e.status, e.code, e.message, requestId, e.details) };
  if (e instanceof MediaError) return { status: e.status, body: errorBody(e.status, e.code, e.message, requestId) };
  console.error(`[api v1] ${requestId} internal error:`, e instanceof Error ? e.stack ?? e.message : e);
  return { status: 500, body: errorBody(500, "INTERNAL", "Lỗi máy chủ — xem log với requestId này.", requestId) };
}

/** Request body as compared for idempotency: raw text, or for multipart the fields + file hashes (boundaries vary). */
async function bodyFingerprint(req: NextRequest): Promise<string> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) return req.clone().text();
  let form: FormData;
  try {
    form = await req.clone().formData();
  } catch {
    return req.clone().text();
  }
  const parts: string[] = [];
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") parts.push(`${k}=${v}`);
    else parts.push(`${k}=file:${v.name}:${v.type}:${createHash("sha256").update(Buffer.from(await v.arrayBuffer())).digest("hex")}`);
  }
  return parts.sort().join("\n");
}

type Handler = (ctx: ApiContext) => Promise<{ status?: number; data: unknown; meta?: Record<string, unknown> }>;

/**
 * Wraps a route handler: request id, authentication (+ CSRF for cookie writes), scope check, idempotency for writes,
 * JSON envelope and error mapping. `idempotent: true` makes the `Idempotency-Key` header honoured (and stored).
 */
export function apiRoute(opts: { scope: ApiScope | null; write?: boolean; idempotent?: boolean }, handler: Handler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const requestId = randomUUID();
    const ip = clientIp(req);
    let idem: { tokenId: number; key: string } | null = null;
    try {
      const principal = await resolvePrincipal(req, ip, !!opts.write);
      if (opts.scope) requireScope(principal, opts.scope);

      if (opts.idempotent) {
        const key = req.headers.get("idempotency-key");
        if (key) {
          if (!IDEMPOTENCY_KEY_RE.test(key)) throw new ApiError(400, "BAD_IDEMPOTENCY_KEY", "Idempotency-Key: 8–200 ký tự [A-Za-z0-9._:-].");
          // the body is part of the fingerprint (read from a clone; the handler reads the original)
          const text = await bodyFingerprint(req);
          const scopedKey = principal.tokenId === null ? `u:${principal.userId}:${key}` : key;
          const tokenId = principal.tokenId ?? 0;
          const start = beginIdempotent(tokenId, scopedKey, requestHash(req.method, req.nextUrl.pathname + req.nextUrl.search, text));
          if (start.state === "mismatch") throw new ApiError(422, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key này đã dùng cho một yêu cầu khác — tạo key mới cho thao tác mới.");
          if (start.state === "in_progress") throw new ApiError(409, "IDEMPOTENCY_IN_PROGRESS", "Yêu cầu cùng Idempotency-Key đang được xử lý — thử lại sau giây lát.");
          if (start.state === "replay") return new NextResponse(start.body, { status: start.status, headers: { ...baseHeaders(requestId), "Idempotent-Replayed": "true" } });
          idem = { tokenId, key: scopedKey };
        }
      }

      const r = await handler({ req, principal, requestId, ip });
      const status = r.status ?? 200;
      const body = okBody(r.data, requestId, r.meta);
      if (idem) finishIdempotent(idem.tokenId, idem.key, status, body);
      return new NextResponse(body, { status, headers: baseHeaders(requestId) });
    } catch (e) {
      const { status, body } = toErrorResponse(e, requestId);
      if (idem) finishIdempotent(idem.tokenId, idem.key, status, body);
      return new NextResponse(body, { status, headers: baseHeaders(requestId) });
    }
  };
}

/** Variant for dynamic segments (`[id]`): passes the awaited params. */
export function apiRouteWithParams<P>(opts: { scope: ApiScope | null; write?: boolean; idempotent?: boolean }, handler: (ctx: ApiContext, params: P) => ReturnType<Handler>) {
  return async (req: NextRequest, segment: { params: Promise<P> }): Promise<NextResponse> => {
    const params = await segment.params;
    return apiRoute(opts, (ctx) => handler(ctx, params))(req);
  };
}

export function parseId(raw: string): number {
  const id = /^\d{1,9}$/.test(raw) ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "BAD_REQUEST", `ID không hợp lệ: ${raw}`);
  return id;
}
