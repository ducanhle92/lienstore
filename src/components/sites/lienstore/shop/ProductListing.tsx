import Image from "next/image";
import Link from "next/link";
import { ancestorChain, buildCategoryTree, flattenTree, shortName, type CategoryNode } from "@/lib/categories";
import type { ShopCategory } from "@/types/shop";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { PageBand } from "@/components/sites/lienstore/ui2/HomeBlocks";
import { getCategories } from "@/lib/db";
import { t, tf, type Lang } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";
import { localizeCategories, localizeProducts } from "@/lib/localize";
import type { ProductOrderBy, ProductQueryResult } from "@/types/shop";
import type { Crumb } from "./Breadcrumb";
import { OrderBySelect } from "./OrderBySelect";
import { Pagination } from "./Pagination";
import { RecentlyViewedWidget } from "./RecentlyViewedWidget";
import { ShopProductGrid } from "./ShopProductCard";

interface ProductListingProps {
  crumbs: Crumb[];
  title?: string;
  description?: string;
  result: ProductQueryResult;
  orderby: ProductOrderBy;
  /** Path of page 1 of this listing, with trailing slash. */
  basePath: string;
  /** Query params to preserve in pagination / ordering links. */
  params?: Record<string, string | undefined>;
  emptyMessage?: string;
  /** Slug of the active category (highlighted in the sidebar). */
  activeCategory?: string;
}

export function resultCountText(r: ProductQueryResult, lang: Lang = "vi"): string {
  if (r.total === 0) return t(lang, "noResults");
  if (r.total === 1) return t(lang, "showingOne");
  if (r.total <= r.perPage) return `${t(lang, "showingAllPrefix")} ${r.total} ${t(lang, "showingAllSuffix")}`;
  const first = (r.page - 1) * r.perPage + 1;
  const last = Math.min(r.total, r.page * r.perPage);
  return tf(lang, "showingRange", { a: first, b: last, n: r.total });
}

/** Category archive / shop / search results: title band, left category sidebar, toolbar, product grid, pagination. */
export async function ProductListing({ crumbs, title, description, result, orderby, basePath, params = {}, emptyMessage, activeCategory }: ProductListingProps) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  if (orderby !== "popularity") q.set("orderby", orderby);
  const query = q.toString();
  const lang = await getLang();
  const categories = localizeCategories(await getCategories(), lang);
  result = { ...result, items: localizeProducts(result.items, lang) };
  const heading = title ?? crumbs[crumbs.length - 1]?.label ?? t(lang, "products");
  const tree = buildCategoryTree(categories);
  const active = activeCategory ? categories.find((c) => c.slug === activeCategory) : undefined;
  const chain = active ? ancestorChain(categories, active.slug) : [];
  const children = active ? flattenTree(tree).find((n) => n.category.slug === active.slug)?.children ?? [] : [];
  const listCrumbs = active ? [{ label: t(lang, "products"), href: "/shop/" }, ...chain.map((c, i) => (i === chain.length - 1 ? { label: c.name } : { label: c.name, href: `/product-category/${c.slug}/` }))] : crumbs;
  const renderNode = (n: CategoryNode<ShopCategory>) => (
    <li key={n.category.slug}>
      <Link
        href={`/product-category/${n.category.slug}/`}
        className={"flex items-center justify-between gap-2 py-1.5 text-[13px] no-underline hover:text-lien-blue " + (activeCategory === n.category.slug ? "font-semibold text-lien-blue" : n.depth === 0 ? "font-semibold text-lien-heading" : "text-lien-text")}
        style={{ paddingLeft: `${n.depth * 14}px` }}
      >
        <span className="min-w-0 truncate">
          <Fa name={n.depth === 0 ? "angle-right" : "plus"} className="mr-1.5 text-[9px] text-lien-blue" />
          {shortName(n.category.name)}
        </span>
        <span className="text-[12px] text-lien-muted">({n.total})</span>
      </Link>
      {n.children.length ? <ul className="m-0 list-none p-0">{n.children.map(renderNode)}</ul> : null}
    </li>
  );

  return (
    <>
      <PageBand title={heading} crumbs={listCrumbs} description={description} />
      <div className="mx-auto max-w-[1300px] px-4 py-6 lg:flex lg:gap-6">
        <aside className="hidden w-[260px] shrink-0 lg:block">
          <div className="rounded-md border border-lien-line bg-white p-4">
            <h2 className="m-0 mb-3 border-b-2 border-lien-blue pb-2 text-[14px] font-bold uppercase tracking-[0.3px] text-lien-heading">{t(lang, "productCategories")}</h2>
            <ul className="m-0 list-none p-0">
              <li>
                <Link href="/shop/" className={"flex items-center justify-between py-1.5 text-[13px] no-underline hover:text-lien-blue " + (!activeCategory && basePath === "/shop/" ? "font-semibold text-lien-blue" : "text-lien-text")}>
                  <span>
                    <Fa name="plus" className="mr-1.5 text-[9px] text-lien-blue" />
                    {t(lang, "allProducts")}
                  </span>
                </Link>
              </li>
              {tree.map(renderNode)}
            </ul>
          </div>
          <RecentlyViewedWidget className="mt-4 rounded-md border border-lien-line bg-white p-4" />
        </aside>

        <main id="main" className="min-w-0 flex-1">
          {children.length ? (
            <ul className="m-0 mb-5 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4" aria-label={t(lang, "subcategories")}>
              {children.map((n) => (
                <li key={n.category.slug}>
                  <Link href={`/product-category/${n.category.slug}/`} className="flex items-center gap-3 rounded-md border border-lien-line bg-white p-2 no-underline hover:border-lien-blue">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lien-footer2">
                      {n.image ? <Image src={n.image} alt="" width={48} height={48} className="h-10 w-10 object-contain" /> : <Fa name="tags" className="text-lien-blue" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-lien-heading">{shortName(n.category.name)}</span>
                      <span className="block text-[11px] text-lien-muted">{n.total} {t(lang, "itemsUnit")}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {result.total > 0 ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-lien-line bg-lien-footer2 px-4 py-2 text-[13px] text-lien-muted">
                <span>{resultCountText(result, lang)}</span>
                <OrderBySelect value={orderby} basePath={basePath} params={params} />
              </div>
              <ShopProductGrid products={result.items} cols={4} />
              <Pagination page={result.page} totalPages={result.totalPages} basePath={basePath} query={query} className="mt-6 mb-2" />
            </>
          ) : (
            <p className="rounded-md border border-lien-line bg-lien-footer2 px-5 py-4 text-[14px] text-lien-text">
              <Fa name="info-circle" className="mr-2 text-lien-blue" />
              {emptyMessage ?? resultCountText(result, lang)}
            </p>
          )}
        </main>
      </div>
    </>
  );
}
