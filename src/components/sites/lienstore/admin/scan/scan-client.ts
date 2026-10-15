/**
 * Browser side of the Admin API v1 for the scan screen: the admin's session cookie + the CSRF header the API demands
 * for cookie writes. No token is ever stored in the browser. Writes carry an Idempotency-Key (and scans an opId), so a
 * request whose answer was lost can be sent again safely; only those are retried.
 */
export type ApiResult<T> = { ok: true; data: T; meta?: Record<string, unknown> } | { ok: false; status: number; network: boolean; error: { code: string; message: string; [k: string]: unknown } };

const BASE = "/api/admin/v1/";

export function newOpId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function api<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, opts: { body?: unknown; query?: Record<string, string | number | undefined>; idempotencyKey?: string; timeoutMs?: number } = {}): Promise<ApiResult<T>> {
  const url = new URL(BASE + path.replace(/^\/+/, ""), window.location.origin);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") headers["X-Lien-Csrf"] = "1";
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const safeToRetry = method === "GET" || !!opts.idempotencyKey;
  const attempts = safeToRetry ? 3 : 1;
  let last: ApiResult<T> = { ok: false, status: 0, network: true, error: { code: "NETWORK", message: "Mất kết nối tới máy chủ." } };
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(opts.timeoutMs ?? 15000) });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; meta?: Record<string, unknown>; error?: { code: string; message: string } } | null;
      if (res.ok && json?.ok) return { ok: true, data: json.data as T, meta: json.meta };
      const inProgress = res.status === 409 && json?.error?.code === "IDEMPOTENCY_IN_PROGRESS";
      last = { ok: false, status: res.status, network: false, error: json?.error ?? { code: `HTTP_${res.status}`, message: `Máy chủ trả lỗi ${res.status}.` } };
      if (!(safeToRetry && (res.status >= 502 || inProgress)) || i === attempts) return last;
    } catch (e) {
      const timeout = e instanceof DOMException && e.name === "TimeoutError";
      last = { ok: false, status: 0, network: true, error: { code: timeout ? "TIMEOUT" : "NETWORK", message: timeout ? "Máy chủ không trả lời kịp." : "Mất kết nối tới máy chủ." } };
      if (i === attempts) return last;
    }
    await new Promise((r) => setTimeout(r, 600 * i));
  }
  return last;
}
