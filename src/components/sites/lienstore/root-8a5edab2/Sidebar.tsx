import Link from "next/link";
import type { SidebarCategory } from "@/types/lienstore";
import { cn } from "@/lib/utils";
import { PriceFilterWidget } from "./PriceFilterWidget";

export interface CategoryWidgetProps {
  title: string;
  categories: SidebarCategory[];
  className?: string;
}

export interface SidebarProps {
  title: string;
  categories: SidebarCategory[];
  /** Omit to render the category list only (checkout has no use for a price filter). */
  priceFilter?: {
    title: string;
    min: number;
    max: number;
    currency: string;
  };
  className?: string;
}

const widgetClass = "mb-4 rounded-md border border-lien-line bg-white p-4";

/** "Danh mục sản phẩm" product-category list widget. */
export function CategoryWidget({ title, categories, className }: CategoryWidgetProps) {
  return (
    <section className={cn("widget_product_categories", widgetClass, className)}>
      <h2 className="m-0 mb-3 border-b-2 border-lien-blue pb-2 text-[14px] font-bold uppercase tracking-[0.3px] text-lien-heading">
        {title}
      </h2>
      <ul className="product-categories m-0 list-none p-0">
        {categories.map((category) => (
          <li
            key={category.href}
            className="block py-1 text-[13px] leading-5"
          >
            <Link
              href={category.href}
              className="inline text-[13px] text-lien-text no-underline hover:text-lien-blue"
            >
              {category.name}
            </Link>{" "}
            <span className="count inline text-[12px] text-lien-muted">({category.count})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Left column of the home page: category list plus price filter. */
export function Sidebar({ title, categories, priceFilter, className }: SidebarProps) {
  return (
    <aside
      className={cn(
        "w-full pb-[28px] font-sans text-[14px] leading-[22.4px] text-lien-text",
        className,
      )}
    >
      <CategoryWidget title={title} categories={categories} className="mb-[14px]" />
      {priceFilter ? (
        <section className={cn("widget_block", widgetClass)}>
          <PriceFilterWidget title={priceFilter.title} min={priceFilter.min} max={priceFilter.max} currency={priceFilter.currency} />
        </section>
      ) : null}
    </aside>
  );
}
