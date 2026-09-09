import type { Lang } from "@/lib/i18n";
import type { CatalogProduct, ShopCategory } from "@/types/shop";

/** Product copy in the visitor's language: Japanese fields when present, Vietnamese otherwise. */
export function localizeProduct<T extends Pick<CatalogProduct, "name" | "nameJa" | "shortDescription" | "shortDescriptionJa" | "description" | "descriptionJa">>(p: T, lang: Lang): T {
  if (lang !== "ja") return p;
  return {
    ...p,
    name: p.nameJa || p.name,
    shortDescription: p.shortDescriptionJa || p.shortDescription,
    description: p.descriptionJa || p.description,
  };
}

export function localizeProducts<T extends Pick<CatalogProduct, "name" | "nameJa" | "shortDescription" | "shortDescriptionJa" | "description" | "descriptionJa">>(ps: T[], lang: Lang): T[] {
  return lang === "ja" ? ps.map((p) => localizeProduct(p, lang)) : ps;
}

export function localizeCategories<T extends Pick<ShopCategory, "name" | "nameJa">>(cs: T[], lang: Lang): T[] {
  return lang === "ja" ? cs.map((c) => ({ ...c, name: c.nameJa || c.name })) : cs;
}
