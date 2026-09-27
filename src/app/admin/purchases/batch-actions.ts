"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { parseExpiry } from "@/lib/lots";
import { isPurchaseStatus } from "@/lib/purchase";
import { isBatchStatus } from "@/lib/purchase-batches";
import { addLinesToBatch, addProductToBatch, allocateSurplusToLine, holdBatchRows, moveStockToBatch, splitBatchStock, updateBatchStock, createPurchaseBatch, deletePurchaseBatch, removeLineFromBatch, removeSurplusFromBatch, setPurchaseBatchStatus, updatePurchaseBatch } from "@/lib/purchase-batches-db";

/** Quản lý mua hàng › tab "Đợt gửi" — every action lands back on the tab (anchored on the batch card). */
const PAGE = "/admin/purchases/?tab=batches";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const intOr = (fd: FormData, k: string) => {
  const n = Number.parseInt(text(fd, k), 10);
  return Number.isInteger(n) ? n : null;
};
const go = (key: "saved" | "error", msg: string, batchId?: number | null): never => redirect(`${PAGE}&${key}=${encodeURIComponent(msg)}${batchId ? `#batch-${batchId}` : ""}`);
/** Free-text date ("2026-09-27", "27/09/2026") → ISO; empty → null; garbage → undefined (invalid). */
const dateOrNull = (raw: string): string | null | undefined => (raw ? (parseExpiry(raw) ?? undefined) : null);

export async function createBatchAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const boughtAt = dateOrNull(text(formData, "boughtAt"));
  if (boughtAt === undefined) go("error", "Ngày mua không hợp lệ (VD 2026-09-27).");
  const b = createPurchaseBatch({ label: text(formData, "label").slice(0, 80), sourceKey: text(formData, "sourceKey"), boughtAt: boughtAt ?? null, note: text(formData, "note").slice(0, 300) });
  revalidatePath("/admin", "layout");
  go("saved", `Đã mở đợt gửi ${b.code}. Thêm dòng đơn chưa mua và hàng mua dư vào đợt, rồi cập nhật trạng thái cả đợt khi hàng đi.`, b.id);
}

export async function updateBatchAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = intOr(formData, "batchId");
  if (!id) go("error", "Yêu cầu không hợp lệ.");
  const boughtAt = dateOrNull(text(formData, "boughtAt"));
  if (boughtAt === undefined) go("error", "Ngày mua không hợp lệ (VD 2026-09-27).", id);
  const ok = updatePurchaseBatch(id!, { label: text(formData, "label").slice(0, 80), sourceKey: text(formData, "sourceKey"), boughtAt: boughtAt ?? null, tracking: text(formData, "tracking").slice(0, 120), note: text(formData, "note").slice(0, 300) });
  revalidatePath("/admin", "layout");
  go(ok ? "saved" : "error", ok ? "Đã lưu thông tin đợt gửi." : "Không tìm thấy đợt gửi.", id);
}

/** Ticked order lines (from the batch card or from the "Theo đơn hàng" tab) → into a batch. */
export async function addLinesToBatchAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = intOr(formData, "batchId");
  const ids = formData.getAll("ids").map((v) => Number.parseInt(String(v), 10)).filter(Number.isInteger);
  const back = text(formData, "back");
  const bounce = (key: "saved" | "error", msg: string): never => (back ? redirect(`${back}${back.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`) : go(key, msg, id));
  if (!id) bounce("error", "Chưa chọn đợt gửi.");
  if (!ids.length) bounce("error", "Chưa tick dòng nào.");
  const r = addLinesToBatch(id!, ids);
  revalidatePath("/admin", "layout");
  if (!r) bounce("error", "Không tìm thấy đợt gửi.");
  bounce("saved", `Đã thêm ${r!.added}/${ids.length} dòng đơn vào đợt ${r!.code}${r!.added < ids.length ? " (dòng đã thuộc đợt khác bị bỏ qua)" : ""}.`);
}

export async function removeLineFromBatchAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  const itemId = intOr(formData, "itemId");
  const ok = itemId ? removeLineFromBatch(itemId) : false;
  revalidatePath("/admin", "layout");
  go(ok ? "saved" : "error", ok ? "Đã bỏ dòng đơn khỏi đợt (trạng thái mua giữ nguyên)." : "Không bỏ được dòng đơn.", batchId);
}

/** A product bought for the batch (one row per expiry): open order lines are covered first, the rest is stock. */
export async function addProductAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  if (!batchId) go("error", "Yêu cầu không hợp lệ.");
  const productId = intOr(formData, "productId");
  const qty = intOr(formData, "qty");
  if (!productId) go("error", "Chưa chọn sản phẩm.", batchId);
  if (!qty || qty <= 0) go("error", "Số lượng mua dư phải lớn hơn 0.", batchId);
  const expiryRaw = text(formData, "expiry");
  const expiry = expiryRaw ? parseExpiry(expiryRaw) : null;
  if (expiryRaw && !expiry) go("error", "Hạn dùng không hợp lệ (VD 2027-03-31, 03/2027).", batchId);
  const boughtAt = dateOrNull(text(formData, "boughtAt"));
  if (boughtAt === undefined) go("error", "Ngày mua không hợp lệ (VD 2026-09-27).", batchId);
  const jpyRaw = text(formData, "unitCostJpy").replace(/[^\d]/g, "");
  const unitCostJpy = jpyRaw ? Number.parseInt(jpyRaw, 10) : null;
  const r = await addProductToBatch(batchId!, { productId: productId!, qty: qty!, expiry, boughtAt: boughtAt ?? null, unitCostJpy, note: text(formData, "note").slice(0, 200), sourceKey: text(formData, "sourceKey") });
  revalidatePath("/admin", "layout");
  if (!r) go("error", "Không tìm thấy đợt gửi.", batchId);
  const parts: string[] = [];
  if (r!.covered) parts.push(`${r!.orderUnits} đv gán tự động cho ${r!.covered} dòng đơn đang chờ`);
  if (r!.stockUnits) parts.push(r!.lotId ? `${r!.stockUnits} đv nhập kho ngay (lô #${r!.lotId})` : `${r!.stockUnits} đv lưu kho (nhập lô khi đợt về kho)`);
  go("saved", `Đã thêm ${qty} đv vào đợt ${r!.code}: ${parts.join(" · ")}.`, batchId);
}

export async function removeSurplusAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  const spId = intOr(formData, "stockPurchaseId");
  const ok = spId ? await removeSurplusFromBatch(spId) : false;
  revalidatePath("/admin", "layout");
  go(ok ? "saved" : "error", ok ? "Đã bỏ dòng mua dư." : "Không bỏ được — hàng đã nhập kho thành lô, sửa lô trong Kho hàng.", batchId);
}

/** A line ordered after the batch was bought → served from the batch's surplus. */
export async function allocateSurplusAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  const itemId = intOr(formData, "itemId");
  if (!batchId || !itemId) go("error", "Yêu cầu không hợp lệ.");
  const r = allocateSurplusToLine(batchId!, itemId!);
  revalidatePath("/admin", "layout");
  const back = text(formData, "back");
  if (back) redirect(`${back}${back.includes("?") ? "&" : "?"}${r.ok ? "saved" : "error"}=${encodeURIComponent(r.message)}`);
  go(r.ok ? "saved" : "error", r.message, batchId);
}

export async function setBatchStatusAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  const status = text(formData, "status");
  if (!batchId) go("error", "Yêu cầu không hợp lệ.");
  if (!isBatchStatus(status)) {
    go("error", "Chưa chọn trạng thái.", batchId);
    return;
  }
  const r = await setPurchaseBatchStatus(batchId!, status);
  revalidatePath("/admin", "layout");
  if (!r.ok) go("error", r.message ?? "Không cập nhật được.", batchId);
  const parts = [`${r.lines} dòng đơn chuyển trạng thái`];
  if (r.lots) parts.push(`${r.lots} lô hàng dư đã nhập kho (HSD + ngày mua đi theo lô, tồn kho tăng)`);
  go("saved", `Đã cập nhật đợt gửi: ${parts.join(" · ")}.`, batchId);
}

export async function deleteBatchAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  const r = batchId ? await deletePurchaseBatch(batchId) : { ok: false, message: "Yêu cầu không hợp lệ." };
  revalidatePath("/admin", "layout");
  if (!r.ok) go("error", r.message ?? "Không xoá được.", batchId);
  go("saved", "Đã xoá đợt gửi — các dòng đơn giữ trạng thái, dòng mua dư bị bỏ.");
}

/** One stock row of a batch (SL, nguồn, HSD, ngày mua, ¥, ghi chú, trạng thái — or just the product from "đổi sản phẩm"). */
export async function updateBatchStockAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  const spId = intOr(formData, "stockPurchaseId");
  if (!batchId || !spId) go("error", "Yêu cầu không hợp lệ.");
  const patch: Parameters<typeof updateBatchStock>[1] = {};
  if (formData.has("productId")) {
    const pid = intOr(formData, "productId");
    if (!pid) go("error", "Chưa chọn sản phẩm mới.", batchId);
    patch.productId = pid!;
  }
  if (formData.has("qty")) {
    const qty = intOr(formData, "qty");
    if (!qty || qty <= 0) go("error", "Số lượng phải lớn hơn 0.", batchId);
    patch.qty = qty!;
  }
  if (formData.has("sourceKey")) patch.sourceKey = text(formData, "sourceKey");
  if (formData.has("expiry")) {
    const raw = text(formData, "expiry");
    const v = raw ? parseExpiry(raw) : null;
    if (raw && !v) go("error", "Hạn dùng không hợp lệ (VD 2027-03-31, 03/2027).", batchId);
    patch.expiry = v;
  }
  if (formData.has("boughtAt")) {
    const v = dateOrNull(text(formData, "boughtAt"));
    if (v === undefined) go("error", "Ngày mua không hợp lệ (VD 2026-09-27).", batchId);
    patch.boughtAt = v ?? null;
  }
  if (formData.has("unitCostJpy")) {
    const raw = text(formData, "unitCostJpy").replace(/[^\d]/g, "");
    patch.unitCostJpy = raw ? Number.parseInt(raw, 10) : null;
  }
  if (formData.has("note")) patch.note = text(formData, "note").slice(0, 200);
  if (formData.has("status")) {
    const st = text(formData, "status");
    if (isPurchaseStatus(st)) patch.status = st;
  }
  const r = await updateBatchStock(spId!, patch);
  revalidatePath("/admin", "layout");
  go(r.ok ? "saved" : "error", r.ok ? "Đã lưu dòng." : (r.message ?? "Không lưu được."), batchId);
}

/** "Tách": part of a stock row stays in Japan for a later batch (hold) or becomes its own row in this batch (split). */
export async function splitBatchStockAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  const spId = intOr(formData, "stockPurchaseId");
  const qty = intOr(formData, "splitQty");
  const mode = text(formData, "mode") === "split" ? "split" : "hold";
  if (!batchId || !spId) go("error", "Yêu cầu không hợp lệ.");
  if (mode === "hold" && !qty) {
    // empty box → the whole row stays in Japan for a later batch
    const r = holdBatchRows(batchId!, [spId!], []);
    revalidatePath("/admin", "layout");
    go(r.stock ? "saved" : "error", r.stock ? "Đã giữ lại Nhật cả dòng (chờ đợt sau)." : "Không giữ được dòng này (đã nhập kho thành lô?).", batchId);
  }
  if (!qty) go("error", "Nhập số đơn vị muốn tách.", batchId);
  const r = splitBatchStock(spId!, qty!, mode);
  revalidatePath("/admin", "layout");
  go(r.ok ? "saved" : "error", r.message, batchId);
}

/** Ticked rows → hold in Japan / leave the batch / move to another batch. */
export async function bulkBatchRowsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  if (!batchId) go("error", "Yêu cầu không hợp lệ.");
  const sids = formData.getAll("sids").map((v) => Number.parseInt(String(v), 10)).filter(Number.isInteger);
  const ids = formData.getAll("ids").map((v) => Number.parseInt(String(v), 10)).filter(Number.isInteger);
  const op = text(formData, "op");
  if (!sids.length && !ids.length) go("error", "Chưa tick dòng nào.", batchId);
  if (op === "move") {
    const target = intOr(formData, "targetBatchId");
    if (!target || target === batchId) go("error", "Chọn đợt khác để chuyển sang.", batchId);
    const hold = ids.length ? holdBatchRows(batchId!, [], ids) : { lines: 0 };
    const linesAdded = ids.length ? addLinesToBatch(target!, ids)?.added ?? 0 : 0;
    const r = await moveStockToBatch(sids, target!);
    revalidatePath("/admin", "layout");
    go("saved", `Đã chuyển ${(r?.moved ?? 0) + linesAdded} dòng sang đợt ${r?.code ?? ""}${hold.lines ? "" : ""}.`, batchId);
  }
  if (op === "remove") {
    let n = 0;
    for (const id of ids) if (removeLineFromBatch(id)) n++;
    for (const id of sids) if (await removeSurplusFromBatch(id)) n++;
    revalidatePath("/admin", "layout");
    go("saved", `Đã bỏ ${n} dòng khỏi đợt (dòng đơn giữ trạng thái, dòng lưu kho bị xoá).`, batchId);
  }
  const r = holdBatchRows(batchId!, sids, ids);
  revalidatePath("/admin", "layout");
  go("saved", `Đã giữ lại tại Nhật ${r.stock} dòng lưu kho (chờ đợt sau)${r.lines ? ` · ${r.lines} dòng đơn rời đợt` : ""}.`, batchId);
}

/** Held rows (or plain stock slips from the "Mua lưu kho" tab) → into a batch. */
export async function moveStockToBatchAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const target = intOr(formData, "batchId");
  const spids = formData.getAll("spids").map((v) => Number.parseInt(String(v), 10)).filter(Number.isInteger);
  const back = text(formData, "back");
  const bounce = (key: "saved" | "error", msg: string): never => (back ? redirect(`${back}${back.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`) : go(key, msg, intOr(formData, "fromBatchId") ?? target));
  if (!target) bounce("error", "Chưa chọn đợt.");
  if (!spids.length) bounce("error", "Chưa tick dòng nào.");
  const r = await moveStockToBatch(spids, target!);
  revalidatePath("/admin", "layout");
  if (!r) bounce("error", "Không tìm thấy đợt.");
  bounce("saved", `Đã đưa ${r!.moved} dòng vào đợt ${r!.code}.`);
}
