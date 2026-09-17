"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { parseExpiry, todayIso } from "@/lib/lots";
import { confirmReceipt, createDraftFromBill, createReceiptFromLines, deleteReceipt, updateReceipt } from "@/lib/receipts-db";

const PAGE = "/admin/purchases/?tab=receipts";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (key: "saved" | "error", msg: string, extra = ""): never => redirect(`${PAGE}&${key}=${encodeURIComponent(msg)}${extra}`);
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
  const r = createDraftFromBill(raw, { sourceKey: text(formData, "sourceKey"), boughtAt: dateOr(text(formData, "boughtAt"), ""), orderRef: text(formData, "orderRef").slice(0, 80) });
  revalidatePath("/admin", "layout");
  if (!r) go("error", "Không nhận ra dòng sản phẩm nào — mỗi dòng cần có số lượng (VD “数量: 2”, “x2”, “2 x Tên”).");
  go("saved", `Đã đọc ${r!.parsedItems} dòng từ bill → phiếu nháp ${r!.receipt.code}. Kiểm tra sản phẩm khớp rồi bấm Xác nhận.`, `&draft=${r!.receipt.id}#receipt-${r!.receipt.id}`);
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
  const r = await confirmReceipt(id, map);
  revalidatePath("/admin", "layout");
  if (!r) go("error", "Phiếu không còn ở trạng thái nháp.");
  go("saved", `Đã xác nhận phiếu: ${r!.linesCovered} dòng đơn chuyển sang "Đã mua"${r!.stockUnits ? `, ${r!.stockUnits} đơn vị thành phiếu mua lưu kho (kho Nhật)` : ""}.`, `#receipt-${id}`);
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
  go("saved", shippedAt ? "Đã lưu phiếu — các dòng liên quan chuyển sang \"Tới ĐVVC Nhật\"." : "Đã lưu phiếu.", `#receipt-${id}`);
}

export async function deleteReceiptAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = Number.parseInt(text(formData, "id"), 10);
  const ok = Number.isInteger(id) && deleteReceipt(id);
  revalidatePath("/admin", "layout");
  go(ok ? "saved" : "error", ok ? "Đã xoá phiếu (các dòng đơn giữ trạng thái, bỏ liên kết phiếu)." : "Không xoá được.");
}
