/**
 * Purchase / logistics status of ONE order line (Admin › Kho hàng › Quản lý mua hàng).
 * Answers "how many of this product are bought, on the way from Japan, at the shop, delivered".
 * Pure module shared by admin pages, inventory maths and the order stage sync.
 *
 * Chain (owner's wording):
 *   Chưa mua → Đã mua → Đã gửi tới ĐVVC (Kiến, Nhật) → Đã vận chuyển NB–VN → Đã về tới kho ĐVVC (Hà Nội)
 *   → Đã vận chuyển kho logistics → kho shop → Đã nhận được hàng (kho shop) → Đã vận chuyển cho khách → Khách nhận được hàng
 */
export type PurchaseStatus = "not_bought" | "bought" | "to_carrier_jp" | "shipped_jp_vn" | "at_carrier_vn" | "to_shop" | "at_shop" | "shipped_to_customer" | "delivered";

export const PURCHASE_STAGES: Array<{ key: PurchaseStatus; label: string; short: string; cls: string; where: "jp" | "transit" | "vn_carrier" | "shop" | "customer" | "none" }> = [
  { key: "not_bought", label: "Chưa mua", short: "Chưa mua", cls: "bg-gray-200 text-gray-700", where: "none" },
  { key: "bought", label: "Đã mua (tại Nhật)", short: "Đã mua", cls: "bg-amber-100 text-amber-800", where: "jp" },
  { key: "to_carrier_jp", label: "Đã gửi tới ĐVVC (kho Kiến Nhật)", short: "Tới ĐVVC Nhật", cls: "bg-orange-100 text-orange-800", where: "jp" },
  { key: "shipped_jp_vn", label: "Đã vận chuyển NB → VN", short: "NB → VN", cls: "bg-sky-100 text-sky-800", where: "transit" },
  { key: "at_carrier_vn", label: "Đã về tới kho ĐVVC (Hà Nội)", short: "Kho ĐVVC VN", cls: "bg-cyan-100 text-cyan-800", where: "vn_carrier" },
  { key: "to_shop", label: "Đã vận chuyển kho logistics → kho shop", short: "Về kho shop", cls: "bg-indigo-100 text-indigo-800", where: "vn_carrier" },
  { key: "at_shop", label: "Đã nhận được hàng (kho shop)", short: "Tại kho", cls: "bg-green-100 text-green-800", where: "shop" },
  { key: "shipped_to_customer", label: "Đã vận chuyển cho khách", short: "Đang giao", cls: "bg-lime-100 text-lime-800", where: "customer" },
  { key: "delivered", label: "Khách nhận được hàng", short: "Đã nhận", cls: "bg-emerald-100 text-emerald-800", where: "customer" },
];

export const PURCHASE_LABEL: Record<PurchaseStatus, string> = Object.fromEntries(PURCHASE_STAGES.map((s) => [s.key, s.label])) as Record<PurchaseStatus, string>;

export function isPurchaseStatus(v: unknown): v is PurchaseStatus {
  return typeof v === "string" && PURCHASE_STAGES.some((s) => s.key === v);
}

export function purchaseIndex(s: PurchaseStatus): number {
  return Math.max(0, PURCHASE_STAGES.findIndex((x) => x.key === s));
}

/** Units the shop has paid for but not yet handed to the customer: bought → at the shop. */
export const PIPELINE_STATUSES: PurchaseStatus[] = ["bought", "to_carrier_jp", "shipped_jp_vn", "at_carrier_vn", "to_shop", "at_shop"];
/** Bought and still outside the shop warehouse ("đang trên đường về"). */
export const IN_TRANSIT_STATUSES: PurchaseStatus[] = ["bought", "to_carrier_jp", "shipped_jp_vn", "at_carrier_vn", "to_shop"];

/** Order logistics stage → the minimum purchase status every line of that order must have reached. */
export const STAGE_TO_PURCHASE: Partial<Record<string, PurchaseStatus>> = {
  in_transit: "shipped_jp_vn",
  vn_warehouse: "at_shop",
  delivering: "shipped_to_customer",
  delivered: "delivered",
};
