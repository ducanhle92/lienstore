/**
 * Orchestrator: runs every carrier adapter in parallel for one request, normalises to ShippingQuote[], caches the whole
 * answer for ≤ 10 minutes under a hash of everything that influences the price (spec §10). A failing carrier only
 * marks its own card; the others still show.
 */
import { createHash } from "node:crypto";
import { ghnAdapter } from "./ghn-adapter";
import { SPX_RATE_CARD } from "./spx";
import { spxAdapter } from "./spx";
import { ALL_CARRIER_CODES, CARRIER_NAME, type CarrierCode, type CarrierQuoteAdapter, type ShippingQuote, type ShippingQuoteRequest, sortQuotes, unavailableQuote } from "./types";
import { viettelAdapter } from "./viettel";
import { VNPOST_RATE_CARD } from "./vnpost";
import { vnpostAdapter } from "./vnpost";

export const QUOTE_TTL_MS = 10 * 60 * 1000;
export const RATE_CARD_VERSIONS: Partial<Record<CarrierCode, string>> = { VNPOST: VNPOST_RATE_CARD.version, SPX: SPX_RATE_CARD.version };
export const ALL_ADAPTERS: CarrierQuoteAdapter[] = [ghnAdapter, viettelAdapter, vnpostAdapter, spxAdapter];

export interface QuoteBundle {
  quotes: ShippingQuote[];
  quotedAt: string;
  expiresAt: string;
  cacheKey: string;
  fromCache: boolean;
}

/** sha256 over the price-relevant inputs (carrier list, address codes, parcel, values, coupon, rate-card versions). */
export function quoteCacheKey(req: ShippingQuoteRequest, carriers: CarrierCode[]): string {
  const p = req.parcel;
  const payload = {
    carriers: [...carriers].sort(),
    originWarehouseId: req.originWarehouseId,
    origin: [req.origin.provinceCode, req.origin.wardCode, req.origin.carrierCodes ?? null],
    destination: [req.destination.provinceCode, req.destination.wardCode, req.destination.carrierCodes ?? null, req.destination.legacyProvinceCode ?? null],
    actualWeightG: p.actualWeightG,
    lengthCm: p.lengthCm,
    widthCm: p.widthCm,
    heightCm: p.heightCm,
    declaredValueVnd: p.declaredValueVnd,
    codAmountVnd: req.paymentMethod === "cod" ? p.codAmountVnd : 0,
    flags: p.flags ?? null,
    coupon: req.coupon ?? "",
    rateCardVersion: RATE_CARD_VERSIONS,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

const cache = new Map<string, { until: number; bundle: QuoteBundle }>();
const inflight = new Map<string, Promise<QuoteBundle>>();

export interface QuoteOptions {
  /** Carriers the admin switched off (hidden entirely). */
  disabled?: CarrierCode[];
  adapters?: CarrierQuoteAdapter[];
  /** Skip the cache (final re-quote before a waybill). */
  fresh?: boolean;
  ttlMs?: number;
}

export async function quoteAllCarriers(req: ShippingQuoteRequest, opts: QuoteOptions = {}): Promise<QuoteBundle> {
  const adapters = (opts.adapters ?? ALL_ADAPTERS).filter((a) => !opts.disabled?.includes(a.carrier));
  const key = quoteCacheKey(req, adapters.map((a) => a.carrier));
  const ttl = Math.min(QUOTE_TTL_MS, opts.ttlMs ?? QUOTE_TTL_MS);
  if (!opts.fresh) {
    const hit = cache.get(key);
    if (hit && hit.until > Date.now()) return { ...hit.bundle, fromCache: true };
    const running = inflight.get(key);
    if (running) return running;
  }
  const run = (async (): Promise<QuoteBundle> => {
    const settled = await Promise.allSettled(adapters.map((a) => a.quote(req)));
    const quotes: ShippingQuote[] = [];
    settled.forEach((r, i) => {
      const carrier = adapters[i].carrier;
      if (r.status === "fulfilled" && r.value.length) quotes.push(...r.value);
      else quotes.push(unavailableQuote(carrier, "error", `Tạm không lấy được cước ${CARRIER_NAME[carrier]}`));
    });
    // hide carriers the admin switched off even when they arrive through an aggregator
    for (let i = quotes.length - 1; i >= 0; i--) if (opts.disabled?.includes(quotes[i].carrier)) quotes.splice(i, 1);
    const quotedAt = new Date();
    const bundle: QuoteBundle = { quotes: sortQuotes(quotes), quotedAt: quotedAt.toISOString(), expiresAt: new Date(quotedAt.getTime() + ttl).toISOString(), cacheKey: key, fromCache: false };
    // an all-failed answer is not worth caching — the next click should retry the carriers
    if (quotes.some((q) => q.available)) cache.set(key, { until: quotedAt.getTime() + ttl, bundle });
    return bundle;
  })().finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

export function findQuote(quotes: ShippingQuote[], carrier: string, serviceCode: string): ShippingQuote | undefined {
  return quotes.find((q) => q.carrier === carrier && q.serviceCode === serviceCode) ?? quotes.find((q) => q.carrier === carrier && q.available);
}

export function isCarrierCode(v: unknown): v is CarrierCode {
  return typeof v === "string" && (ALL_CARRIER_CODES as string[]).includes(v);
}

/** Test helper. */
export function clearQuoteCache(): void {
  cache.clear();
}
