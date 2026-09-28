"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession, requireAdmin } from "@/lib/auth";
import { reallocateOpenOrders } from "@/lib/allocations-db";
import { setOrderItemsPurchase } from "@/lib/db";
import { parseExpiry } from "@/lib/lots";
import { isPurchaseStatus, type PurchaseStatus } from "@/lib/purchase";
import { addLinesToBatch, addProductToBatch, createPurchaseBatch, deletePurchaseBatch, deleteUnits, getPurchaseBatch, importBillsFromText, removeLineFromBatch, updatePurchaseBatch } from "@/lib/purchase-batches-db";
import { createManualReceipt, renameReceipt } from "@/lib/receipts-db";
import { getDb, withTransaction } from "@/lib/sqlite";
import { moveUnitsSync, removeUnitsSync, touchSync } from "@/lib/units-db";
import { applyUnitRowEdits, readUnitRowFields } from "@/lib/unit-rows";

/** Quản lý mua hàng › tab "Mua theo đợt" — every action lands back on the tab (anchored on the batch card). */
const PAGE = "/admin/purchases/?tab=batches";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const intOr = (fd: FormData, k: string) => {
  const n = Number.parseInt(text(fd, k), 10);
  return Number.isInteger(n) ? n : null;
};
const ints = (fd: FormData, k: string) => fd.getAll(k).flatMap((v) => String(v).split(/[,.\s]+/)).map((v) => Number.parseInt(v, 10)).filter(Number.isInteger);
const go = (key: "saved" | "error", msg: string, batchId?: number | null): never => redirect(`${PAGE}&${key}=${encodeURIComponent(msg)}${batchId ? `#batch-${batchId}` : ""}`);
/** Free-text date ("2026-09-27", "27/09/2026") → ISO; empty → null; garbage → undefined (invalid). */
const dateOrNull = (raw: string): string | null | undefined => (raw ? (parseExpiry(raw) ?? undefined) : null);
const actor = async () => (await getAdminSession())?.label ?? "";

export async function createBatchAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const boughtAt = dateOrNull(text(formData, "boughtAt"));
  if (boughtAt === undefined) go("error", "Ngày mua không hợp lệ (VD 2026-09-27).");
  const b = createPurchaseBatch({ label: text(formData, "label").slice(0, 80), sourceKey: text(formData, "sourceKey"), boughtAt: boughtAt ?? null, note: text(formData, "note").slice(0, 300) });
  revalidatePath("/admin", "layout");
  go("saved", `Đã mở đợt mua ${b.code}. Nhập bill hoặc bấm “+ Thêm sản phẩm” — mỗi cái mua được một mã riêng (H…).`, b.id);
}

export async function updateBatchAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = intOr(formData, "batchId");
  if (!id) go("error", "Yêu cầu không hợp lệ.");
  const boughtAt = dateOrNull(text(formData, "boughtAt"));
  if (boughtAt === undefined) go("error", "Ngày mua không hợp lệ (VD 2026-09-27).", id);
  const ok = updatePurchaseBatch(id!, { label: text(formData, "label").slice(0, 80), sourceKey: text(formData, "sourceKey"), boughtAt: boughtAt ?? null, tracking: text(formData, "tracking").slice(0, 120), note: text(formData, "note").slice(0, 300) });
  revalidatePath("/admin", "layout");
  go(ok ? "saved" : "error", ok ? "Đã lưu thông tin đợt." : "Không tìm thấy đợt.", id);
}

/** Ticked order lines (from "Mua theo đặt hàng") planned to be bought in a batch. */
export async function addLinesToBatchAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = intOr(formData, "batchId");
  const ids = ints(formData, "ids");
  const back = text(formData, "back");
  const bounce = (key: "saved" | "error", msg: string): never => (back ? redirect(`${back}${back.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`) : go(key, msg, id));
  if (!id) bounce("error", "Chưa chọn đợt.");
  if (!ids.length) bounce("error", "Chưa tick dòng nào.");
  const r = addLinesToBatch(id!, ids);
  revalidatePath("/admin", "layout");
  if (!r) bounce("error", "Không tìm thấy đợt.");
  bounce("saved", `Đã đưa ${r!.added}/${ids.length} dòng đơn vào đợt ${r!.code}${r!.added < ids.length ? " (dòng đã thuộc đợt khác bị bỏ qua)" : ""}.`);
}

export async function removeLineFromBatchAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  const itemId = intOr(formData, "itemId");
  const ok = itemId ? removeLineFromBatch(itemId) : false;
  revalidatePath("/admin", "layout");
  go(ok ? "saved" : "error", ok ? "Đã bỏ dòng đơn khỏi đợt." : "Không bỏ được dòng đơn.", batchId);
}

/** "+ Thêm sản phẩm": `qty` units of a product bought in the batch (one code each); waiting orders are served first. */
export async function addProductAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  if (!batchId) go("error", "Yêu cầu không hợp lệ.");
  const productId = intOr(formData, "productId");
  const qty = intOr(formData, "qty");
  if (!productId) go("error", "Chưa chọn sản phẩm.", batchId);
  if (!qty || qty <= 0 || qty > 500) go("error", "Số lượng phải từ 1 đến 500.", batchId);
  const expiryRaw = text(formData, "expiry");
  const expiry = expiryRaw ? parseExpiry(expiryRaw) : null;
  if (expiryRaw && !expiry) go("error", "Hạn dùng không hợp lệ (VD 2027-03-31, 03/2027).", batchId);
  const boughtAt = dateOrNull(text(formData, "boughtAt"));
  if (boughtAt === undefined) go("error", "Ngày mua không hợp lệ (VD 2026-09-27).", batchId);
  const jpyRaw = text(formData, "unitCostJpy").replace(/[^\d]/g, "");
  const unitCostJpy = jpyRaw ? Number.parseInt(jpyRaw, 10) : null;
  const statusRaw = text(formData, "status");
  const status: PurchaseStatus = isPurchaseStatus(statusRaw) ? statusRaw : "bought";
  // which bill paid for it: an existing one of the batch, a new empty one (same source / date), or none
  const billRaw = text(formData, "billId");
  let receiptId: number | null = null;
  if (billRaw === "new") receiptId = createManualReceipt({ sourceKey: text(formData, "sourceKey"), boughtAt: boughtAt ?? new Date().toISOString().slice(0, 10), batchId: batchId! })?.id ?? null;
  else if (/^\d+$/.test(billRaw)) receiptId = Number.parseInt(billRaw, 10);
  const r = await addProductToBatch(batchId!, { productId: productId!, qty: qty!, status, expiry, boughtAt: boughtAt ?? null, unitCostJpy, note: "", store: text(formData, "note").slice(0, 80), sourceKey: text(formData, "sourceKey"), receiptId });
  revalidatePath("/admin", "layout");
  if (!r) go("error", "Không tìm thấy đợt.", batchId);
  const range = r!.codes.length > 1 ? `${r!.codes[0]} … ${r!.codes[r!.codes.length - 1]}` : (r!.codes[0] ?? "");
  const parts = [`mã ${range}`];
  if (r!.covered) parts.push(`${r!.orderUnits} cái giữ cho ${r!.covered} dòng đơn đang chờ`);
  if (r!.stockUnits) parts.push(`${r!.stockUnits} cái lưu kho`);
  go("saved", `Đã thêm ${qty} cái vào đợt ${r!.code}: ${parts.join(" · ")}.`, batchId);
}

export async function deleteBatchAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  const r = batchId ? await deletePurchaseBatch(batchId) : { ok: false, message: "Yêu cầu không hợp lệ." };
  revalidatePath("/admin", "layout");
  if (!r.ok) go("error", r.message ?? "Không xoá được.", batchId);
  go("saved", "Đã xoá đợt — hàng đã mua vẫn giữ mã và vị trí (không còn thuộc đợt nào).");
}

/**
 * Ticked rows of a batch table: units (`uids`) and "cần mua" order lines (`needIds`).
 * status → units move there / the lines get their own units at that status ("đã mua cho đơn");
 * lost → units written off (thất lạc); delete → units entered by mistake vanish, lines leave the batch.
 */
export async function bulkBatchRowsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  if (!batchId) go("error", "Yêu cầu không hợp lệ.");
  const uids = ints(formData, "uids");
  const needIds = ints(formData, "needIds");
  const op = text(formData, "op");
  if (!uids.length && !needIds.length) go("error", "Chưa tick dòng nào.", batchId);
  const who = await actor();
  const db = getDb();
  if (op === "status") {
    const statusRaw = text(formData, "bulkStatus");
    if (!isPurchaseStatus(statusRaw)) go("error", "Chọn trạng thái cho các dòng đã tick.", batchId);
    const status = statusRaw as PurchaseStatus;
    const n = withTransaction(db, () => {
      const k = moveUnitsSync(db, uids, status, { actor: who, note: "Tick nhiều dòng" });
      touchSync(db, { unitIds: uids, batchIds: [batchId!] });
      return k;
    });
    const lines = needIds.length && status !== "not_bought" ? await setOrderItemsPurchase(needIds, status) : 0;
    revalidatePath("/admin", "layout");
    go("saved", `Đã cập nhật ${n} cái${lines ? ` · ${lines} dòng đơn được tạo mã (mua cho đơn)` : ""}.`, batchId);
  }
  if (op === "lost") {
    const n = withTransaction(db, () => {
      const k = removeUnitsSync(db, uids, "lost", { actor: who });
      touchSync(db, { unitIds: uids });
      return k;
    });
    revalidatePath("/admin", "layout");
    go("saved", `Đã đánh dấu ${n} cái thất lạc — đơn đang giữ chúng tự tìm cái khác.`, batchId);
  }
  if (op === "delete") {
    const r = deleteUnits(uids);
    let lines = 0;
    for (const id of needIds) if (removeLineFromBatch(id)) lines++;
    revalidatePath("/admin", "layout");
    go("saved", `Đã xoá ${r.deleted} cái${r.refused ? ` (bỏ qua ${r.refused} cái đã giao khách)` : ""}${lines ? ` · ${lines} dòng đơn rời đợt` : ""}.`, batchId);
  }
  go("error", "Chọn thao tác cho các dòng đã tick.", batchId);
}

/** "+ Tạo bill trống" inside a batch: a numbered bill for photos; units get it from the Bill column or the add row. */
export async function createBillAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  if (!batchId) go("error", "Yêu cầu không hợp lệ.");
  const boughtAt = dateOrNull(text(formData, "boughtAt"));
  if (boughtAt === undefined) go("error", "Ngày mua không hợp lệ (VD 2026-09-27).", batchId);
  const rc = createManualReceipt({ sourceKey: text(formData, "sourceKey"), boughtAt: boughtAt ?? new Date().toISOString().slice(0, 10), orderRef: text(formData, "orderRef"), batchId: batchId! });
  revalidatePath("/admin", "layout");
  if (!rc) go("error", "Không tạo được bill.", batchId);
  redirect(`${PAGE}&bills=${batchId}&saved=${encodeURIComponent(`Đã tạo bill ${rc!.code} — đính ảnh chụp ở khối Bill của đợt.`)}#receipt-${rc!.id}`);
}

/**
 * "Lưu thay đổi" of a batch table. Bill lines come as g_<firstUnitId>_* (with g_<id>_ids = their units) and apply to
 * every unit of the line; units come as u_<unitId>_status. Only what differs from the current values is written.
 */
export async function saveBatchRowsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  if (!batchId) go("error", "Yêu cầu không hợp lệ.");
  const batch = getPurchaseBatch(batchId!);
  if (!batch) go("error", "Không tìm thấy đợt.");
  const who = await actor();
  const db = getDb();
  const r = withTransaction(db, () => {
    const res = applyUnitRowEdits(db, readUnitRowFields(formData), batch!.units, { batchId: batchId!, actor: who });
    touchSync(db, { unitIds: res.touched, productIds: batch!.units.map((u) => u.productId), batchIds: [batchId!] });
    return res;
  });
  revalidatePath("/admin", "layout");
  if (r.errors.length) go(r.changed ? "saved" : "error", `${r.changed ? `Đã lưu ${r.changed} thay đổi. ` : ""}Lỗi: ${r.errors.join(" · ")}`, batchId);
  go("saved", r.changed ? `Đã lưu ${r.changed} thay đổi.` : "Không có gì thay đổi.", batchId);
}

/** "Nhập nhanh nhiều bill" inside a batch: one bill per line (see importBillsFromText). */
export async function importBillsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  if (!batchId) go("error", "Yêu cầu không hợp lệ.");
  const r = await importBillsFromText(batchId!, text(formData, "bills"));
  revalidatePath("/admin", "layout");
  redirect(`${PAGE}&bills=${batchId}&${r.created ? "saved" : "error"}=${encodeURIComponent(`Đã tạo ${r.created} bill${r.sources.length ? ` · nguồn mới: ${r.sources.join(", ")}` : ""}${r.skipped.length ? ` · bỏ qua ${r.skipped.length}: ${r.skipped.slice(0, 5).join("; ")}` : ""}.`)}#batch-${batchId}`);
}

/** Đổi mã bill (the shop's own number, e.g. BILL_260927_1454 matching the photo). */
export async function renameBillAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  const id = intOr(formData, "receiptId");
  if (!id) go("error", "Yêu cầu không hợp lệ.", batchId);
  const r = renameReceipt(id!, text(formData, "code"));
  revalidatePath("/admin", "layout");
  redirect(`${PAGE}&bills=${batchId ?? ""}&${r.ok ? "saved" : "error"}=${encodeURIComponent(r.message)}#receipt-${id}`);
}

/** "Cập nhật theo đơn hàng": everything re-derived from the units (cancelled orders give theirs back). */
export async function syncBatchOrdersAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  const r = await reallocateOpenOrders();
  revalidatePath("/admin", "layout");
  go("saved", `Đã cập nhật theo đơn hàng: ${r.orders} đơn đang mở được xếp lại${r.released ? `; ${r.released} cái của đơn đã huỷ trả về tồn` : ""}.`, batchId);
}
