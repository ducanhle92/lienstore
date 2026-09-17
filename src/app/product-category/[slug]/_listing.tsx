import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductListing } from "@/components/sites/lienstore/shop/ProductListing";
import { getCategoryBySlug, queryProducts } from "@/lib/db";
import { PER_PAGE, parseOrderBy, type SearchParams } from "@/app/shop/_listing";

interface CategoryListingProps {
  slug: string;
  page: number;
  searchParams: SearchParams;
}

/** Shared `generateMetadata` for /product-category/[slug]/ and its paginated route. */
export async function categoryMetadata(slug: string): Promise<Metadata> {
  const category = await getCategoryBySlug(slug);
  return { title: category ? category.name : "Danh mục" };
}

/** Shared body of /product-category/[slug]/ and /product-category/[slug]/page/[n]/. */
export async function CategoryListing({ slug, page, searchParams }: CategoryListingProps) {
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const orderby = parseOrderBy(searchParams.orderby);
  const result = await queryProducts({ category: slug, orderby, page, perPage: PER_PAGE });

  if (page > 1 && result.total > 0 && page > result.totalPages) notFound();

  return (
    <ProductListing
      crumbs={[{ label: category.name }]}
      title={category.name}
      description={category.description.trim() || undefined}
      result={result}
      orderby={orderby}
      basePath={`/product-category/${slug}/`}
      activeCategory={slug}
    />
  );
}
