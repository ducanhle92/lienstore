"use client";

import Image from "next/image";
import Link from "next/link";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { availabilityOf } from "@/lib/availability";
import { formatAmount } from "@/lib/format";
import { attrValues, variantLabel } from "@/lib/variants";
import { cn } from "@/lib/utils";
import type { CatalogProduct, ProductGroup } from "@/types/shop";

export type VariantOption = Pick<CatalogProduct, "id" | "slug" | "name" | "price" | "regularPrice" | "thumb" | "images" | "stock" | "stockStatus" | "fulfillment" | "variantAttrs" | "variantPosition">;

interface Props {
  group: Pick<ProductGroup, "name" | "attrLabels">;
  variants: VariantOption[];
  currentId: number;
}

/**
 * "Kệ hàng" picker: one row of chips per attribute (Vị / Khối lượng / …) — or, when the family has no attribute
 * labels, one chip per variant with its thumbnail. Each chip is a link to the sibling's own product page, so every
 * variant keeps its own photos, copy, price and SKU while the customer switches like picking a box off the shelf.
 */
export function VariantPicker({ group, variants, currentId }: Props) {
  const { t } = useLang();
  if (variants.length < 2) return null;
  const current = variants.find((v) => v.id === currentId) ?? variants[0];
  const labels = group.attrLabels.filter((l) => attrValues(variants, l).length > 0);
  const chip = (active: boolean, disabled: boolean) =>
    cn(
      "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px] leading-5 no-underline transition-colors",
      active ? "border-lien-blue bg-lien-blue-soft font-semibold text-lien-blue ring-1 ring-lien-blue" : "border-lien-line bg-white text-lien-heading hover:border-lien-blue hover:text-lien-blue",
      disabled && "opacity-50 line-through",
    );

  // With attribute labels: a row per attribute, parent → child. Level i only offers the values that exist under the
  // current choice of levels 0..i-1 (e.g. "Số viên" shows 420 / 840 only for the chosen "Loại"). The chip for value V
  // links to the variant matching the parent chain + V, keeping the current child values when such a sibling exists.
  if (labels.length) {
    return (
      <div className="mt-4 space-y-3" data-testid="variant-picker">
        {labels.map((label, li) => {
          const parents = labels.slice(0, li);
          const pool = variants.filter((v) => parents.every((l) => !current.variantAttrs[l] || v.variantAttrs[l] === current.variantAttrs[l]));
          const values = attrValues(pool.length ? pool : variants, label);
          if (values.length === 0) return null;
          return (
            <div key={label} className="flex flex-wrap items-center gap-2">
              <span className="min-w-[72px] text-[13px] text-lien-muted">{label}:</span>
              {values.map((value) => {
                const children = labels.slice(li + 1);
                const inPool = (pool.length ? pool : variants).filter((v) => v.variantAttrs[label] === value);
                const target = inPool.find((v) => children.every((l) => !current.variantAttrs[l] || v.variantAttrs[l] === current.variantAttrs[l])) ?? inPool[0] ?? variants.find((v) => v.variantAttrs[label] === value)!;
                const active = current.variantAttrs[label] === value;
                const disabled = availabilityOf(target) === "discontinued";
                return (
                  <Link key={value} href={`/product/${target.slug}/`} className={chip(active, disabled)} aria-current={active ? "page" : undefined} title={`${target.name} · ${formatAmount(target.price)}đ`} data-testid="variant-chip">
                    {value}
                  </Link>
                );
              })}
            </div>
          );
        })}
        <p className="m-0 text-[12px] text-lien-muted">{t("variantHint")}</p>
      </div>
    );
  }

  // Without labels: thumbnail chips named after the part of the name that differs from the family name.
  return (
    <div className="mt-4" data-testid="variant-picker">
      <p className="m-0 mb-2 text-[13px] text-lien-muted">
        {t("chooseVariant")} <span className="text-lien-heading">({variants.length})</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => {
          const active = v.id === current.id;
          const disabled = availabilityOf(v) === "discontinued";
          const img = v.thumb || v.images[0];
          return (
            <Link key={v.id} href={`/product/${v.slug}/`} className={cn(chip(active, disabled), "!pl-1.5")} aria-current={active ? "page" : undefined} title={v.name} data-testid="variant-chip">
              {img ? <Image src={img} alt="" width={36} height={36} className="h-9 w-9 rounded object-contain" /> : null}
              <span className="flex flex-col text-left leading-4">
                <span>{variantLabel(v, [], group.name, variants.map((x) => x.name))}</span>
                <span className={cn("text-[12px] font-normal", active ? "text-lien-blue" : "text-lien-muted")}>{formatAmount(v.price)}đ</span>
              </span>
            </Link>
          );
        })}
      </div>
      <p className="m-0 mt-2 text-[12px] text-lien-muted">{t("variantHint")}</p>
    </div>
  );
}
