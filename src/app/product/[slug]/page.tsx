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
import { ShipPolicyCard } from "@/components/sites/lienstore/shop/ShipPolicyCard";
import { ShippingQuoteTab } from "@/components/sites/lienstore/shop/ShippingQuotePanel";
import { ShopProductGrid, toCartProduct } from "@/components/sites/lienstore/shop/ShopProductCard";
import { SiteChrome } from "@/components/sites/lienstore/shop/SiteChrome";
import { getCategories, getProductBySlug, getProductGroupById, getProductReviews, getProductVariants, getRelatedProducts, getShipPolicy, getSiteTheme } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";
import { localizeCategories, localizeProduct, localizeProducts } from "@/lib/localize";

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
  const found = await getProductBySlug(slug);
  if (!found || found.status !== "publish") return { title: "Không tìm thấy sản phẩm" };
  const product = localizeProduct(found, await getLang());
  return {
    title: product.name,
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
  const raw = await getProductBySlug(slug);
  // drafts (hidden products) must not stay reachable by a direct link
  if (!raw || raw.status !== "publish") notFound();
  const lang = await getLang();
  const product = localizeProduct(raw, lang);

  const [cats, relatedRaw, reviews, me, shipPolicy, group, variantsRaw] = await Promise.all([getCategories(), getRelatedProducts(raw, 6), getProductReviews(raw.id), getCurrentCustomer(), getShipPolicy(), raw.groupId ? getProductGroupById(raw.groupId) : null, getProductVariants(raw)]);
  const variants = localizeProducts(variantsRaw, lang).map((v) => ({ id: v.id, slug: v.slug, name: v.name, price: v.price, regularPrice: v.regularPrice, thumb: v.thumb, images: v.images, stock: v.stock, stockStatus: v.stockStatus, fulfillment: v.fulfillment, variantAttrs: v.variantAttrs, variantPosition: v.variantPosition }));
  // the "Chi phí vận chuyển" tab quotes the Vietnam delivery per carrier for the address the visitor types — the Japan legs are already in the price
  const reviewer = me ? me.username || [me.firstName, me.lastName].filter(Boolean).join(" ") || me.email.split("@")[0] : null;
  const categories = localizeCategories(cats, lang);
  // siblings of the family are not "related" — the picker already shows them
  const related = localizeProducts(relatedRaw, lang).filter((p) => raw.groupId === null || p.groupId !== raw.groupId);
  const categoryNames = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const firstCategory = product.categories[0];

  return (
    <SiteChrome>
      <div className="border-b border-lien-line bg-lien-footer2">
        <nav aria-label="Breadcrumb" className="mx-auto max-w-[1300px] px-4 py-2.5 text-[12px] leading-5 text-lien-muted">
          <Link href="/" className="text-lien-muted no-underline hover:text-lien-blue">
            {t(lang, "home")}
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
          <ProductGallery images={product.images.length ? product.images : [product.thumb]} alt={product.name} className="!float-none !mb-0 !w-full" watermark={(await getSiteTheme()).logoLight} />
          <ProductInfo2 product={product} categoryNames={categoryNames} group={group ? { name: group.name, attrLabels: group.attrLabels } : null} variants={variants}>
            {/* SKU · tags · share: bottom-right of the buying column, out of the way */}
            <div className="mt-2 border-t border-lien-line pt-3 text-right text-[13px] leading-6 text-lien-muted [&_.product_meta]:!pt-0 [&_.product_meta]:!text-[13px] [&_.heateor_sss_sharing_container]:justify-end">
              <ProductMeta product={product} categoryNames={categoryNames} />
              <ProductShare name={product.name} slug={product.slug} />
            </div>
          </ProductInfo2>
        </div>

        <div className="mt-10">
          <ProductTabs
            name={product.name}
            productId={product.id}
            description={product.description}
            reviews={reviews}
            reviewer={reviewer}
            shipping={
              <div className="space-y-4">
                {shipPolicy.enabled ? <ShipPolicyCard policy={shipPolicy} /> : null}
                <ShippingQuoteTab items={[{ productId: product.id, quantity: 1 }]} compact />
              </div>
            }
          />
        </div>

        {related.length > 0 ? (
          <section className="related products mt-12" aria-labelledby="related-heading">
            <h2 id="related-heading" className="mb-6 text-center text-[22px] font-bold uppercase leading-8 text-lien-blue">
              <span className="border-b-[3px] border-lien-blue pb-1">{t(lang, "related")}</span>
            </h2>
            <ShopProductGrid products={related} cols={6} />
          </section>
        ) : null}
      </main>
    </SiteChrome>
  );
}
