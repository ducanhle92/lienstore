import Image from "@/components/sites/lienstore/shared/SmartImage";
import type { CategoryCard } from "@/types/lienstore";
import { cn } from "@/lib/utils";

/**
 * "DANH MỤC SẢN PHẨM" category grid from the linconnn.io.vn home page
 * (WooCommerce `ul.products.columns-4` of `li.product-category` cards).
 * Static link cards: the shadow is constant and the title keeps its own
 * colour on hover, so there is no visible hover change.
 * Desktop (≥992px): 4 columns, 28.5px column gap, 47.87px row gap.
 * Below 992px: 2 columns with a ≈3.8% column gap.
 */
export interface CategoryGridProps {
  title: string;
  categories: CategoryCard[];
  className?: string;
}

export interface CategoryCardItemProps {
  category: CategoryCard;
  className?: string;
}

const IMAGE_SIZE = 300;

export function CategoryCardItem({ category, className }: CategoryCardItemProps) {
  return (
    <li
      className={cn(
        "relative bg-white pb-[15px] text-center shadow-[0_2px_18px_-4px_#cfcfcf]",
        className,
      )}
    >
      <a
        href={category.href}
        className="block text-lien-muted no-underline transition-none hover:no-underline"
      >
        <Image
          src={category.image}
          alt={category.alt}
          width={IMAGE_SIZE}
          height={IMAGE_SIZE}
          className="mb-4 block h-auto w-full"
        />
        <h2 className="m-0 px-0 py-2 text-center font-oswald text-[16px] font-light leading-[22.4px] text-lien-heading [word-wrap:normal]">
          {category.name}{" "}
          <mark className="inline bg-transparent font-oswald text-[16px] font-light leading-[22.4px] text-lien-nav">
            ({category.count})
          </mark>
        </h2>
      </a>
    </li>
  );
}

export function CategoryGrid({ title, categories, className }: CategoryGridProps) {
  return (
    <section className={cn("w-full", className)}>
      <h2 className="my-[21.58px] text-center font-oswald text-[26px] font-light leading-[36.4px] text-lien-heading">
        {title}
      </h2>
      {/* pb reproduces the trailing margin-bottom of the last floated row in the original */}
      <ul className="mb-4 grid list-none grid-cols-2 items-start gap-x-[3.8%] gap-y-[47.87px] p-0 pb-[47.87px] md:grid-cols-4 md:gap-x-[28.5px]">
        {categories.map((category) => (
          <CategoryCardItem key={category.href} category={category} />
        ))}
      </ul>
    </section>
  );
}
