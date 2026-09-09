import Image from "next/image";
import { T } from "@/components/sites/lienstore/shared/LangProvider";
import Link from "next/link";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/types/shop";
import { CardCartButton } from "./CardCartButton";
import { QuickViewButton, type QuickViewProduct } from "./QuickView";
import { StarRating } from "./StarRating";
import { WishlistButton } from "./WishlistButton";

export function productHref(p: Pick<CatalogProduct, "slug">): string {
  return `/product/${p.slug}/`;
}

export function toCartProduct(p: CatalogProduct) {
  return { id: p.id, slug: p.slug, name: p.name, price: p.price, image: p.thumb || p.images[0] || "" };
}

function excerptOf(p: CatalogProduct): string {
  const text = (p.shortDescription || p.description)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 220 ? `${text.slice(0, 220).trimEnd()}…` : text;
}

function toQuickView(p: CatalogProduct): QuickViewProduct {
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
    excerpt: excerptOf(p),
    categories: p.categories,
  };
}

const NEW_DAYS = 45;

export function discountPercent(p: Pick<CatalogProduct, "price" | "regularPrice">): number | null {
  if (!p.regularPrice || p.regularPrice <= p.price || p.price <= 0) return null;
  return Math.round((1 - p.price / p.regularPrice) * 100);
}

export function isNewProduct(p: Pick<CatalogProduct, "createdAt">): boolean {
  const t = Date.parse(p.createdAt);
  return Number.isFinite(t) && Date.now() - t < NEW_DAYS * 86400000;
}

/**
 * Product card (sesofoods style): bordered white tile, square image that swaps to the 2nd gallery photo on hover,
 * discount / "Mới" / "Hết hàng" labels, hover actions (wishlist, quick view) and a floating round
 * "Thêm Vào Giỏ" button over the image; 2-line title and price below. Renders an `<li>`.
 */
export function ShopProductCard({ product, className }: { product: CatalogProduct; className?: string }) {
  const out = product.stockStatus === "outofstock";
  const pct = discountPercent(product);
  const fresh = isNewProduct(product);
  const primary = product.thumb || product.images[0];
  const second = product.images.find((src) => src && src !== primary && src !== product.images[0]) ?? (product.images[0] && product.images[0] !== primary ? product.images[0] : null);
  return (
    <li className={cn("group relative flex flex-col rounded-md border border-lien-line bg-white transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)]", className)}>
      <div className="relative overflow-hidden rounded-t-md">
        <Link href={productHref(product)} className="relative block aspect-square" aria-label={product.name}>
          <Image
            src={primary}
            alt={product.name}
            width={300}
            height={300}
            className={cn("absolute inset-0 h-full w-full object-contain transition-all duration-300", second ? "group-hover:opacity-0" : "group-hover:scale-[1.04]")}
          />
          {second ? (
            <Image
              src={second}
              alt=""
              width={300}
              height={300}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-contain opacity-0 transition-all duration-300 group-hover:scale-[1.03] group-hover:opacity-100"
            />
          ) : null}
        </Link>
        <div className="pointer-events-none absolute top-2 right-2 flex flex-col items-end gap-1">
          {pct ? <span className="rounded bg-lien-sale px-1.5 py-0.5 text-[11px] font-bold leading-4 text-white">-{pct}%</span> : null}
          {fresh && !out ? <span className="rounded bg-lien-info px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-white"><T k="isNew" /></span> : null}
          {out ? <span className="rounded bg-lien-muted px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-white"><T k="outOfStock" /></span> : null}
        </div>
        <div className="absolute top-2 left-2 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <WishlistButton product={toCartProduct(product)} className="flex h-8 w-8 items-center justify-center rounded-full border border-lien-line bg-white text-[14px] text-lien-heading shadow-sm hover:bg-lien-blue hover:text-white" />
          <QuickViewButton product={toQuickView(product)} className="flex h-8 w-8 items-center justify-center rounded-full border border-lien-line bg-white text-[13px] text-lien-heading shadow-sm hover:bg-lien-blue hover:text-white" iconOnly />
        </div>
        <CardCartButton product={toCartProduct(product)} disabled={out} />
      </div>
      <div className="flex flex-1 flex-col px-3 pt-2 pb-3 text-center">
        <Link href={productHref(product)} className="no-underline">
          <h2 className="m-0 line-clamp-2 min-h-[42px] text-[14px] font-medium leading-[21px] text-lien-heading hover:text-lien-blue">{product.name}</h2>
        </Link>
        {product.rating ? (
          <span className="mt-1 block">
            <StarRating rating={product.rating} />
          </span>
        ) : null}
        <p className="mt-1.5 mb-0 flex flex-wrap items-baseline justify-center gap-x-2 text-[15px] font-semibold leading-5">
          {product.regularPrice && product.regularPrice > product.price ? (
            <>
              <del className="text-[12px] font-normal text-lien-muted">{formatAmount(product.regularPrice)}đ</del>
              <span className="text-lien-sale-text">{formatAmount(product.price)}đ</span>
            </>
          ) : (
            <span className="text-lien-price">{formatAmount(product.price)}đ</span>
          )}
        </p>
      </div>
      <span className="sr-only">
        <Fa name="shopping-cart" />
      </span>
    </li>
  );
}

/** Responsive product grid: 2 columns on phones, 3 on tablets, `cols` on desktop (default 4). */
export function ShopProductGrid({ products, className, cols = 4 }: { products: CatalogProduct[]; className?: string; cols?: 4 | 5 | 6 }) {
  const desktop = cols === 6 ? "lg:grid-cols-6" : cols === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";
  return (
    <ul className={cn("m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 md:gap-4", desktop, className)}>
      {products.map((p) => (
        <ShopProductCard key={p.id} product={p} />
      ))}
    </ul>
  );
}
