import Link from "next/link";
import { T } from "@/components/sites/lienstore/shared/LangProvider";
import { slugify } from "@/lib/format";
import type { CatalogProduct } from "@/types/shop";

interface ProductMetaProps {
  product: CatalogProduct;
  /** Category slug → display name. */
  categoryNames: Record<string, string>;
}

const LINK = "text-lien-muted no-underline hover:text-lien-blue";

/** `div.product_meta`: SKU, "Danh mục:" category links and "Từ khóa:" tag links (16px/24px, grey links). */
export function ProductMeta({ product, categoryNames }: ProductMetaProps) {
  return (
    <div className="product_meta pt-[15px] text-[16px] leading-6 text-lien-text">
      {product.sku ? (
        <span className="sku_wrapper mr-1">
          <T k="sku" /> <span className="sku">{product.sku}</span>
        </span>
      ) : null}
      {product.categories.length > 0 ? (
        <span className="posted_in mr-1">
          <T k="categoryLabel" />{" "}
          {product.categories.map((slug, i) => (
            <span key={slug}>
              {i > 0 ? ", " : null}
              <Link href={`/product-category/${slug}/`} rel="tag" className={LINK}>
                {categoryNames[slug] ?? slug}
              </Link>
            </span>
          ))}
        </span>
      ) : null}
      {product.tags.length > 0 ? (
        <span className="tagged_as">
          <T k="tagsLabel" />{" "}
          {product.tags.map((tag, i) => (
            <span key={tag}>
              {i > 0 ? ", " : null}
              <Link href={`/product-tag/${slugify(tag)}/`} rel="tag" className={LINK}>
                {tag}
              </Link>
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}
