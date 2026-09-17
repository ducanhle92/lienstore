import type { Metadata } from "next";
import { ProductListing } from "@/components/sites/lienstore/shop/ProductListing";
import { SiteChrome } from "@/components/sites/lienstore/shop/SiteChrome";
import { queryProducts } from "@/lib/db";
import { PER_PAGE, parseOrderBy, type SearchParams } from "@/app/shop/_listing";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}

function tagTitle(slug: string): string {
  return `Từ khóa: ${decodeURIComponent(slug).replace(/-/g, " ")}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return { title: tagTitle(slug) };
}

// Clone of https://linconnn.io.vn/product-tag/<slug>/
export default async function Page({ params, searchParams }: PageProps) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const orderby = parseOrderBy(sp.orderby);
  const title = tagTitle(slug);
  const result = await queryProducts({ tag: slug, orderby, page: 1, perPage: PER_PAGE });

  return (
    <SiteChrome>
        <ProductListing
          crumbs={[{ label: "Shop", href: "/shop/" }, { label: title }]}
          title={title}
          result={result}
          orderby={orderby}
          basePath={`/product-tag/${slug}/`}
        />
    </SiteChrome>
  );
}
