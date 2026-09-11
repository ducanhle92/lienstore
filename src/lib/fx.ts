import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { getDb, getSetting, setSetting } from "./sqlite";
import { suggestPrice } from "./pricing";

/**
 * JPY → VND exchange rate and the nightly cost/price job.
 *
 *  - DCOM (the remittance service Vietnamese in Japan use) publishes its rate on https://sendmoney.co.jp/vi/fx-rate
 *    (row "Viet Nam Dong (VND) · VND 167.4000"). `fetchDcomRate` scrapes that row; the nightly job and the admin
 *    button refresh it, and it is the effective rate while `fx_mode` = dcom. The owner may still type a manual value
 *    (`fx_dcom_manual`) which wins over the scraped one until cleared — for the days the page is down or wrong.
 *  - A market rate (open.er-api.com, free, no key) is fetched every night as the fallback / reference.
 *  - The effective rate is stored in `jpy_vnd_rate`, which shipping quotes and the price formula already read.
 *  - `runPricingJob` (04:00 Asia/Ho_Chi_Minh, see src/instrumentation.ts; also the admin button and /api/cron/pricing):
 *      refresh market rate → cost_price = round(cost_jpy × rate) for products with a ¥ cost → optionally the selling price.
 */
export interface FxState {
  mode: "dcom" | "market";
  /** DCOM rate in force: the manual override when set, else the scraped one. */
  dcomRate: number | null;
  dcomUpdatedAt: string | null;
  /** Scraped from sendmoney.co.jp (null until the first successful fetch). */
  dcomAutoRate: number | null;
  dcomAutoUpdatedAt: string | null;
  /** "Cập nhật lúc" shown on the DCOM page for the scraped rate. */
  dcomAutoPageTime: string | null;
  /** Owner-typed override (null = follow the scraped rate). */
  dcomManualRate: number | null;
  dcomManualUpdatedAt: string | null;
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
  const dcomManualRate = num(getSetting(db, "fx_dcom_manual"));
  const dcomAutoRate = num(getSetting(db, "fx_dcom_auto"));
  const dcomRate = dcomManualRate ?? dcomAutoRate ?? num(getSetting(db, "fx_dcom_rate"));
  const marketRate = num(getSetting(db, "fx_market_rate"));
  const stored = num(getSetting(db, "jpy_vnd_rate")) ?? 175;
  const effective = mode === "dcom" && dcomRate ? dcomRate : (marketRate ?? dcomRate ?? stored);
  return {
    mode,
    dcomRate,
    dcomUpdatedAt: dcomManualRate ? getSetting(db, "fx_dcom_manual_at") : dcomAutoRate ? getSetting(db, "fx_dcom_auto_at") : getSetting(db, "fx_dcom_updated_at"),
    dcomAutoRate,
    dcomAutoUpdatedAt: getSetting(db, "fx_dcom_auto_at"),
    dcomAutoPageTime: getSetting(db, "fx_dcom_auto_page_time"),
    dcomManualRate,
    dcomManualUpdatedAt: getSetting(db, "fx_dcom_manual_at"),
    marketRate,
    marketUpdatedAt: getSetting(db, "fx_market_updated_at"),
    marketSource: getSetting(db, "fx_market_source") ?? "",
    effective,
    autoSell: (getSetting(db, "pricing_auto_sell") ?? "0") === "1",
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

export const DCOM_RATE_URL = "https://sendmoney.co.jp/vi/fx-rate";

/** Pull "VND 167.4000" out of the DCOM page HTML (exported for tests). */
export function parseDcomRate(html: string): { rate: number; pageTime: string | null } | null {
  const row = /Viet\s*Nam\s*Dong\s*\(VND\)[\s\S]{0,1500}?VND\s*([\d]+(?:[.,]\d+)?)/i.exec(html);
  if (!row) return null;
  const rate = Number.parseFloat(row[1].replace(",", "."));
  if (!Number.isFinite(rate) || rate < 50 || rate > 1000) return null;
  const time = /C[ậa]p\s*nh[ậa]t\s*l[úu]c:?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}[^<\n]{0,10})/i.exec(html);
  return { rate: Math.round(rate * 100) / 100, pageTime: time ? time[1].trim() : null };
}

/** DCOM JPY→VND rate scraped from sendmoney.co.jp; null when the page is unreachable or changed layout. */
export async function fetchDcomRate(): Promise<{ rate: number; pageTime: string | null } | null> {
  try {
    const r = await fetch(DCOM_RATE_URL, { cache: "no-store", signal: AbortSignal.timeout(10000), headers: { "User-Agent": "Mozilla/5.0 (compatible; LienStore pricing bot)", Accept: "text/html" } });
    if (!r.ok) return null;
    return parseDcomRate(await r.text());
  } catch {
    return null;
  }
}

/** Fetch + store the DCOM rate; returns the stored value (or null when the fetch failed — the old value stays). */
export async function refreshDcomRate(db: DatabaseSync = getDb()): Promise<{ rate: number; pageTime: string | null } | null> {
  const got = await fetchDcomRate();
  if (got) {
    setSetting(db, "fx_dcom_auto", String(got.rate));
    setSetting(db, "fx_dcom_auto_at", new Date().toISOString());
    setSetting(db, "fx_dcom_auto_page_time", got.pageTime ?? "");
    applyEffectiveRate(db);
  }
  return got;
}

/** Owner-typed DCOM override (VND per 1 JPY); null clears it so the scraped rate applies again. */
export function setDcomRate(rate: number | null, db: DatabaseSync = getDb()): void {
  if (rate === null) {
    setSetting(db, "fx_dcom_manual", "");
    setSetting(db, "fx_dcom_manual_at", "");
    // legacy single-value key from before the scraper existed — drop it so it cannot shadow the live rate
    setSetting(db, "fx_dcom_rate", "");
  } else {
    setSetting(db, "fx_dcom_manual", String(Math.round(rate * 100) / 100));
    setSetting(db, "fx_dcom_manual_at", new Date().toISOString());
  }
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
  dcomFetched: boolean;
  dcomRate: number | null;
  costsUpdated: number;
  pricesUpdated: number;
  skippedSale: number;
  at: string;
}

/** The nightly job (also run from the admin button). Safe to call any time; idempotent for a given rate. */
export async function runPricingJob(opts: { applySell?: boolean } = {}): Promise<PricingRun> {
  const db = getDb();
  const [dcom, market] = await Promise.all([refreshDcomRate(db), fetchMarketRate()]);
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
    const { getAllProducts, getImportQuoteConfig, getPricingConfig } = await import("./db");
    const [pricing, quote, all] = await Promise.all([getPricingConfig(), getImportQuoteConfig(), getAllProducts(true)]);
    const rows = all.filter((p) => p.costJpy && p.costJpy > 0 && p.costPrice !== null);
    const upd = db.prepare("UPDATE products SET price = ?, updated_at = ? WHERE id = ?");
    for (const p of rows) {
      if (p.regularPrice !== null) {
        skippedSale++;
        continue;
      }
      const s = suggestPrice({ costPrice: p.costPrice, weightG: p.weightG, dimsCm: p.dimsCm, dimsConfidence: p.dimsConfidence, marginPct: p.marginPct, categories: p.categories }, quote, pricing);
      if (s && s.suggested !== p.price) {
        upd.run(s.suggested, now, p.id);
        pricesUpdated++;
      }
    }
  }
  const run: PricingRun = { rate, rateSource: fx.mode === "dcom" && fx.dcomRate ? (fx.dcomManualRate ? "DCOM nhập tay" : "DCOM") : fx.marketSource || "market", marketFetched: !!market, dcomFetched: !!dcom, dcomRate: dcom?.rate ?? null, costsUpdated, pricesUpdated, skippedSale, at: now };
  setSetting(db, "pricing_last_run_at", now);
  setSetting(
    db,
    "pricing_last_run_summary",
    `Tỉ giá ${rate} (${run.rateSource}${dcom ? `, DCOM ${dcom.rate}` : ", không lấy được DCOM"}${market ? `, thị trường ${market.rate}` : ", không lấy được tỉ giá thị trường"}) · giá vốn ${costsUpdated} sp · giá bán ${applySell ? `${pricesUpdated} sp${skippedSale ? `, bỏ qua ${skippedSale} đang giảm giá` : ""}` : "không tự động"}`,
  );
  return run;
}

/** Local day in the shop's time zone (YYYY-MM-DD). */
export const shopDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
export const shopHour = (d = new Date()) => Number.parseInt(d.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", hour12: false }), 10) % 24;
