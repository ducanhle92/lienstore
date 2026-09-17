"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createStockPurchase, deleteStockPurchase, setStockPurchaseStatus } from "@/lib/db";
import { parseExpiry } from "@/lib/lots";
import { isPurchaseStatus, PURCHASE_LABEL } from "@/lib/purchase";
import { isWarehouse } from "@/lib/warehouses";

const PAGE = "/admin/purchases/?tab=stock";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const intOr = (s: string, d: number | null): number | null => {
  const t = s.replace(/[^\d]/g, "");
  return t ? Number.parseInt(t, 10) : d;
};
const back = (key: "saved" | "error", msg: string): never => redirect(`${PAGE}&${key}=${encodeURIComponent(msg)}`);

/** "Mua lưu kho": buy for stock (a good price, not for a specific order); tracked along the same chain as order lines. */
export async function createStockPurchaseAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const productId = Number.parseInt(text(formData, "productId"), 10);
  if (!Number.isInteger(productId)) back("error", "Chọn sản phẩm.");
  const qty = intOr(text(formData, "qty"), 0) ?? 0;
  if (qty <= 0) back("error", "Số lượng phải > 0.");
  const expiryRaw = text(formData, "expiry");
  const expiry = expiryRaw ? parseExpiry(expiryRaw) : null;
  if (expiryRaw && !expiry) back("error", "Hạn dùng không hợp lệ — ghi 2027-03-31, 31/03/2027 hoặc 2027-03.");
  const statusRaw = text(formData, "status");
  const status = isPurchaseStatus(statusRaw) ? statusRaw : "bought";
  const wh = text(formData, "warehouse");
  const sp = await createStockPurchase({ productId, qty, sourceKey: text(formData, "sourceKey") || "unknown", unitCostJpy: intOr(text(formData, "unitCostJpy"), null), expiry, warehouse: isWarehouse(wh) ? wh : undefined, location: text(formData, "location").slice(0, 80), note: text(formData, "note").slice(0, 200), status });
  revalidatePath("/admin", "layout");
  back("saved", status === "at_shop" ? `Đã nhập kho ${qty} × ${sp.productName} (tạo lô).` : `Đã tạo phiếu mua lưu kho #${sp.id}: ${qty} × ${sp.productName} — ${PURCHASE_LABEL[status]}.`);
}

export async function setStockPurchaseStatusAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = Number.parseInt(text(formData, "purchaseId"), 10);
  const status = text(formData, "status");
  if (!Number.isInteger(id) || !isPurchaseStatus(status)) return back("error", "Yêu cầu không hợp lệ.");
  const res = await setStockPurchaseStatus(id, status, formData.has("note") ? text(formData, "note") : undefined);
  revalidatePath("/admin", "layout");
  if (!res.ok) back("error", res.message ?? "Không cập nhật được.");
  back("saved", res.lotId && status === "at_shop" ? `Đã nhận hàng — tạo lô #${res.lotId}, tồn kho cập nhật.` : `Đã chuyển sang "${PURCHASE_LABEL[status]}".`);
}

export async function bulkStockPurchaseAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const ids = formData.getAll("spids").map((v) => Number.parseInt(String(v), 10)).filter(Number.isInteger);
  const status = text(formData, "status");
  if (!ids.length) back("error", "Chưa chọn phiếu nào.");
  if (!isPurchaseStatus(status)) return back("error", "Chưa chọn trạng thái.");
  let n = 0;
  for (const id of ids) if ((await setStockPurchaseStatus(id, status)).ok) n++;
  revalidatePath("/admin", "layout");
  back("saved", `Đã cập nhật ${n} phiếu sang "${PURCHASE_LABEL[status]}".`);
}

export async function deleteStockPurchaseAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = Number.parseInt(text(formData, "purchaseId"), 10);
  const ok = Number.isInteger(id) && (await deleteStockPurchase(id));
  revalidatePath("/admin", "layout");
  if (!ok) back("error", "Không xoá được: phiếu đã thành lô — sửa lô trong Kho hàng.");
  back("saved", "Đã xoá phiếu mua lưu kho.");
}
