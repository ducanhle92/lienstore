import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { getDb, getSetting, setSetting } from "./sqlite";
import { buildQuoteConfig } from "./shipping";
import { parsePricing, suggestPrice } from "./pricing";

/**
 * JPY → VND exchange rate and the nightly cost/price job.
 *
 *  - DCOM (the remittance service Vietnamese in Japan use) publishes its rate only in its app / Facebook, so the owner
 *    types it in Admin › Kho hàng › Công thức giá ("Tỉ giá DCOM"); it stays the effective rate while `fx_mode` = dcom.
 *  - A market rate (open.er-api.com, free, no key) is fetched every night as the fallback / reference.
 *  - The effective rate is stored in `jpy_vnd_rate`, which shipping quotes and the price formula already read.
 *  - `runPricingJob` (04:00 Asia/Ho_Chi_Minh, see src/instrumentation.ts; also the admin button and /api/cron/pricing):
 *      refresh market rate → cost_price = round(cost_jpy × rate) for products with a ¥ cost → optionally the selling price.
 */
export interface FxState {
  mode: "dcom" | "market";
  dcomRate: number | null;
  dcomUpdatedAt: string | null;
  marketRate: number | null;
  marketUpdatedAt: string | null;
  marketSource: string;
  /** The rate everything uses right now. */
  effective: number;
  autoSell: boolean;
  lastRunAt: string | null;
  lastRunSummary: string;
}

const num = (v: string | null): number | null => {
  const n = v === null ? NaN : Number.parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function readFx(db: DatabaseSync = getDb()): FxState {
  const mode = getSetting(db, "fx_mode") === "market" ? "market" : "dcom";
  const dcomRate = num(getSetting(db, "fx_dcom_rate"));
  const marketRate = num(getSetting(db, "fx_market_rate"));
  const stored = num(getSetting(db, "jpy_vnd_rate")) ?? 175;
  const effective = mode === "dcom" && dcomRate ? dcomRate : (marketRate ?? dcomRate ?? stored);
  return {
    mode,
    dcomRate,
    dcomUpdatedAt: getSetting(db, "fx_dcom_updated_at"),
    marketRate,
    marketUpdatedAt: getSetting(db, "fx_market_updated_at"),
    marketSource: getSetting(db, "fx_market_source") ?? "",
    effective,
    autoSell: (getSetting(db, "pricing_auto_sell") ?? "1") === "1",
    lastRunAt: getSetting(db, "pricing_last_run_at"),
    lastRunSummary: getSetting(db, "pricing_last_run_summary") ?? "",
  };
}

/** Market JPY→VND from a free public API; null when offline. */
export async function fetchMarketRate(): Promise<{ rate: number; source: string } | null> {
  const sources: Array<{ url: string; pick: (j: unknown) => number | undefined; name: string }> = [
    { url: "https://open.er-api.com/v6/latest/JPY", pick: (j) => (j as { rates?: { VND?: number } }).rates?.VND, name: "open.er-api.com" },
    { url: "https://api.frankfurter.app/latest?from=JPY&to=VND", pick: (j) => (j as { rates?: { VND?: number } }).rates?.VND, name: "frankfurter.app" },
  ];
  for (const s of sources) {
    try {
      const r = await fetch(s.url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const v = s.pick(await r.json());
      if (typeof v === "number" && Number.isFinite(v) && v > 50 && v < 1000) return { rate: Math.round(v * 100) / 100, source: s.name };
    } catch {
      /* try the next source */
    }
  }
  return null;
}

/** Owner-typed DCOM rate (VND per 1 JPY). */
export function setDcomRate(rate: number, db: DatabaseSync = getDb()): void {
  setSetting(db, "fx_dcom_rate", String(Math.round(rate * 100) / 100));
  setSetting(db, "fx_dcom_updated_at", new Date().toISOString());
  applyEffectiveRate(db);
}

export function setFxMode(mode: "dcom" | "market", db: DatabaseSync = getDb()): void {
  setSetting(db, "fx_mode", mode);
  applyEffectiveRate(db);
}

export function setAutoSell(on: boolean, db: DatabaseSync = getDb()): void {
  setSetting(db, "pricing_auto_sell", on ? "1" : "0");
}

function applyEffectiveRate(db: DatabaseSync): number {
  const fx = readFx(db);
  setSetting(db, "jpy_vnd_rate", String(fx.effective));
  db.prepare("INSERT OR REPLACE INTO fx_rates (day, rate, source, created_at) VALUES (?, ?, ?, ?)").run(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }),
    fx.effective,
    fx.mode === "dcom" && fx.dcomRate ? "dcom" : fx.marketSource || "market",
    new Date().toISOString(),
  );
  return fx.effective;
}

export interface PricingRun {
  rate: number;
  rateSource: string;
  marketFetched: boolean;
  costsUpdated: number;
  pricesUpdated: number;
  skippedSale: number;
  at: string;
}

/** The nightly job (also run from the admin button). Safe to call any time; idempotent for a given rate. */
export async function runPricingJob(opts: { applySell?: boolean } = {}): Promise<PricingRun> {
  const db = getDb();
  const market = await fetchMarketRate();
  if (market) {
    setSetting(db, "fx_market_rate", String(market.rate));
    setSetting(db, "fx_market_source", market.source);
    setSetting(db, "fx_market_updated_at", new Date().toISOString());
  }
  const rate = applyEffectiveRate(db);
  const fx = readFx(db);
  const now = new Date().toISOString();
  // 1) ¥ cost → VND cost for every product that has a Japanese price
  const r = db.prepare("UPDATE products SET cost_price = CAST(ROUND(cost_jpy * ?) AS INTEGER), updated_at = ? WHERE cost_jpy IS NOT NULL AND cost_jpy > 0 AND (cost_price IS NULL OR cost_price <> CAST(ROUND(cost_jpy * ?) AS INTEGER))").run(rate, now, rate);
  const costsUpdated = Number(r.changes);
  // 2) selling price from the formula (products with a ¥ cost, not on sale)
  let pricesUpdated = 0;
  let skippedSale = 0;
  const applySell = opts.applySell ?? fx.autoSell;
  if (applySell) {
    const pricing = parsePricing(getSetting(db, "pricing_config"));
    const { loadShippingMethodsForQuote } = await import("./db");
    const quote = buildQuoteConfig(loadShippingMethodsForQuote(db), "per_order", rate);
    const rows = db
      .prepare("SELECT id, price, regular_price, cost_price, weight_g, dims_cm, dims_confidence FROM products WHERE cost_jpy IS NOT NULL AND cost_jpy > 0 AND cost_price IS NOT NULL")
      .all() as unknown as Array<{ id: number; price: number; regular_price: number | null; cost_price: number; weight_g: number | null; dims_cm: string | null; dims_confidence: string | null }>;
    const upd = db.prepare("UPDATE products SET price = ?, updated_at = ? WHERE id = ?");
    for (const p of rows) {
      if (p.regular_price !== null) {
        skippedSale++;
        continue;
      }
      const conf = p.dims_confidence === "high" || p.dims_confidence === "medium" || p.dims_confidence === "low" ? p.dims_confidence : null;
      const s = suggestPrice({ costPrice: p.cost_price, weightG: p.weight_g, dimsCm: p.dims_cm, dimsConfidence: conf }, quote, pricing);
      if (s && s.suggested !== p.price) {
        upd.run(s.suggested, now, p.id);
        pricesUpdated++;
      }
    }
  }
  const run: PricingRun = { rate, rateSource: fx.mode === "dcom" && fx.dcomRate ? "DCOM" : fx.marketSource || "market", marketFetched: !!market, costsUpdated, pricesUpdated, skippedSale, at: now };
  setSetting(db, "pricing_last_run_at", now);
  setSetting(
    db,
    "pricing_last_run_summary",
    `Tỉ giá ${rate} (${run.rateSource}${market ? `, thị trường ${market.rate}` : ", không lấy được tỉ giá thị trường"}) · giá vốn ${costsUpdated} sp · giá bán ${applySell ? `${pricesUpdated} sp${skippedSale ? `, bỏ qua ${skippedSale} đang giảm giá` : ""}` : "không tự động"}`,
  );
  return run;
}

/** Local day in the shop's time zone (YYYY-MM-DD). */
export const shopDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
export const shopHour = (d = new Date()) => Number.parseInt(d.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", hour12: false }), 10) % 24;
