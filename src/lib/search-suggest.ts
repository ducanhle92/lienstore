import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { getAllProducts } from "./db";
import { deriveBrands, isLoggableQuery, mergeTerms, normalizeQuery } from "./search-suggest-pure";
import { getDb, getSetting, setSetting } from "./sqlite";

export const SEARCH_KEYS = { pinned: "search_pinned_terms", brands: "search_brands", hidden: "search_hidden_terms" } as const;
const TRENDING_LIMIT = 14;
const BRAND_LIMIT = 18;
const DAYS = 30;

function list(db: DatabaseSync, key: string): string[] {
  try {
    const v = JSON.parse(getSetting(db, key) || "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [];
  } catch {
    return [];
  }
}
export function saveList(db: DatabaseSync, key: string, items: string[]): void {
  setSetting(db, key, JSON.stringify([...new Set(items.map((s) => s.trim()).filter(Boolean))].slice(0, 60)));
}

/** Record one shopper search (from /shop/?s=); the same term within a minute (refresh, pagination) counts once. */
export function logSearch(q: string): void {
  if (!isLoggableQuery(q)) return;
  const db = getDb();
  const norm = normalizeQuery(q);
  if (!norm) return;
  const recent = db.prepare("SELECT 1 FROM search_log WHERE q_norm = ? AND created_at > ? LIMIT 1").get(norm, new Date(Date.now() - 60_000).toISOString());
  if (recent) return;
  db.prepare("INSERT INTO search_log (q, q_norm, created_at) VALUES (?, ?, ?)").run(q.trim().slice(0, 60), norm, new Date().toISOString());
}

export interface TopTerm {
  term: string;
  count: number;
  hidden: boolean;
}
/** Most searched terms in the last 30 days (admin table + trending source). */
export function topSearchTerms(db: DatabaseSync = getDb(), limit = 40): TopTerm[] {
  const since = new Date(Date.now() - DAYS * 86400000).toISOString();
  const hidden = new Set(list(db, SEARCH_KEYS.hidden).map(normalizeQuery));
  const rows = db
    .prepare("SELECT q_norm, MIN(q) AS q, COUNT(*) AS n FROM search_log WHERE created_at > ? GROUP BY q_norm ORDER BY n DESC, MAX(created_at) DESC LIMIT ?")
    .all(since, limit) as unknown as Array<{ q_norm: string; q: string; n: number }>;
  return rows.map((r) => ({ term: r.q, count: Number(r.n), hidden: hidden.has(r.q_norm) }));
}

let cache: { at: number; value: { trending: string[]; brands: string[] } } | null = null;
export function invalidateSearchSuggest(): void {
  cache = null;
}

/** What the header search dropdown shows: pinned + trending terms, then brands (owner list or guessed from names). */
export async function getSearchSuggestions(): Promise<{ trending: string[]; brands: string[] }> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.value;
  const db = getDb();
  const products = await getAllProducts();
  const hidden = new Set(list(db, SEARCH_KEYS.hidden).map(normalizeQuery));
  const pinned = list(db, SEARCH_KEYS.pinned);
  const logged = topSearchTerms(db, TRENDING_LIMIT * 2)
    .filter((t) => !t.hidden)
    .map((t) => t.term);
  // fallback while the log is young: the most common product tags, best sellers first
  const tagCount = new Map<string, { n: number; display: string }>();
  for (const p of [...products].sort((a, b) => Number(b.hot) - Number(a.hot)))
    for (const tag of p.tags) {
      const k = normalizeQuery(tag);
      if (!k || k.length < 3) continue;
      const cur = tagCount.get(k);
      if (cur) cur.n++;
      else tagCount.set(k, { n: 1, display: tag.trim() });
    }
  const tags = [...tagCount.values()].sort((a, b) => b.n - a.n).map((t) => t.display);
  const trending = mergeTerms([pinned, logged, tags], TRENDING_LIMIT, hidden);
  const ownBrands = list(db, SEARCH_KEYS.brands);
  const brands = ownBrands.length ? ownBrands.slice(0, BRAND_LIMIT) : deriveBrands(products.map((p) => p.name), BRAND_LIMIT);
  cache = { at: Date.now(), value: { trending, brands } };
  return cache.value;
}

/** Admin preview of the guessed brands (so the owner can copy / edit them). */
export async function guessedBrands(): Promise<string[]> {
  return deriveBrands((await getAllProducts()).map((p) => p.name), BRAND_LIMIT);
}

export const searchLists = (db: DatabaseSync = getDb()) => ({ pinned: list(db, SEARCH_KEYS.pinned), brands: list(db, SEARCH_KEYS.brands), hidden: list(db, SEARCH_KEYS.hidden) });
