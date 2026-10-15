import Image from "@/components/sites/lienstore/shared/SmartImage";
import Link from "next/link";
import { AddToCartButton } from "@/components/sites/lienstore/shop/AddToCartButton";
import { parseAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/lienstore";

/**
 * WooCommerce "product grid" block (`wc-block-grid has-3-columns`) as rendered on the
 * linconnn.io.vn home page. Three columns from 480px, one column below.
 * Hover on the image/title link turns the title blue and draws a 3px blue ring around the image.
 */
interface ProductGridProps {
  products: Product[];
  addToCartLabel: string;
  className?: string;
}

interface ProductCardProps {
  product: Product;
  addToCartLabel: string;
}

function productIdFromHref(href: string): number {
  const m = href.match(/add-to-cart=(\d+)/);
  return m ? Number.parseInt(m[1], 10) : 0;
}

export function ProductCard({ product, addToCartLabel }: ProductCardProps) {
  const cartProduct = {
    id: productIdFromHref(product.addToCartHref),
    slug: product.href.replace(/^\/product\//, "").replace(/\/$/, ""),
    name: product.title,
    price: parseAmount(product.price),
    image: product.image,
  };
  return (
    <li
      className={cn(
        "relative grow shrink-0 basis-full max-w-full text-center",
        "min-[480px]:basis-1/3 min-[480px]:max-w-1/3",
        "border-x-[8px] border-b-[16px] border-solid border-transparent",
      )}
    >
      <Link href={product.href} className="group block text-lien-muted no-underline">
        <div className="relative mb-[12px] block">
          <Image
            src={product.image}
            alt={product.title}
            width={300}
            height={300}
            className="block h-auto w-full shadow-[0_0_0_3px_rgba(255,255,255,0.1)] group-hover:shadow-[0_0_0_3px_#3ba0f4]"
          />
        </div>
        <div className="mb-[12px] block font-sans text-[16px] font-bold leading-[19.2px] text-lien-muted group-hover:text-lien-blue">
          {product.title}
        </div>
      </Link>
      <div className="mb-[12px] block text-[16px] font-normal leading-[18.4px] text-lien-text sm:leading-[24px]">
        <span>
          {product.price}
          <span>{product.currency}</span>
        </span>
      </div>
      <div className="mb-[12px] block text-center">
        <AddToCartButton product={cartProduct} variant="pill" label={addToCartLabel} />
      </div>
    </li>
  );
}

export function ProductGrid({ products, addToCartLabel, className }: ProductGridProps) {
  return (
    <div className={cn("w-full text-center", className)}>
      <ul className="mx-[-8px] mt-0 mb-[16px] flex list-none flex-wrap p-0">
        {products.map((product) => (
          <ProductCard key={`${product.href}-${product.addToCartHref}`} product={product} addToCartLabel={addToCartLabel} />
        ))}
      </ul>
    </div>
  );
}
