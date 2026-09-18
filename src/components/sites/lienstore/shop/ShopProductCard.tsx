import Image from "next/image";
import { T } from "@/components/sites/lienstore/shared/LangProvider";
import Link from "next/link";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { availabilityGroup, availabilityOf } from "@/lib/availability";
import { formatAmount } from "@/lib/format";
import { priceView } from "@/lib/price-display";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/types/shop";
import { FlashSaleCountdown } from "@/components/sites/lienstore/ui2/FlashSaleCountdown";
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
    marketPrice: p.marketPrice,
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

/** % badge: promo below the expected price, else the web price below the market price (see lib/price-display.ts). */
export function discountPercent(p: Pick<CatalogProduct, "price" | "regularPrice"> & { marketPrice?: number | null }): number | null {
  return priceView(p).pct;
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
export function ShopProductCard({ product, className, flashEndsAt, hot: hotProp = false }: { product: CatalogProduct; className?: string; flashEndsAt?: string; /** Force the "Hot" badge (best-seller shelves). */ hot?: boolean }) {
  const avail = availabilityOf(product);
  const out = avail === "discontinued";
  const group = availabilityGroup(avail);
  const pv = priceView(product);
  const pct = pv.pct;
  const fresh = isNewProduct(product);
  const hot = hotProp || product.hot;
  const primary = product.thumb || product.images[0];
  const fam = product.variantSummary && product.variantSummary.count > 1 ? product.variantSummary : null;
  // a family is "Liên hệ" only when none of its variants has a price; otherwise it shows the lowest priced one
  const noPrice = fam ? fam.minPrice <= 0 : product.price <= 0;
  const range = fam && fam.minPrice !== fam.maxPrice;
  // a collapsed family is titled after the family, not after whichever variant happens to be the representative
  const title = fam?.groupName || product.name;
  const siblingThumb = fam?.variants.find((v) => v.id !== product.id && v.thumb)?.thumb ?? null;
  const second = siblingThumb ?? product.images.find((src) => src && src !== primary && src !== product.images[0]) ?? (product.images[0] && product.images[0] !== primary ? product.images[0] : null);
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
        <div className="pointer-events-none absolute top-1.5 right-1.5 flex flex-col items-end gap-1 sm:top-2 sm:right-2">
          {flashEndsAt ? <FlashSaleCountdown endsAt={flashEndsAt} compact /> : null}
          {pct ? <span className="rounded bg-lien-sale px-1 py-0.5 text-[10px] font-bold leading-4 text-white sm:px-1.5 sm:text-[11px]">-{pct}%</span> : null}
          {hot && !out ? <span className="rounded bg-lien-sale px-1 py-0.5 text-[10px] font-bold leading-4 text-white sm:px-1.5 sm:text-[11px]" data-testid="badge-hot"><T k="bestseller" /></span> : null}
          {fresh && !out && !hot ? <span className="rounded bg-lien-info px-1 py-0.5 text-[10px] font-semibold leading-4 text-white sm:px-1.5 sm:text-[11px]"><T k="isNew" /></span> : null}
          {fam ? (
            <span className="rounded bg-white/95 px-1 py-0.5 text-[10px] font-semibold leading-4 text-lien-blue ring-1 ring-lien-blue sm:px-1.5 sm:text-[11px]" data-testid="badge-variants">
              {fam.count} <T k="variantChoices" />
            </span>
          ) : null}
          {out ? (
            <span className="rounded bg-lien-muted px-1 py-0.5 text-[10px] font-semibold leading-4 text-white sm:px-1.5 sm:text-[11px]" data-testid="badge-discontinued"><T k="outOfStock" /></span>
          ) : group === "available" ? (
            <span className="rounded bg-lien-success px-1 py-0.5 text-[10px] font-semibold leading-4 text-white sm:px-1.5 sm:text-[11px]" data-testid="badge-available"><T k="availableNow" /></span>
          ) : null}
        </div>
        <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 opacity-0 sm:top-2 sm:left-2 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <WishlistButton product={toCartProduct(product)} className="flex h-7 w-7 items-center justify-center rounded-full border border-lien-line bg-white text-[13px] text-lien-heading shadow-sm hover:bg-lien-blue hover:text-white sm:h-8 sm:w-8 sm:text-[14px]" />
          <QuickViewButton product={toQuickView(product)} className="flex h-8 w-8 items-center justify-center rounded-full border border-lien-line bg-white text-[13px] text-lien-heading shadow-sm hover:bg-lien-blue hover:text-white [@media(hover:none)]:hidden" iconOnly />
        </div>
        <CardCartButton product={toCartProduct(product)} disabled={out} noPrice={noPrice} />
      </div>
      <div className="flex flex-1 flex-col px-2 pt-2 pb-2.5 text-center sm:px-3 sm:pb-3">
        <Link href={productHref(product)} className="no-underline">
          <h2 className="m-0 line-clamp-2 min-h-[36px] text-[12px] font-medium leading-[18px] text-lien-heading hover:text-lien-blue sm:min-h-[42px] sm:text-[14px] sm:leading-[21px]">{title}</h2>
        </Link>
        {fam ? (
          <ul className="mx-auto mt-1.5 mb-0 flex list-none justify-center gap-1 p-0" aria-label={`${fam.count} lựa chọn`} data-testid="variant-strip">
            {fam.variants.slice(0, 5).map((v) => (
              <li key={v.id}>
                <Link href={`/product/${v.slug}/`} title={v.name} className={cn("block h-7 w-7 overflow-hidden rounded border bg-white sm:h-8 sm:w-8", v.id === product.id ? "border-lien-blue ring-1 ring-lien-blue" : "border-lien-line hover:border-lien-blue")}>
                  {v.thumb ? <Image src={v.thumb} alt={v.name} width={32} height={32} className="h-full w-full object-contain" /> : null}
                </Link>
              </li>
            ))}
            {fam.variants.length > 5 ? <li className="flex h-7 w-7 items-center justify-center rounded border border-lien-line text-[10px] text-lien-muted sm:h-8 sm:w-8">+{fam.variants.length - 5}</li> : null}
          </ul>
        ) : null}
        {product.rating ? (
          <span className="mt-1 block">
            <StarRating rating={product.rating} className="text-[11px] sm:text-[13.7px]" size={0} />
          </span>
        ) : null}
        <p className="mt-1.5 mb-0 flex flex-wrap items-baseline justify-center gap-x-1.5 text-[13px] font-semibold leading-5 sm:gap-x-2 sm:text-[15px]">
          {noPrice ? (
            <span className="text-lien-contact"><T k="contactForPrice" /></span>
          ) : range ? (
            <span className="text-lien-price">
              <span className="text-[11px] font-normal text-lien-muted sm:text-[12px]"><T k="priceFrom" /> </span>
              {formatAmount(fam.minPrice)}đ
            </span>
          ) : fam ? (
            <span className="text-lien-price">{formatAmount(fam.minPrice)}đ</span>
          ) : pv.strike ? (
            <>
              <del className="text-[11px] font-normal text-lien-muted sm:text-[12px]" title={pv.kind === "market" ? "Giá thị trường" : "Giá trước khuyến mại"}>{formatAmount(pv.strike)}đ</del>
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

/** Responsive product grid: 3 columns on phones and tablets, `cols` on desktop (default 4). */
export function ShopProductGrid({ products, className, cols = 4 }: { products: CatalogProduct[]; className?: string; cols?: 4 | 5 | 6 }) {
  const desktop = cols === 6 ? "lg:grid-cols-6" : cols === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";
  return (
    <ul className={cn("m-0 grid list-none grid-cols-3 gap-2 p-0 sm:gap-3 md:gap-4", desktop, className)}>
      {products.map((p) => (
        <ShopProductCard key={p.id} product={p} />
      ))}
    </ul>
  );
}
