"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession, requireAdmin } from "@/lib/auth";
import { getJpyRate } from "@/lib/db";
import { isExpenseCurrency, isExpenseKind, parseAmount } from "@/lib/expenses";
import { addExpenseFiles, createExpense, deleteExpense, removeExpenseFile } from "@/lib/expenses-db";
import { parseExpiry } from "@/lib/lots";
import { deleteUpload, extForMime, MAX_UPLOAD_BYTES, RECEIPT_MIMES, saveUpload, slugifyFileName, uniqueName } from "@/lib/uploads";

/** Quản lý mua hàng › "Hoá đơn đồ tiêu hao": every action lands back on the purchases page at the expense block. */
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (fd: FormData) => {
  const tab = text(fd, "tab");
  return `/admin/purchases/?${tab ? `tab=${encodeURIComponent(tab)}&` : ""}`;
};
const go = (fd: FormData, key: "saved" | "error", msg: string, anchor = "#expenses"): never => redirect(`${back(fd)}${key}=${encodeURIComponent(msg)}${anchor}`);

export async function createExpenseAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const kind = text(formData, "kind");
  const currency = text(formData, "currency");
  const spentAt = text(formData, "spentAt") ? parseExpiry(text(formData, "spentAt")) : null;
  const amount = parseAmount(text(formData, "amount"));
  const title = text(formData, "title");
  if (!isExpenseKind(kind) || !isExpenseCurrency(currency)) go(formData, "error", "Yêu cầu không hợp lệ.");
  if (!spentAt) go(formData, "error", "Ngày mua không hợp lệ (VD 2026-10-03).");
  if (!title) go(formData, "error", "Nhập nội dung hoá đơn (VD: băng keo + xốp, Daiso).");
  if (amount === null || amount <= 0) go(formData, "error", "Số tiền phải lớn hơn 0.");
  const rate = currency === "JPY" ? await getJpyRate() : null;
  const e = createExpense({ kind: kind as "supplies" | "other", spentAt: spentAt!, title, store: text(formData, "store"), amount: amount!, currency: currency as "JPY" | "VND", rate, note: text(formData, "note"), createdBy: (await getAdminSession())?.label ?? "" });
  // bill photos / PDFs chosen on the same form
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  let skipped = 0;
  const saved: Array<{ path: string; url: string; name: string; mime: string }> = [];
  for (const file of files) {
    if (!RECEIPT_MIMES.has(file.type) || file.size > MAX_UPLOAD_BYTES) {
      skipped++;
      continue;
    }
    const stored = await saveUpload(`expenses/${e.id}`, uniqueName(slugifyFileName(file.name), extForMime(file.type) || ".bin"), Buffer.from(await file.arrayBuffer()));
    saved.push({ path: stored.rel, url: stored.url, name: file.name, mime: file.type });
  }
  if (saved.length) addExpenseFiles(e.id, saved);
  revalidatePath("/admin", "layout");
  go(formData, "saved", `Đã ghi hoá đơn ${e.title}: ${e.currency === "JPY" ? `¥${e.amount.toLocaleString("vi-VN")} ≈ ` : ""}${e.amountVnd.toLocaleString("vi-VN")}đ${saved.length ? ` · ${saved.length} tệp` : ""}${skipped ? ` · bỏ qua ${skipped} tệp (chỉ nhận ảnh / PDF dưới 10 MB)` : ""}. Kế toán › Lãi/lỗ đã trừ khoản này.`, `#expense-${e.id}`);
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = Number.parseInt(text(formData, "id"), 10);
  const e = Number.isInteger(id) ? deleteExpense(id) : null;
  if (!e) go(formData, "error", "Không tìm thấy hoá đơn.");
  for (const f of e!.files) await deleteUpload(f.path);
  revalidatePath("/admin", "layout");
  go(formData, "saved", `Đã xoá hoá đơn ${e!.title}.`);
}

export async function deleteExpenseFileAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = Number.parseInt(text(formData, "id"), 10);
  const removed = Number.isInteger(id) ? removeExpenseFile(id, text(formData, "path")) : null;
  if (!removed) go(formData, "error", "Không tìm thấy tệp.");
  await deleteUpload(removed!.path);
  revalidatePath("/admin", "layout");
  go(formData, "saved", "Đã gỡ tệp.", `#expense-${id}`);
}
