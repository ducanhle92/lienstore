"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { addStockLot, deleteStockLot, updateStockLot } from "@/lib/db";
import { parseExpiry } from "@/lib/lots";
import { isWarehouse } from "@/lib/warehouses";

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const intOr = (s: string, d: number | null): number | null => {
  const t = s.replace(/[^\d]/g, "");
  return t ? Number.parseInt(t, 10) : d;
};
const back = (productId: number, key: "saved" | "error", msg: string): never => redirect(`/admin/inventory/lots/${productId}/?${key}=${encodeURIComponent(msg)}`);

/** Kho hàng › Lô hàng › "Nhập lô": goods that arrived without a purchase slip (bought in person, gift, returns…). */
export async function addLotAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const productId = Number.parseInt(text(formData, "productId"), 10);
  if (!Number.isInteger(productId)) redirect("/admin/inventory/");
  const qty = intOr(text(formData, "qty"), 0) ?? 0;
  if (qty <= 0) back(productId, "error", "Số lượng phải > 0.");
  const expiryRaw = text(formData, "expiry");
  const expiry = expiryRaw ? parseExpiry(expiryRaw) : null;
  if (expiryRaw && !expiry) back(productId, "error", "Hạn dùng không hợp lệ — ghi 2027-03-31, 31/03/2027 hoặc 2027-03.");
  const receivedRaw = text(formData, "receivedAt");
  const receivedAt = receivedRaw ? parseExpiry(receivedRaw) : null;
  if (receivedRaw && !receivedAt) back(productId, "error", "Ngày nhập không hợp lệ.");
  const wh = text(formData, "warehouse");
  await addStockLot({ productId, qty, receivedAt: receivedAt ?? undefined, sourceKey: text(formData, "sourceKey") || undefined, unitCostJpy: intOr(text(formData, "unitCostJpy"), null), expiry, warehouse: isWarehouse(wh) ? wh : undefined, location: text(formData, "location").slice(0, 80), note: text(formData, "note").slice(0, 200) });
  revalidatePath("/admin", "layout");
  back(productId, "saved", `Đã nhập lô ${qty} đơn vị.`);
}

export async function updateLotAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const productId = Number.parseInt(text(formData, "productId"), 10);
  const id = Number.parseInt(text(formData, "lotId"), 10);
  if (!Number.isInteger(productId) || !Number.isInteger(id)) redirect("/admin/inventory/");
  if (formData.get("remove") === "1") {
    await deleteStockLot(id);
    revalidatePath("/admin", "layout");
    back(productId, "saved", "Đã xoá lô; tồn kho tính lại.");
  }
  const expiryRaw = text(formData, "expiry");
  const expiry = expiryRaw ? parseExpiry(expiryRaw) : null;
  if (expiryRaw && !expiry) back(productId, "error", "Hạn dùng không hợp lệ — ghi 2027-03-31, 31/03/2027 hoặc 2027-03.");
  const receivedRaw = text(formData, "receivedAt");
  const receivedAt = receivedRaw ? parseExpiry(receivedRaw) : null;
  if (receivedRaw && !receivedAt) back(productId, "error", "Ngày nhập không hợp lệ.");
  const qtyLeft = intOr(text(formData, "qtyLeft"), null);
  if (qtyLeft === null || qtyLeft < 0) return back(productId, "error", "Số lượng còn phải là số ≥ 0.");
  const wh = text(formData, "warehouse");
  await updateStockLot(id, { qtyLeft, receivedAt: receivedAt ?? undefined, sourceKey: text(formData, "sourceKey") || undefined, unitCostJpy: intOr(text(formData, "unitCostJpy"), null), expiry, warehouse: isWarehouse(wh) ? wh : undefined, location: text(formData, "location").slice(0, 80), note: text(formData, "note").slice(0, 200) });
  revalidatePath("/admin", "layout");
  back(productId, "saved", "Đã lưu lô.");
}
