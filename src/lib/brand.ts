/**
 * The shop used to be called "LienStore"; the owner renamed it (Admin › Giao diện & Logo › shopName, currently
 * "Store Lienanh") and may rename again. Nothing customer-facing should carry the old name: code uses the theme's
 * shopName, stored texts are rewritten once by `brand-rename-job`, and this helper does the case-aware replacement.
 * Lower-case "lienstore" (slugs, asset paths, code names) is deliberately left alone.
 */
export const LEGACY_BRAND_RE = /LienStore|Lien Store|LIENSTORE|LIEN STORE/;

export const hasLegacyBrand = (text: string | null | undefined): boolean => !!text && LEGACY_BRAND_RE.test(text);

/** Replace the old brand with `shopName`, keeping ALL-CAPS where the source was ALL-CAPS (page titles). */
export function brandify(text: string, shopName: string): string {
  return text.replace(/LIENSTORE|LIEN STORE/g, shopName.toUpperCase()).replace(/LienStore|Lien Store/g, shopName);
}
