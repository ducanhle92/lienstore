/** Tier labels / classes shared by server and client code (the DB side lives in lib/customers-db.ts). */
export type CustomerTier = "" | "silver" | "gold" | "diamond";
export const TIER_LABEL: Record<CustomerTier, string> = { "": "Chưa xếp hạng", silver: "Bạc", gold: "Vàng", diamond: "Kim cương" };
export const TIER_CLASS: Record<CustomerTier, string> = {
  "": "bg-gray-100 text-gray-600",
  silver: "bg-slate-200 text-slate-800",
  gold: "bg-amber-100 text-amber-800",
  diamond: "bg-sky-100 text-sky-800",
};
export const TIER_ICON: Record<CustomerTier, string> = { "": "", silver: "★", gold: "★★", diamond: "◆" };
export const isTier = (v: unknown): v is CustomerTier => v === "" || v === "silver" || v === "gold" || v === "diamond";
