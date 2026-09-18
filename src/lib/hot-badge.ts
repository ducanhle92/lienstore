import type { DatabaseSync } from "node:sqlite";
import { getDb, getSetting } from "./sqlite";

/** Default "BEST SELLER" ribbon drawn over the product-page gallery of Hot products (owner can upload a replacement). */
export const DEFAULT_HOT_BADGE = "/sites/lienstore/labels/best-seller.gif";
export const HOT_BADGE_SETTING = "hot_badge_image";

export function hotBadgeUrl(db: DatabaseSync = getDb()): string {
  return getSetting(db, HOT_BADGE_SETTING)?.trim() || DEFAULT_HOT_BADGE;
}
