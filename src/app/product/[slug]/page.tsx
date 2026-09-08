import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { ProductGallery } from "@/components/sites/lienstore/shop/product/ProductGallery";
import { ProductInfo2 } from "@/components/sites/lienstore/shop/product/ProductInfo2";
import { ProductMeta } from "@/components/sites/lienstore/shop/product/ProductMeta";
import { ProductPageNotice } from "@/components/sites/lienstore/shop/product/ProductPageNotice";
import { ProductShare } from "@/components/sites/lienstore/shop/product/ProductShare";
import { ProductTabs } from "@/components/sites/lienstore/shop/product/ProductTabs";
import { ShippingTable } from "@/components/sites/lienstore/shop/ShippingTable";
import { ShopProductGrid, toCartProduct } from "@/components/sites/lienstore/shop/ShopProductCard";
import { SiteChrome } from "@/components/sites/lienstore/shop/SiteChrome";
import { getCategories, getProductBySlug, getRelatedProducts, getShippingMethods, getShippingNotes } from "@/lib/db";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function metaDescription(shortDescription: string, description: string): string {
  const short = stripHtml(shortDescription);
  if (short) return short.slice(0, 160);
  const long = stripHtml(description);
  return long.slice(0, 160);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Không tìm thấy sản phẩm – LienStore" };
  return {
    title: `${product.name} – LienStore`,
    description: metaDescription(product.shortDescription, product.description),
    openGraph: {
      title: product.name,
      description: metaDescription(product.shortDescription, product.description),
      images: product.images.length ? [product.images[0]] : [product.thumb],
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [categories, related, shipping, shippingNotes] = await Promise.all([getCategories(), getRelatedProducts(product, 6), getShippingMethods(), getShippingNotes()]);
  const categoryNames = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const firstCategory = product.categories[0];

  return (
    <SiteChrome>
      <div className="border-b border-lien-line bg-lien-footer2">
        <nav aria-label="Breadcrumb" className="mx-auto max-w-[1300px] px-4 py-2.5 text-[12px] leading-5 text-lien-muted">
          <Link href="/" className="text-lien-muted no-underline hover:text-lien-blue">
            Trang chủ
          </Link>
          {firstCategory ? (
            <>
              <Fa name="angle-right" className="mx-1.5 text-[10px]" />
              <Link href={`/product-category/${firstCategory}/`} className="text-lien-muted no-underline hover:text-lien-blue">
                {categoryNames[firstCategory] ?? firstCategory}
              </Link>
            </>
          ) : null}
          <Fa name="angle-right" className="mx-1.5 text-[10px]" />
          <span className="text-lien-heading">{product.name}</span>
        </nav>
      </div>

      <main id="main" className="mx-auto max-w-[1300px] px-4 py-6">
        <ProductPageNotice product={toCartProduct(product)} />
        <div id={`product-${product.id}`} className="product type-product grid gap-8 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
          <ProductGallery images={product.images.length ? product.images : [product.thumb]} alt={product.name} className="!float-none !mb-0 !w-full" />
          <ProductInfo2 product={product} categoryNames={categoryNames}>
            <ProductMeta product={product} categoryNames={categoryNames} />
            <ProductShare name={product.name} slug={product.slug} />
          </ProductInfo2>
        </div>

        <div className="mt-10">
          <ProductTabs name={product.name} description={product.description} reviewCount={product.reviewCount} shipping={<ShippingTable methods={shipping} notes={shippingNotes} compact />} />
        </div>

        {related.length > 0 ? (
          <section className="related products mt-12" aria-labelledby="related-heading">
            <h2 id="related-heading" className="mb-6 text-center text-[22px] font-bold uppercase leading-8 text-lien-blue">
              <span className="border-b-[3px] border-lien-blue pb-1">Có thể bạn quan tâm</span>
            </h2>
            <ShopProductGrid products={related} cols={6} />
          </section>
        ) : null}
      </main>
    </SiteChrome>
  );
}
