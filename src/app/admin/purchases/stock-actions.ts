"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession, requireAdmin } from "@/lib/auth";
import { parseExpiry } from "@/lib/lots";
import { isPurchaseStatus, PURCHASE_LABEL, type PurchaseStatus } from "@/lib/purchase";
import { moveUnitsToBatch } from "@/lib/purchase-batches-db";
import { createManualReceipt } from "@/lib/receipts-db";
import { getDb, withTransaction } from "@/lib/sqlite";
import { createUnitsSync, moveUnitsSync, touchSync } from "@/lib/units-db";

const PAGE = "/admin/purchases/?tab=stock";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (s: string, d: number | null): number | null => {
  const t = s.replace(/[^\d]/g, "");
  return t ? Number.parseInt(t, 10) : d;
};
const ints = (fd: FormData, k: string) => fd.getAll(k).flatMap((v) => String(v).split(/[,.\s]+/)).map((v) => Number.parseInt(v, 10)).filter(Number.isInteger);
const back = (key: "saved" | "error", msg: string): never => redirect(`${PAGE}&${key}=${encodeURIComponent(msg)}`);

/** "Mua lưu kho": bought for stock (no order, no trip) — `qty` units with their own codes; waiting orders are served first. */
export async function createStockUnitsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const productId = Number.parseInt(text(formData, "productId"), 10);
  if (!Number.isInteger(productId)) back("error", "Chọn sản phẩm.");
  const qty = num(text(formData, "qty"), 0) ?? 0;
  if (qty <= 0 || qty > 500) back("error", "Số lượng phải từ 1 đến 500.");
  const expiryRaw = text(formData, "expiry");
  const expiry = expiryRaw ? parseExpiry(expiryRaw) : null;
  if (expiryRaw && !expiry) back("error", "Hạn dùng không hợp lệ — ghi 2027-03-31, 31/03/2027 hoặc 2027-03.");
  const boughtRaw = text(formData, "boughtAt");
  const boughtAt = boughtRaw ? parseExpiry(boughtRaw) : new Date().toISOString().slice(0, 10);
  if (boughtRaw && !boughtAt) back("error", "Ngày mua không hợp lệ (VD 2026-09-27).");
  const statusRaw = text(formData, "status");
  const status: PurchaseStatus = isPurchaseStatus(statusRaw) ? statusRaw : "bought";
  const sourceKey = text(formData, "sourceKey") || "unknown";
  const billCode = text(formData, "billCode");
  const receiptId = createManualReceipt({ sourceKey, boughtAt: boughtAt ?? new Date().toISOString().slice(0, 10), code: billCode || undefined })?.id ?? null;
  const actor = (await getAdminSession())?.label ?? "";
  const db = getDb();
  const ids = withTransaction(db, () => {
    const made = createUnitsSync(db, { productId, qty, status, receiptId, sourceKey, store: text(formData, "store").slice(0, 80), boughtAt, expiry, unitCostJpy: num(text(formData, "unitCostJpy"), null), origin: "bill", note: text(formData, "note").slice(0, 200), actor });
    touchSync(db, { unitIds: made });
    return made;
  });
  revalidatePath("/admin", "layout");
  back("saved", `Đã nhập ${ids.length} cái (${PURCHASE_LABEL[status]}) — mỗi cái một mã riêng; đơn đang chờ sản phẩm này được giữ hàng trước.`);
}

/** Ticked stock lines: move their units to a status, or into a purchase batch (to travel with that trip). */
export async function bulkStockUnitsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const ids = ints(formData, "uids");
  if (!ids.length) back("error", "Chưa tick dòng nào.");
  const op = text(formData, "op");
  if (op === "batch") {
    const batchId = Number.parseInt(text(formData, "batchId"), 10);
    if (!Number.isInteger(batchId)) back("error", "Chọn đợt.");
    const n = moveUnitsToBatch(ids, batchId);
    revalidatePath("/admin", "layout");
    back("saved", `Đã đưa ${n} cái vào đợt.`);
  }
  const status = text(formData, "status");
  if (!isPurchaseStatus(status)) back("error", "Chưa chọn trạng thái.");
  const actor = (await getAdminSession())?.label ?? "";
  const db = getDb();
  const n = withTransaction(db, () => {
    const k = moveUnitsSync(db, ids, status as PurchaseStatus, { actor });
    touchSync(db, { unitIds: ids });
    return k;
  });
  revalidatePath("/admin", "layout");
  back("saved", `Đã chuyển ${n} cái sang "${PURCHASE_LABEL[status as PurchaseStatus]}".`);
}
