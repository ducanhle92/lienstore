import { notFound } from "next/navigation";
import { ProductListing } from "@/components/sites/lienstore/shop/ProductListing";
import { queryProducts } from "@/lib/db";
import type { ProductOrderBy } from "@/types/shop";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";

export type SearchParams = Record<string, string | string[] | undefined>;

export const ORDER: readonly ProductOrderBy[] = ["popularity", "rating", "date", "price", "price-desc"];

export const PER_PAGE = 32;

/** Coerce a (possibly repeated) query param to its first value. */
export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Validate `?orderby=` against the allowed list; defaults to "popularity". */
export function parseOrderBy(v: string | string[] | undefined): ProductOrderBy {
  const s = first(v);
  return (ORDER as readonly string[]).includes(s ?? "") ? (s as ProductOrderBy) : "popularity";
}

/** Parse a `/page/[n]/` segment; NaN for anything that is not a plain positive integer. */
export function parsePageNumber(n: string): number {
  return /^\d+$/.test(n) ? Number(n) : NaN;
}

interface ShopListingProps {
  page: number;
  searchParams: SearchParams;
}

/** Shared body of /shop/ and /shop/page/[n]/ (search results included). */
export async function ShopListing({ page, searchParams }: ShopListingProps) {
  const lang = await getLang();
  const orderby = parseOrderBy(searchParams.orderby);
  const s = first(searchParams.s)?.trim() || undefined;
  const productCat = first(searchParams.product_cat) || undefined;
  const tag = first(searchParams.tag) || undefined;
  const onSale = first(searchParams.onsale) === "1";

  const result = await queryProducts({
    search: s,
    category: productCat,
    tag,
    onSale,
    orderby,
    page,
    perPage: PER_PAGE,
  });

  if (page > 1 && result.total > 0 && page > result.totalPages) notFound();

  const crumbs = s
    ? [{ label: "Shop", href: "/shop/" }, { label: `${t(lang, "searchResultsFor")} “${s}”` }]
    : onSale
      ? [{ label: "Shop", href: "/shop/" }, { label: t(lang, "saleListing") }]
      : [{ label: "Shop" }];

  return (
    <ProductListing
      crumbs={crumbs}
      title={s ? `${t(lang, "searchResultsFor")}: “${s}”` : onSale ? t(lang, "saleListing") : undefined}
      result={result}
      orderby={orderby}
      basePath="/shop/"
      params={{ s, product_cat: productCat, tag, onsale: onSale ? "1" : undefined }}
    />
  );
}
