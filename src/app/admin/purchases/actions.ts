"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { setOrderItemSource, setOrderItemsPurchase, updateOrderItemPurchaseFacts } from "@/lib/db";
import { parseExpiry } from "@/lib/lots";
import { isPurchaseStatus, PURCHASE_LABEL } from "@/lib/purchase";

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (url: string, key: "saved" | "error", msg: string): never => redirect(`${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);

/** One line: set its purchase status (+ optional note). `back` = page to return to (purchases list or order detail). */
export async function setPurchaseAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = Number.parseInt(text(formData, "itemId"), 10);
  const status = text(formData, "status");
  const url = text(formData, "back") || "/admin/purchases/";
  if (!Number.isInteger(id) || !isPurchaseStatus(status)) return back(url, "error", "Yêu cầu không hợp lệ.");
  const note = formData.has("note") ? text(formData, "note") : undefined;
  await setOrderItemsPurchase([id], status, note);
  if (formData.has("sourceKey")) await setOrderItemSource(id, text(formData, "sourceKey"));
  // purchase facts typed on the line (Mua theo đợt): HSD, ngày mua, ¥/đv
  if (formData.has("expiry") || formData.has("boughtAt") || formData.has("costJpy")) {
    const facts: Parameters<typeof updateOrderItemPurchaseFacts>[1] = {};
    if (formData.has("expiry")) {
      const raw = text(formData, "expiry");
      const v = raw ? parseExpiry(raw) : null;
      if (raw && !v) return back(url, "error", "Hạn dùng không hợp lệ (VD 2027-03-31, 03/2027).");
      facts.expiry = v;
    }
    if (formData.has("boughtAt")) {
      const raw = text(formData, "boughtAt");
      const v = raw ? parseExpiry(raw) : null;
      if (raw && !v) return back(url, "error", "Ngày mua không hợp lệ (VD 2026-09-27).");
      facts.boughtAt = v;
    }
    if (formData.has("costJpy")) {
      const digits = text(formData, "costJpy").replace(/[^\d]/g, "");
      facts.costJpy = digits ? Number.parseInt(digits, 10) : null;
    }
    await updateOrderItemPurchaseFacts(id, facts);
  }
  revalidatePath("/admin", "layout");
  back(url, "saved", `Đã lưu dòng — "${PURCHASE_LABEL[status]}".`);
}

/** Many lines at once (checkboxes + one status). */
export async function bulkPurchaseAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const ids = formData.getAll("ids").map((v) => Number.parseInt(String(v), 10)).filter(Number.isInteger);
  const status = text(formData, "status");
  const url = text(formData, "back") || "/admin/purchases/";
  if (!ids.length) return back(url, "error", "Chưa chọn dòng nào.");
  if (!isPurchaseStatus(status)) return back(url, "error", "Chưa chọn trạng thái.");
  const n = await setOrderItemsPurchase(ids, status);
  revalidatePath("/admin", "layout");
  back(url, "saved", `Đã cập nhật ${n} dòng sang "${PURCHASE_LABEL[status]}".`);
}
