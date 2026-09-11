import { NextResponse } from "next/server";
import { getProductById, queryProducts } from "@/lib/db";
import type { CatalogProduct } from "@/types/shop";

export const dynamic = "force-dynamic";

const MAX_INPUT = 6;
const LIMIT = 8;

function excerpt(p: CatalogProduct): string {
  const t = (p.shortDescription || p.description).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 200 ? `${t.slice(0, 200).trimEnd()}…` : t;
}

function slim(p: CatalogProduct) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    regularPrice: p.regularPrice,
    currency: p.currency,
    image: p.images[0] || p.thumb,
    thumb: p.thumb || p.images[0] || "",
    stock: p.stock,
    stockStatus: p.stockStatus,
    excerpt: excerpt(p),
    categories: p.categories,
  };
}

/**
 * GET /api/cart/suggest?ids=1,2,3 — "Thường được mua cùng với": published products sharing a category with the
 * cart items (best-rated first), excluding the items themselves; falls back to popular products for an empty cart.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, MAX_INPUT);
  const inCart = new Set(ids);
  const items = (await Promise.all(ids.map((id) => getProductById(id)))).filter((p): p is CatalogProduct => p !== null);

  const categoryCount = new Map<string, number>();
  for (const p of items) for (const c of p.categories) categoryCount.set(c, (categoryCount.get(c) ?? 0) + 1);
  const categories = [...categoryCount.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);

  const out: CatalogProduct[] = [];
  const seen = new Set<number>();
  const push = (p: CatalogProduct) => {
    if (seen.has(p.id) || inCart.has(p.id) || p.stockStatus === "discontinued") return;
    seen.add(p.id);
    out.push(p);
  };
  for (const c of categories.slice(0, 3)) {
    if (out.length >= LIMIT) break;
    const r = await queryProducts({ category: c, orderby: "rating", perPage: LIMIT });
    r.items.forEach(push);
  }
  if (out.length < LIMIT) {
    const r = await queryProducts({ orderby: "popularity", perPage: LIMIT * 2 });
    r.items.forEach(push);
  }
  return NextResponse.json({ items: out.slice(0, LIMIT).map(slim) }, { headers: { "Cache-Control": "no-store" } });
}
