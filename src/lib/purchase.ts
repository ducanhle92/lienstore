/**
 * Purchase / logistics status of ONE order line (Admin › Kho hàng › Quản lý mua hàng).
 * Answers "how many of this product are bought, on the way from Japan, at the shop, delivered".
 * Pure module shared by admin pages, inventory maths and the order stage sync.
 */
export type PurchaseStatus = "not_bought" | "bought" | "shipped_jp_vn" | "to_shop" | "at_shop" | "shipped_to_customer" | "delivered";

export const PURCHASE_STAGES: Array<{ key: PurchaseStatus; label: string; short: string; cls: string }> = [
  { key: "not_bought", label: "Chưa mua", short: "Chưa mua", cls: "bg-gray-200 text-gray-700" },
  { key: "bought", label: "Đã mua tại Nhật", short: "Đã mua", cls: "bg-amber-100 text-amber-800" },
  { key: "shipped_jp_vn", label: "Đang vận chuyển Nhật → Việt Nam", short: "NB → VN", cls: "bg-sky-100 text-sky-800" },
  { key: "to_shop", label: "Kho logistics → kho shop", short: "Về kho shop", cls: "bg-indigo-100 text-indigo-800" },
  { key: "at_shop", label: "Đã nhận tại kho shop", short: "Tại kho", cls: "bg-green-100 text-green-800" },
  { key: "shipped_to_customer", label: "Đã gửi cho khách", short: "Đang giao", cls: "bg-lime-100 text-lime-800" },
  { key: "delivered", label: "Khách đã nhận hàng", short: "Đã nhận", cls: "bg-emerald-100 text-emerald-800" },
];

export const PURCHASE_LABEL: Record<PurchaseStatus, string> = Object.fromEntries(PURCHASE_STAGES.map((s) => [s.key, s.label])) as Record<PurchaseStatus, string>;

export function isPurchaseStatus(v: unknown): v is PurchaseStatus {
  return typeof v === "string" && PURCHASE_STAGES.some((s) => s.key === v);
}

export function purchaseIndex(s: PurchaseStatus): number {
  return Math.max(0, PURCHASE_STAGES.findIndex((x) => x.key === s));
}

/** Units the shop has paid for but not yet handed to the customer: bought → at the shop. */
export const PIPELINE_STATUSES: PurchaseStatus[] = ["bought", "shipped_jp_vn", "to_shop", "at_shop"];

/** Order logistics stage → the minimum purchase status every line of that order must have reached. */
export const STAGE_TO_PURCHASE: Partial<Record<string, PurchaseStatus>> = {
  in_transit: "shipped_jp_vn",
  vn_warehouse: "at_shop",
  delivering: "shipped_to_customer",
  delivered: "delivered",
};
