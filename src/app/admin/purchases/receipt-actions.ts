"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { parseExpiry, todayIso } from "@/lib/lots";
import { addReceiptFiles, confirmReceipt, createDraftFromBill, createReceiptFromLines, deleteReceipt, removeReceiptFile, updateReceipt } from "@/lib/receipts-db";
import { deleteUpload, extForMime, MAX_UPLOAD_BYTES, RECEIPT_MIMES, saveUpload, slugifyFileName, uniqueName } from "@/lib/uploads";

const PAGE = "/admin/purchases/?tab=receipts";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (key: "saved" | "error", msg: string, extra = "", back = ""): never => redirect(`${back || PAGE}&${key}=${encodeURIComponent(msg)}${extra}`);
/** Tab the bill form was submitted from ("orders" | "stock" | "batches") → where to land afterwards. */
const backOf = (fd: FormData) => {
  const tab = text(fd, "fromTab");
  return tab === "stock" || tab === "batches" || tab === "orders" ? `/admin/purchases/?tab=${tab}&receipts=1` : "";
};
const dateOr = (raw: string, fallback: string) => (raw ? parseExpiry(raw) ?? fallback : fallback);

/** Ticked order lines → one receipt (Quản lý mua hàng › "Các dòng đã tick → Tạo phiếu mua"). */
export async function createReceiptFromLinesAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const ids = formData.getAll("ids").map((v) => Number.parseInt(String(v), 10)).filter(Number.isInteger);
  const back = text(formData, "back") || "/admin/purchases/";
  if (!ids.length) redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent("Chưa tick dòng nào.")}`);
  const r = createReceiptFromLines(ids, { sourceKey: text(formData, "receiptSource"), boughtAt: dateOr(text(formData, "receiptDate"), todayIso()), orderRef: text(formData, "receiptRef").slice(0, 80), note: text(formData, "receiptNote").slice(0, 300) });
  revalidatePath("/admin", "layout");
  if (!r) redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent("Không tạo được phiếu.")}`);
  go("saved", `Đã tạo phiếu ${r!.code} — ${ids.length} dòng đơn chuyển sang "Đã mua".`, `#receipt-${r!.id}`);
}

/** Pasted bill → draft receipt with parsed items + suggested products. */
export async function parseBillAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const raw = text(formData, "bill");
  if (raw.length < 5) go("error", "Dán nội dung bill (email đặt hàng Amazon / Rakuten, hoặc danh sách: tên · số lượng · giá).");
  const batchRaw = Number.parseInt(text(formData, "batchId"), 10);
  const back = backOf(formData);
  const r = createDraftFromBill(raw, { sourceKey: text(formData, "sourceKey"), boughtAt: dateOr(text(formData, "boughtAt"), ""), orderRef: text(formData, "orderRef").slice(0, 80), batchId: Number.isInteger(batchRaw) && batchRaw > 0 ? batchRaw : null });
  revalidatePath("/admin", "layout");
  if (!r) go("error", "Không nhận ra dòng sản phẩm nào — mỗi dòng cần có số lượng (VD “数量: 2”, “x2”, “2 x Tên”).", "", back);
  go("saved", `Đã đọc ${r!.parsedItems} dòng từ bill → phiếu nháp ${r!.receipt.code}${r!.receipt.batchCode ? ` (vào đợt ${r!.receipt.batchCode})` : ""}. Kiểm tra sản phẩm khớp rồi bấm Xác nhận.`, `&draft=${r!.receipt.id}#receipt-${r!.receipt.id}`, back);
}

/** Draft → real receipt: confirmed products cover open order lines, the rest becomes a lot purchase. */
export async function confirmReceiptAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = Number.parseInt(text(formData, "id"), 10);
  if (!Number.isInteger(id)) go("error", "Yêu cầu không hợp lệ.");
  const map: Record<number, number | null> = {};
  for (const [k, v] of formData.entries()) {
    const m = /^item_(\d+)$/.exec(k);
    if (!m) continue;
    const pid = Number.parseInt(String(v), 10);
    map[Number(m[1])] = Number.isInteger(pid) && pid > 0 ? pid : null;
  }
  const back = backOf(formData);
  const r = await confirmReceipt(id, map, { received: text(formData, "received") !== "0" });
  revalidatePath("/admin", "layout");
  if (!r) go("error", "Phiếu không còn ở trạng thái nháp.", "", back);
  go("saved", `Đã xác nhận phiếu: ${r!.linesCovered} dòng đơn có nguồn${r!.stockUnits ? `, ${r!.stockUnits} đơn vị lưu kho` : ""} — ${text(formData, "received") !== "0" ? "hàng đã cầm, thành lô ở Kho Nhật (shop)" : "đã đặt mua online, chờ nhận"}.`, `#receipt-${id}`, back);
}

export async function updateReceiptAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = Number.parseInt(text(formData, "id"), 10);
  if (!Number.isInteger(id)) go("error", "Yêu cầu không hợp lệ.");
  const shippedRaw = text(formData, "shippedAt");
  const shippedAt = shippedRaw ? parseExpiry(shippedRaw) : null;
  if (shippedRaw && !shippedAt) go("error", "Ngày gửi không hợp lệ (VD 2026-09-17).");
  const ok = updateReceipt(id, { shippedAt, tracking: text(formData, "tracking").slice(0, 120), note: text(formData, "note").slice(0, 300), orderRef: text(formData, "orderRef").slice(0, 80), boughtAt: dateOr(text(formData, "boughtAt"), todayIso()), sourceKey: text(formData, "sourceKey") || undefined });
  revalidatePath("/admin", "layout");
  if (!ok) go("error", "Không tìm thấy phiếu.");
  go("saved", shippedAt ? "Đã lưu phiếu — các dòng liên quan chuyển sang \"Tới ĐVVC Nhật\"." : "Đã lưu phiếu.", `#receipt-${id}`, backOf(formData));
}

export async function deleteReceiptAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = Number.parseInt(text(formData, "id"), 10);
  const ok = Number.isInteger(id) && deleteReceipt(id);
  revalidatePath("/admin", "layout");
  go(ok ? "saved" : "error", ok ? "Đã xoá phiếu (các dòng đơn giữ trạng thái, bỏ liên kết phiếu)." : "Không xoá được.", "", backOf(formData));
}

/** Attach bill photos / PDFs to a receipt (checked later against what was booked). */
export async function uploadReceiptFilesAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = Number.parseInt(text(formData, "id"), 10);
  const back = backOf(formData);
  if (!Number.isInteger(id)) go("error", "Yêu cầu không hợp lệ.", "", back);
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) go("error", "Chưa chọn ảnh nào.", `#receipt-${id}`, back);
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
    const stored = await saveUpload(`receipts/${id}`, name, Buffer.from(await file.arrayBuffer()));
    saved.push({ path: stored.rel, url: stored.url, name: file.name, mime: file.type });
  }
  if (saved.length) addReceiptFiles(id, saved);
  revalidatePath("/admin", "layout");
  go(saved.length ? "saved" : "error", `${saved.length ? `Đã đính kèm ${saved.length} tệp vào phiếu.` : ""}${error ? ` ${error}` : ""}`.trim(), `#receipt-${id}`, back);
}

export async function deleteReceiptFileAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = Number.parseInt(text(formData, "id"), 10);
  const path = text(formData, "path");
  const back = backOf(formData);
  if (!Number.isInteger(id) || !path) go("error", "Yêu cầu không hợp lệ.", "", back);
  const removed = removeReceiptFile(id, path);
  if (removed) await deleteUpload(removed.path);
  revalidatePath("/admin", "layout");
  go(removed ? "saved" : "error", removed ? "Đã gỡ tệp." : "Không tìm thấy tệp.", `#receipt-${id}`, back);
}
