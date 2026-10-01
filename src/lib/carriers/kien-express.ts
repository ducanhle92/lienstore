import { CARRIER_STEPS, carrierStepIndex, type ShipmentStatus } from "../shipments";

/**
 * Kiến Express tracking (JP → VN parcels) — the pure half: code validation, the fixed-host fetch with timeout / retry,
 * response normalisation and the "what does this mean for the run" decision. No DB, no server-only, so it is unit-tested
 * with fixtures (scripts/tests/kien.test.ts); lib/kien-sync.ts does the storing.
 *
 * Endpoint (observed 2026-10, no auth, no partner contract — may change without notice):
 *   GET https://api.kienexpress.jp/orders/search?code=KEA…  → { id, orderId, code, providerTrackingCode, histories: [...] }
 *   unknown code → HTTP 404
 * `id` and `orderId` are Kiến's own ids (not always equal); `providerTrackingCode` is the airline / domestic reference
 * and is NOT unique per parcel (two KEA codes can share one PU… pickup), so everything is keyed by the KEA code.
 */

export const KIEN_API_HOST = "https://api.kienexpress.jp";
/** The only path the backend ever calls — the code is URL-encoded, nothing else from the user reaches the URL. */
export const kienSearchUrl = (code: string): string => `${KIEN_API_HOST}/orders/search?code=${encodeURIComponent(code)}`;
/** Public tracking page on Kiến's site ("Xem trên Kiến"). */
export const kienTrackingPageUrl = (code: string): string => `http://kienexpress.jp/tracking/${encodeURIComponent(code)}`;

const CODE_RE = /^KEA\d{6,12}$/;
/** Upper-cased, trimmed; "" when the input is not a KEA… code at all. */
export function normalizeKienCode(raw: string | null | undefined): string {
  const c = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return CODE_RE.test(c) ? c : "";
}
export const isKienCode = (raw: string | null | undefined): boolean => normalizeKienCode(raw) !== "";

export type KienStatusCode = "waiting" | "warehouse_jp" | "shipping" | "warehouse_hn" | "delivered";
export const KIEN_STATUS_CODES: KienStatusCode[] = ["waiting", "warehouse_jp", "shipping", "warehouse_hn", "delivered"];
export const isKienStatusCode = (v: unknown): v is KienStatusCode => typeof v === "string" && (KIEN_STATUS_CODES as string[]).includes(v);
/** Position of an API state on the 5-step strip (−1 for a state we do not know). */
export const kienStepIndex = (code: string): number => KIEN_STATUS_CODES.indexOf(code as KienStatusCode);
/** Fallback labels (the API sends its own `status.label`; these cover a missing one). */
export const KIEN_STATUS_LABEL: Record<KienStatusCode, string> = {
  waiting: "Nhận yêu cầu",
  warehouse_jp: "Kho JP đang xử lý",
  shipping: "Đang vận chuyển",
  warehouse_hn: "Kho HN đang xử lý",
  delivered: "Đã giao hàng xong",
};

export interface KienEvent {
  /** API statusCode as sent (kept even when unknown to us). */
  code: string;
  label: string;
  /** ISO 8601 UTC. */
  at: string;
  /** false = a status this app does not know — shown as-is, never mapped to a run status. */
  known: boolean;
}
export interface KienTracking {
  code: string;
  kienId: string;
  kienOrderId: string;
  providerTrackingCode: string;
  /** Newest event by datetime (null when the parcel has no history yet). */
  latest: KienEvent | null;
  /** Ascending by datetime, de-duplicated on (code, at). */
  events: KienEvent[];
  /** Status codes in the history this app does not know. */
  unknownCodes: string[];
}

export type KienFetchFailure = { ok: false; kind: "invalid" | "not_found" | "mismatch" | "http" | "network" | "timeout" | "parse"; message: string; status?: number };
export type KienFetchResult = { ok: true; data: KienTracking } | KienFetchFailure;

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v)).trim();
const isoOrNull = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** Normalise the API body for `expectedCode`; the returned code must match (Kiến's search is exact, but we never trust it). */
export function parseKienResponse(body: unknown, expectedCode: string): KienFetchResult {
  const want = normalizeKienCode(expectedCode);
  if (!want) return { ok: false, kind: "invalid", message: "Mã KEA… không hợp lệ." };
  if (!body || typeof body !== "object") return { ok: false, kind: "parse", message: "Kiến trả về dữ liệu không đọc được." };
  const o = body as Record<string, unknown>;
  const code = normalizeKienCode(str(o.code));
  if (!code) return { ok: false, kind: "parse", message: "Kiến trả về bản ghi không có mã KEA." };
  if (code !== want) return { ok: false, kind: "mismatch", message: `Kiến trả về mã ${code} thay vì ${want} — bỏ qua.` };
  const raw = Array.isArray(o.histories) ? o.histories : [];
  const seen = new Set<string>();
  const events: KienEvent[] = [];
  const unknown = new Set<string>();
  for (const h of raw) {
    if (!h || typeof h !== "object") continue;
    const r = h as Record<string, unknown>;
    const st = r.status && typeof r.status === "object" ? (r.status as Record<string, unknown>) : {};
    const codeOf = str(r.statusCode) || str(st.code);
    const at = isoOrNull(r.datetime);
    if (!codeOf || !at) continue;
    const key = `${codeOf}|${at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const known = isKienStatusCode(codeOf);
    if (!known) unknown.add(codeOf);
    events.push({ code: codeOf, label: str(st.label) || (known ? KIEN_STATUS_LABEL[codeOf as KienStatusCode] : codeOf), at, known });
  }
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : kienStepIndex(a.code) - kienStepIndex(b.code)));
  return {
    ok: true,
    data: {
      code,
      kienId: str(o.id),
      kienOrderId: str(o.orderId),
      providerTrackingCode: str(o.providerTrackingCode),
      latest: events.length ? events[events.length - 1] : null,
      events,
      unknownCodes: [...unknown],
    },
  };
}

export type KienFetcher = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{ status: number; headers?: { get(name: string): string | null }; json(): Promise<unknown> }>;

export interface KienFetchOptions {
  fetcher?: KienFetcher;
  timeoutMs?: number;
  /** Retries on network errors / 429 / 5xx (not on 404). */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Cap on a Retry-After wait so a hostile header cannot park the job. */
  maxRetryAfterMs?: number;
}

const retryAfterMs = (h: { get(name: string): string | null } | undefined): number | null => {
  const v = h?.get("retry-after");
  if (!v) return null;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.max(0, t - Date.now()) : null;
};

/** One tracked parcel from the fixed Kiến host. Never throws; the caller decides what a failure means. */
export async function fetchKienTracking(rawCode: string, opts: KienFetchOptions = {}): Promise<KienFetchResult> {
  const code = normalizeKienCode(rawCode);
  if (!code) return { ok: false, kind: "invalid", message: "Mã KEA… không hợp lệ (VD KEA260930002)." };
  const fetcher: KienFetcher = opts.fetcher ?? ((url, init) => fetch(url, { ...init, cache: "no-store" }));
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const retries = opts.retries ?? 2;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxWait = opts.maxRetryAfterMs ?? 30_000;
  let last: KienFetchFailure = { ok: false, kind: "network", message: "Không gọi được Kiến Express." };
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let wait = Math.min(maxWait, 1000 * 2 ** attempt);
    try {
      const res = await fetcher(kienSearchUrl(code), { signal: ctl.signal, headers: { accept: "application/json" } });
      if (res.status === 404) return { ok: false, kind: "not_found", message: `Kiến Express không tìm thấy mã ${code}.`, status: 404 };
      if (res.status === 429 || res.status >= 500) {
        last = { ok: false, kind: "http", message: `Kiến Express trả về HTTP ${res.status}.`, status: res.status };
        wait = Math.min(maxWait, retryAfterMs(res.headers) ?? wait);
      } else if (res.status >= 400) {
        return { ok: false, kind: "http", message: `Kiến Express trả về HTTP ${res.status}.`, status: res.status };
      } else {
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          return { ok: false, kind: "parse", message: "Kiến trả về dữ liệu không đọc được." };
        }
        return parseKienResponse(body, code);
      }
    } catch (e) {
      const aborted = ctl.signal.aborted || (e instanceof Error && e.name === "AbortError");
      last = aborted ? { ok: false, kind: "timeout", message: `Kiến Express không phản hồi sau ${Math.round(timeoutMs / 1000)} giây.` } : { ok: false, kind: "network", message: `Không gọi được Kiến Express: ${e instanceof Error ? e.message : String(e)}` };
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(wait);
  }
  return last;
}

/** Run status an API state corresponds to (only the three "in flight" states move the run; see planKienSync). */
export const runStatusForKien = (code: string): ShipmentStatus | null => CARRIER_STEPS.find((c) => c.api === code)?.run ?? null;

export interface KienSyncPlan {
  /** Store this as the run's carrier state (API code, label, event time). */
  carrierStatus: string;
  carrierLabel: string;
  carrierStatusAt: string | null;
  /** Move the run forward to this status (null = leave it) — never backwards, never "done". */
  advanceTo: ShipmentStatus | null;
  /** The API is behind the run (e.g. shop already marked "về kho ĐVVC VN", Kiến still says shipping) — shown, not applied. */
  behind: boolean;
  /** Kiến says delivered: displayed only; the goods enter ⑥ when the shop receives them (manual step). */
  delivered: boolean;
  unknownCodes: string[];
}

/**
 * What a successful fetch means for a run. Forward-only: warehouse_jp → "handed", shipping → "flying", warehouse_hn →
 * "arrived" when that is further than the run's current step. `waiting` changes nothing; `delivered` is display-only
 * (no stock movement, no run completion); unknown codes are flagged and never mapped.
 */
export function planKienSync(run: { status: ShipmentStatus }, data: KienTracking): KienSyncPlan {
  const latest = data.latest;
  const base: KienSyncPlan = { carrierStatus: latest?.code ?? "", carrierLabel: latest?.label ?? "", carrierStatusAt: latest?.at ?? null, advanceTo: null, behind: false, delivered: false, unknownCodes: data.unknownCodes };
  if (!latest || !latest.known) return base;
  const api = latest.code as KienStatusCode;
  if (api === "delivered") return { ...base, delivered: true, behind: false };
  const apiIdx = kienStepIndex(api);
  const runIdx = carrierStepIndex(run.status);
  if (run.status === "done") return base;
  if (apiIdx > runIdx && api !== "waiting") return { ...base, advanceTo: runStatusForKien(api) };
  if (apiIdx < runIdx) return { ...base, behind: true };
  return base;
}

/** Stale-result guard: a reply is applied only to the code the run still carries. */
export const kienResultIsStale = (fetchedFor: string, currentTracking: string | null | undefined): boolean => normalizeKienCode(fetchedFor) !== normalizeKienCode(currentTracking);

/**
 * Default scheduler settings (overridable per shop in settings `kien_sync_minutes`). 10 minutes: Kiến's states change
 * hours apart, the shop has a handful of runs in flight at once (≤ ~6 requests / hour each) and the public endpoint is
 * cheap, so 10 minutes keeps the screen within one coffee break of the truth without hammering the carrier.
 */
export const KIEN_SYNC_DEFAULT_MINUTES = 10;
export const KIEN_SYNC_CONCURRENCY = 2;
