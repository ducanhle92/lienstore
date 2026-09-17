import Link from "next/link";
import { T } from "@/components/sites/lienstore/shared/LangProvider";
import { slugify } from "@/lib/format";
import { displayTags } from "@/lib/tags";
import type { CatalogProduct } from "@/types/shop";

interface ProductMetaProps {
  product: CatalogProduct;
  /** Category slug → display name. */
  categoryNames: Record<string, string>;
}

const LINK = "text-lien-muted no-underline hover:text-lien-blue";

/** `div.product_meta`: "Từ khóa:" tag links (16px/24px, grey links) — Vietnamese search words only, no SKU (internal). */
export function ProductMeta({ product }: ProductMetaProps) {
  const tags = displayTags(product.tags, product.name);
  if (tags.length === 0) return null;
  return (
    <div className="product_meta pt-[15px] text-[16px] leading-6 text-lien-text">
      {tags.length > 0 ? (
        <span className="tagged_as">
          <T k="tagsLabel" />{" "}
          {tags.map((tag, i) => (
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
