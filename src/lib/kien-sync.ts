import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { fetchKienTracking, KIEN_SYNC_CONCURRENCY, KIEN_SYNC_DEFAULT_MINUTES, kienResultIsStale, normalizeKienCode, planKienSync, type KienFetcher, type KienTracking } from "./carriers/kien-express";
import { setShipmentStatus } from "./shipments-db";
import { shipmentStage, type ShipmentStatus } from "./shipments";
import { getDb, getSetting, setSetting, withTransaction } from "./sqlite";

/**
 * Kiến Express tracking sync — the stored half. One run (shipment) carries one KEA code in `shipments.tracking`; the
 * sync fetches that code from the fixed Kiến host (lib/carriers/kien-express.ts), stores the history (idempotent on
 * shipment + code + status + time) and the latest state, and moves the run forward through "handed" → "flying" →
 * "arrived" when Kiến is ahead of the shop. It never moves a run backwards and never completes it: "delivered" is shown,
 * the goods enter ⑥ Tồn kho only when the shop receives them by hand.
 */

export interface KienSyncOutcome {
  ok: boolean;
  shipmentId: number;
  code: string;
  message: string;
  /** API state after the sync ("" when nothing stored). */
  carrierStatus: string;
  /** Run status the sync moved the run to (null = unchanged). */
  advancedTo: ShipmentStatus | null;
  /** The reply was for a code the run no longer carries — nothing stored. */
  stale?: boolean;
  skipped?: boolean;
}

interface RunRow {
  id: number;
  code: string;
  status: string;
  tracking: string;
  carrier_status: string | null;
  carrier_code: string | null;
}

const running = new Set<number>();
const readRun = (db: DatabaseSync, id: number): RunRow | undefined => db.prepare("SELECT id, code, status, tracking, carrier_status, carrier_code FROM shipments WHERE id = ?").get(id) as RunRow | undefined;

/** Fetch Kiến for one run and store the result (see module doc). Safe to call concurrently: a run in flight is skipped. */
export async function syncShipmentKien(shipmentId: number, opts: { fetcher?: KienFetcher; actor?: string; now?: () => Date } = {}): Promise<KienSyncOutcome> {
  const db = getDb();
  const run = readRun(db, shipmentId);
  if (!run) return { ok: false, shipmentId, code: "", message: "Không tìm thấy chuyến.", carrierStatus: "", advancedTo: null };
  const code = normalizeKienCode(run.tracking);
  if (!code) return { ok: false, shipmentId, code: "", message: "Chuyến chưa có mã quốc tế KEA… hợp lệ (VD KEA260930002).", carrierStatus: run.carrier_status ?? "", advancedTo: null, skipped: true };
  if (running.has(shipmentId)) return { ok: false, shipmentId, code, message: "Đang đồng bộ chuyến này — thử lại sau giây lát.", carrierStatus: run.carrier_status ?? "", advancedTo: null, skipped: true };
  running.add(shipmentId);
  const nowIso = () => (opts.now ? opts.now() : new Date()).toISOString();
  try {
    db.prepare("UPDATE shipments SET carrier_attempt_at = ? WHERE id = ?").run(nowIso(), shipmentId);
    const result = await fetchKienTracking(code, { fetcher: opts.fetcher });
    // stale guard: the code may have been edited while the request was out
    const after = readRun(db, shipmentId);
    if (!after) return { ok: false, shipmentId, code, message: "Chuyến đã bị xoá.", carrierStatus: "", advancedTo: null, stale: true };
    if (kienResultIsStale(code, after.tracking)) return { ok: false, shipmentId, code, message: `Mã KEA của chuyến đã đổi trong lúc đồng bộ — bỏ qua kết quả cho ${code}.`, carrierStatus: after.carrier_status ?? "", advancedTo: null, stale: true };
    if (!result.ok) {
      // keep whatever was stored before; only note the error
      db.prepare("UPDATE shipments SET carrier_error = ? WHERE id = ?").run(result.message.slice(0, 300), shipmentId);
      return { ok: false, shipmentId, code, message: result.message, carrierStatus: after.carrier_status ?? "", advancedTo: null };
    }
    const plan = planKienSync({ status: after.status as ShipmentStatus }, result.data);
    const now = nowIso();
    withTransaction(db, () => storeKienResult(db, shipmentId, result.data, plan.carrierStatus, plan.carrierLabel, plan.carrierStatusAt, now));
    let advancedTo: ShipmentStatus | null = null;
    if (plan.advanceTo) {
      const r = await setShipmentStatus(shipmentId, plan.advanceTo, opts.actor ?? "Kiến Express");
      if (r.ok) advancedTo = plan.advanceTo;
    }
    const n = result.data.events.length;
    const parts = [`Kiến: ${plan.carrierLabel || plan.carrierStatus || "chưa có trạng thái"}${n ? ` (${n} mốc)` : ""}`];
    if (advancedTo) parts.push(`chuyến chuyển sang “${shipmentStage(advancedTo).label}”`);
    if (plan.delivered) parts.push("Kiến báo đã giao — nhận hàng ở ⑥ Tồn kho khi hàng về tới shop");
    if (plan.behind) parts.push("Kiến đang ở bước trước bước shop đã chọn — giữ nguyên trạng thái chuyến");
    if (plan.unknownCodes.length) parts.push(`trạng thái lạ: ${plan.unknownCodes.join(", ")}`);
    return { ok: true, shipmentId, code, message: `${parts.join(" · ")}.`, carrierStatus: plan.carrierStatus, advancedTo };
  } finally {
    running.delete(shipmentId);
  }
}

function storeKienResult(db: DatabaseSync, shipmentId: number, data: KienTracking, status: string, label: string, statusAt: string | null, now: string): void {
  const ins = db.prepare("INSERT OR IGNORE INTO shipment_tracking_events (shipment_id, code, status_code, status_label, at, known, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const e of data.events) ins.run(shipmentId, data.code, e.code, e.label, e.at, e.known ? 1 : 0, now);
  db.prepare(
    `UPDATE shipments SET carrier_status = ?, carrier_label = ?, carrier_status_at = ?, carrier_checked_at = ?, carrier_synced_at = ?, carrier_error = '',
       carrier_code = ?, carrier_kien_id = ?, carrier_kien_order_id = ? WHERE id = ?`,
  ).run(status, label, statusAt, now, now, data.code, data.kienId, data.kienOrderId, shipmentId);
}

/** Minutes between background syncs (setting `kien_sync_minutes`; 0 = off; default 60). */
export function kienSyncMinutes(db: DatabaseSync = getDb()): number {
  const v = Number.parseInt(getSetting(db, "kien_sync_minutes") ?? "", 10);
  return Number.isInteger(v) && v >= 0 ? v : KIEN_SYNC_DEFAULT_MINUTES;
}

/** Runs the background job wants: a valid KEA code, not finished, and Kiến has not said delivered yet. */
export function listKienSyncCandidates(db: DatabaseSync = getDb(), limit = 50): Array<{ id: number; code: string }> {
  const rows = db.prepare("SELECT id, tracking FROM shipments WHERE status <> 'done' AND tracking <> '' AND COALESCE(carrier_status, '') <> 'delivered' ORDER BY id DESC LIMIT ?").all(limit) as Array<{ id: number; tracking: string }>;
  return rows.map((r) => ({ id: r.id, code: normalizeKienCode(r.tracking) })).filter((r) => r.code);
}

/**
 * Background job (instrumentation.ts, every minute): when `kien_sync_minutes` have passed since the last run, sync every
 * candidate with at most KIEN_SYNC_CONCURRENCY requests in flight. Returns null when it was not due.
 */
let jobRunning = false;
export async function runKienSyncJob(opts: { force?: boolean; fetcher?: KienFetcher; concurrency?: number } = {}): Promise<{ synced: number; failed: number; advanced: number; skipped: number } | null> {
  const db = getDb();
  const minutes = kienSyncMinutes(db);
  if (!opts.force && minutes === 0) return null;
  const last = getSetting(db, "kien_sync_last_run_at");
  if (!opts.force && last && Date.now() - Date.parse(last) < minutes * 60_000) return null;
  if (jobRunning) return null;
  jobRunning = true;
  try {
    setSetting(db, "kien_sync_last_run_at", new Date().toISOString());
    const queue = listKienSyncCandidates(db);
    const out = { synced: 0, failed: 0, advanced: 0, skipped: 0 };
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const r = await syncShipmentKien(item.id, { fetcher: opts.fetcher, actor: "Kiến Express (tự động)" });
        if (r.skipped || r.stale) out.skipped++;
        else if (r.ok) out.synced++;
        else out.failed++;
        if (r.advancedTo) out.advanced++;
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? KIEN_SYNC_CONCURRENCY) }, worker));
    return out;
  } finally {
    jobRunning = false;
  }
}
