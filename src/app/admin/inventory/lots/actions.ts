"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession, requireAdmin } from "@/lib/auth";
import { parseExpiry } from "@/lib/lots";
import { isPurchaseStatus, type PurchaseStatus } from "@/lib/purchase";
import { ensureUnitsReceipt, receiptIdForCode } from "@/lib/purchase-batches-db";
import { addReceiptFiles } from "@/lib/receipts-db";
import { getDb, withTransaction } from "@/lib/sqlite";
import { applyUnitRowEdits, readUnitRowFields } from "@/lib/unit-rows";
import { isUnitRemoved } from "@/lib/units";
import { createUnitsSync, listUnits, removeUnitsSync, restoreUnitsSync, touchSync } from "@/lib/units-db";
import { extForMime, MAX_UPLOAD_BYTES, RECEIPT_MIMES, saveUpload, slugifyFileName, uniqueName } from "@/lib/uploads";

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (s: string, d: number | null): number | null => {
  const t = s.replace(/[^\d]/g, "");
  return t ? Number.parseInt(t, 10) : d;
};
const ints = (fd: FormData, k: string) => fd.getAll(k).flatMap((v) => String(v).split(/[,.\s]+/)).map((v) => Number.parseInt(v, 10)).filter(Number.isInteger);
const back = (productId: number, key: "saved" | "error", msg: string): never => redirect(`/admin/inventory/lots/${productId}/?${key}=${encodeURIComponent(msg)}`);
const actor = async () => (await getAdminSession())?.label ?? "";

/** "Nhập hàng trực tiếp": goods that came without a trip (bought in person, gift, returns…) — `qty` units with codes. */
export async function addUnitsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const productId = Number.parseInt(text(formData, "productId"), 10);
  if (!Number.isInteger(productId)) redirect("/admin/inventory/");
  const qty = num(text(formData, "qty"), 0) ?? 0;
  if (qty <= 0 || qty > 500) back(productId, "error", "Số lượng phải từ 1 đến 500.");
  const expiryRaw = text(formData, "expiry");
  const expiry = expiryRaw ? parseExpiry(expiryRaw) : null;
  if (expiryRaw && !expiry) back(productId, "error", "Hạn dùng không hợp lệ — ghi 2027-03-31, 31/03/2027 hoặc 2027-03.");
  const boughtRaw = text(formData, "boughtAt");
  const boughtAt = boughtRaw ? parseExpiry(boughtRaw) : null;
  if (boughtRaw && !boughtAt) back(productId, "error", "Ngày mua không hợp lệ.");
  const statusRaw = text(formData, "status");
  const status: PurchaseStatus = isPurchaseStatus(statusRaw) ? statusRaw : "at_shop";
  const code = text(formData, "billCode");
  const receiptId = code ? receiptIdForCode(code, null) : null;
  const who = await actor();
  const db = getDb();
  const ids = withTransaction(db, () => {
    const made = createUnitsSync(db, { productId, qty, status, receiptId, sourceKey: text(formData, "sourceKey") || "manual", store: text(formData, "store").slice(0, 80), boughtAt, expiry, unitCostJpy: num(text(formData, "unitCostJpy"), null), origin: text(formData, "origin") === "return" ? "return" : "manual", note: text(formData, "note").slice(0, 200), actor: who });
    touchSync(db, { unitIds: made });
    return made;
  });
  revalidatePath("/admin", "layout");
  back(productId, "saved", `Đã nhập ${ids.length} cái (mã ${listUnits(getDb(), { ids: [ids[0], ids[ids.length - 1]] }).map((u) => u.code).join(" … ")}).`);
}

/** "Lưu thay đổi" on the product page: bill lines g_* and units u_* (see lib/unit-rows.ts). */
export async function saveProductUnitsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const productId = Number.parseInt(text(formData, "productId"), 10);
  if (!Number.isInteger(productId)) redirect("/admin/inventory/");
  const who = await actor();
  const db = getDb();
  const units = listUnits(db, { productId, withDelivered: true });
  const r = withTransaction(db, () => {
    const res = applyUnitRowEdits(db, readUnitRowFields(formData), units, { batchId: null, actor: who });
    touchSync(db, { unitIds: res.touched, productIds: [productId] });
    return res;
  });
  revalidatePath("/admin", "layout");
  if (r.errors.length) back(productId, r.changed ? "saved" : "error", `${r.changed ? `Đã lưu ${r.changed} thay đổi. ` : ""}Lỗi: ${r.errors.join(" · ")}`);
  back(productId, "saved", r.changed ? `Đã lưu ${r.changed} thay đổi.` : "Không có gì thay đổi.");
}

/** Ticked units written off (thất lạc / hỏng / loại bỏ) or restored. */
export async function removeUnitsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const productId = Number.parseInt(text(formData, "productId"), 10);
  if (!Number.isInteger(productId)) redirect("/admin/inventory/");
  const ids = ints(formData, "uids");
  if (!ids.length) back(productId, "error", "Chưa tick cái nào.");
  const reason = text(formData, "reason");
  const who = await actor();
  const db = getDb();
  const n = withTransaction(db, () => {
    const k = reason === "restore" ? restoreUnitsSync(db, ids, { actor: who }) : removeUnitsSync(db, ids, isUnitRemoved(reason) ? reason : "lost", { actor: who, note: text(formData, "note") });
    touchSync(db, { unitIds: ids, productIds: [productId] });
    return k;
  });
  revalidatePath("/admin", "layout");
  back(productId, "saved", reason === "restore" ? `Đã khôi phục ${n} cái.` : `Đã loại ${n} cái khỏi tồn kho.`);
}

/** "Đính ảnh bill" on one bill line: its units get a bill if they have none (PM-… or the typed code), then the photos attach. */
export async function uploadUnitsBillFilesAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const productId = Number.parseInt(text(formData, "productId"), 10);
  const ids = ints(formData, "uids");
  if (!Number.isInteger(productId) || !ids.length) redirect("/admin/inventory/");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) back(productId, "error", "Chưa chọn ảnh nào.");
  const receiptId = ensureUnitsReceipt(ids, { code: text(formData, "billCode") });
  if (!receiptId) back(productId, "error", "Không tạo được bill cho dòng này.");
  const saved: Array<{ path: string; url: string; name: string; mime: string }> = [];
  let error = "";
  for (const file of files) {
    if (!RECEIPT_MIMES.has(file.type)) {
      error = `Bỏ qua ${file.name}: chỉ nhận ảnh hoặc PDF.`;
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      error = `Bỏ qua ${file.name}: vượt 10 MB.`;
      continue;
    }
    const ext = extForMime(file.type) || ".bin";
    const name = uniqueName(slugifyFileName(file.name), ext);
    const stored = await saveUpload(`receipts/${receiptId}`, name, Buffer.from(await file.arrayBuffer()));
    saved.push({ path: stored.rel, url: stored.url, name: file.name, mime: file.type });
  }
  if (saved.length) addReceiptFiles(receiptId!, saved);
  revalidatePath("/admin", "layout");
  back(productId, saved.length ? "saved" : "error", `${saved.length ? `Đã đính ${saved.length} ảnh vào bill.` : ""}${error ? ` ${error}` : ""}`.trim());
}
