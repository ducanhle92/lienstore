"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { parseExpiry } from "@/lib/lots";
import { isPurchaseStatus, type PurchaseStatus } from "@/lib/purchase";
import { isBatchStatus } from "@/lib/purchase-batches";
import { moveLotsToStatus, setOrderItemSource, setOrderItemsPurchase, setStockPurchaseStatus, updateOrderItemPurchaseFacts, updateStockLot } from "@/lib/db";
import { createManualReceipt } from "@/lib/receipts-db";
import { locationForStatus } from "@/lib/warehouses";
import { getDb } from "@/lib/sqlite";
import { statusForLocation } from "@/lib/warehouses";
import { addLinesToBatch, addLotsToBatch, addProductToBatch, allocateSurplusToLine, assignReceiptToRows, getPurchaseBatch, holdBatchRows, moveStockToBatch, removeLotsFromBatch, splitBatchStock, updateBatchStock, createPurchaseBatch, deletePurchaseBatch, removeLineFromBatch, removeSurplusFromBatch, setPurchaseBatchStatus, updatePurchaseBatch } from "@/lib/purchase-batches-db";

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
  // which bill paid for it: an existing one of the batch, a new empty one (same source / date), or none
  const billRaw = text(formData, "billId");
  let receiptId: number | null = null;
  if (billRaw === "new") {
    const rc = createManualReceipt({ sourceKey: text(formData, "sourceKey"), boughtAt: boughtAt ?? new Date().toISOString().slice(0, 10), batchId: batchId! });
    receiptId = rc?.id ?? null;
  } else if (/^\d+$/.test(billRaw)) receiptId = Number.parseInt(billRaw, 10);
  const r = await addProductToBatch(batchId!, { productId: productId!, qty: qty!, expiry, boughtAt: boughtAt ?? null, unitCostJpy, note: text(formData, "note").slice(0, 200), sourceKey: text(formData, "sourceKey"), receiptId });
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
/** ✓ on a lot row of a batch: unsold qty, source, HSD, bought date, ¥, note, and the status (= place) of the lot. */
export async function updateBatchLotAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  const lotId = intOr(formData, "lotId");
  if (!batchId || !lotId) go("error", "Yêu cầu không hợp lệ.");
  const patch: Parameters<typeof updateStockLot>[1] = {};
  if (formData.has("qtyLeft")) {
    const q = intOr(formData, "qtyLeft");
    if (q === null || q < 0) go("error", "Số lượng không hợp lệ.", batchId);
    patch.qtyLeft = q!;
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
  if (formData.has("note")) patch.note = text(formData, "note").slice(0, 300);
  const ok = await updateStockLot(lotId!, patch);
  if (!ok) go("error", "Không tìm thấy lô.", batchId);
  const status = text(formData, "status");
  if (status && isPurchaseStatus(status)) {
    const cur = getDb().prepare("SELECT warehouse, in_transit FROM stock_lots WHERE id = ?").get(lotId!) as { warehouse: string; in_transit: number } | undefined;
    if (cur && statusForLocation(cur.warehouse as never, !!cur.in_transit) !== status) {
      const r = await moveLotsToStatus([{ lotId: lotId! }], status);
      if (!r.ok) go("error", r.message, batchId);
    }
  }
  revalidatePath("/admin", "layout");
  go("saved", `Đã lưu lô #${lotId}.`, batchId);
}

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
  const lotIds = formData.getAll("lotIds").map((v) => Number.parseInt(String(v), 10)).filter(Number.isInteger);
  const op = text(formData, "op");
  if (!sids.length && !ids.length && !lotIds.length) go("error", "Chưa tick dòng nào.", batchId);
  if (op === "move") {
    const target = intOr(formData, "targetBatchId");
    if (!target || target === batchId) go("error", "Chọn đợt khác để chuyển sang.", batchId);
    const hold = ids.length ? holdBatchRows(batchId!, [], ids) : { lines: 0 };
    const linesAdded = ids.length ? addLinesToBatch(target!, ids)?.added ?? 0 : 0;
    const r = await moveStockToBatch(sids, target!);
    let lotsMoved = 0;
    if (lotIds.length) {
      const rm = removeLotsFromBatch(lotIds);
      if (rm.removed) lotsMoved = addLotsToBatch(target!, lotIds.map((lotId) => ({ lotId }))).added;
    }
    revalidatePath("/admin", "layout");
    go("saved", `Đã chuyển ${(r?.moved ?? 0) + linesAdded + lotsMoved} dòng sang chuyến ${r?.code ?? ""}${hold.lines ? "" : ""}.`, batchId);
  }
  if (op === "remove") {
    let n = 0;
    for (const id of ids) if (removeLineFromBatch(id)) n++;
    for (const id of sids) if (await removeSurplusFromBatch(id)) n++;
    revalidatePath("/admin", "layout");
    go("saved", `Đã bỏ ${n} dòng khỏi đợt (dòng đơn giữ trạng thái, dòng lưu kho bị xoá).`, batchId);
  }
  if (op === "bill") {
    const billId = intOr(formData, "billId");
    if (!billId) go("error", "Chọn bill để gắn.", batchId);
    const n = assignReceiptToRows(billId!, { ids, sids, lotIds });
    revalidatePath("/admin", "layout");
    go("saved", `Đã gắn ${n} dòng vào bill.`, batchId);
  }
  if (op === "status") {
    // one status for every ticked row: order lines, slips (become lots at "Tại kho Nhật"), lots (move place)
    const statusRaw = text(formData, "bulkStatus");
    if (!isPurchaseStatus(statusRaw)) go("error", "Chọn trạng thái cho các dòng đã tick.", batchId);
    const status = statusRaw as PurchaseStatus;
    let n = await setOrderItemsPurchase(ids, status);
    for (const id of sids) if ((await setStockPurchaseStatus(id, status)).ok) n++;
    let note = "";
    if (lotIds.length) {
      if (locationForStatus(status)) {
        const r = await moveLotsToStatus(lotIds.map((lotId) => ({ lotId })), status);
        n += r.moved;
        if (!r.ok) note = ` ${r.message}`;
      } else note = ` Lô đã mua không lùi về "${status === "ordered" ? "Đã đặt mua" : "Chưa mua"}" được — bỏ qua ${lotIds.length} lô.`;
    }
    revalidatePath("/admin", "layout");
    go("saved", `Đã cập nhật ${n} dòng.${note}`, batchId);
  }
  go("error", "Chọn thao tác cho các dòng đã tick.", batchId);
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

/** "+ Tạo bill trống" inside a batch: a numbered bill for photos; rows get attached with "Gắn bill" or when adding products. */
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
 * "Lưu thay đổi" of a batch table: every row's inputs come in one form as l_<itemId>_*, s_<slipId>_*, lot_<lotId>_*.
 * Only what differs from the current values is written, so an untouched row costs nothing (and moves no lot).
 */
export async function saveBatchRowsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const batchId = intOr(formData, "batchId");
  if (!batchId) go("error", "Yêu cầu không hợp lệ.");
  const batch = getPurchaseBatch(batchId!);
  if (!batch) go("error", "Không tìm thấy đợt.");
  const groups = new Map<string, Record<string, string>>();
  for (const [k, v] of formData.entries()) {
    const m = /^(l|s|lot)_(\d+)_(\w+)$/.exec(k);
    if (!m || typeof v !== "string") continue;
    const key = `${m[1]}_${m[2]}`;
    const g = groups.get(key) ?? {};
    g[m[3]] = v.trim();
    groups.set(key, g);
  }
  const errors: string[] = [];
  let changed = 0;
  const jpyOf = (raw: string | undefined) => (raw === undefined ? undefined : raw.replace(/[^\d]/g, "") ? Number.parseInt(raw.replace(/[^\d]/g, ""), 10) : null);
  const expiryOf = (raw: string | undefined, label: string): string | null | undefined => {
    if (raw === undefined) return undefined;
    if (!raw) return null;
    const v = parseExpiry(raw);
    if (!v) errors.push(`${label}: hạn dùng không hợp lệ.`);
    return v ?? undefined;
  };
  const dateOf = (raw: string | undefined, label: string): string | null | undefined => {
    if (raw === undefined) return undefined;
    const v = dateOrNull(raw);
    if (v === undefined) errors.push(`${label}: ngày mua không hợp lệ.`);
    return v;
  };
  for (const [key, g] of groups) {
    const [kind, idRaw] = key.split("_");
    const id = Number.parseInt(idRaw, 10);
    if (kind === "l") {
      const cur = batch!.lines.find((l) => l.itemId === id);
      if (!cur) continue;
      const label = `Đơn #${cur.orderNumber}`;
      const status = g.status && isPurchaseStatus(g.status) ? (g.status as PurchaseStatus) : cur.purchaseStatus;
      const note = g.note ?? "";
      if (status !== cur.purchaseStatus || note) {
        await setOrderItemsPurchase([id], status, note || undefined);
        changed++;
      }
      if (g.sourceKey !== undefined && g.sourceKey !== cur.sourceKey) {
        await setOrderItemSource(id, g.sourceKey);
        changed++;
      }
      const expiry = expiryOf(g.expiry, label);
      const boughtAt = dateOf(g.boughtAt, label);
      const costJpy = jpyOf(g.costJpy);
      if ((expiry !== undefined && expiry !== cur.expiry) || (boughtAt !== undefined && boughtAt !== cur.boughtAt) || (costJpy !== undefined && costJpy !== cur.costJpy)) {
        await updateOrderItemPurchaseFacts(id, { expiry, boughtAt, costJpy });
        changed++;
      }
    } else if (kind === "s") {
      const cur = batch!.stock.find((x) => x.id === id);
      if (!cur) continue;
      const label = `Phiếu #${id}`;
      const patch: Parameters<typeof updateBatchStock>[1] = {};
      const qty = g.qty !== undefined ? Number.parseInt(g.qty, 10) : undefined;
      if (qty !== undefined && Number.isInteger(qty) && qty > 0 && qty !== cur.qty) patch.qty = qty;
      if (g.sourceKey !== undefined && g.sourceKey && g.sourceKey !== cur.sourceKey) patch.sourceKey = g.sourceKey;
      const expiry = expiryOf(g.expiry, label);
      if (expiry !== undefined && expiry !== cur.expiry) patch.expiry = expiry;
      const boughtAt = dateOf(g.boughtAt, label);
      if (boughtAt !== undefined && boughtAt !== cur.boughtAt) patch.boughtAt = boughtAt;
      const jpy = jpyOf(g.unitCostJpy);
      if (jpy !== undefined && jpy !== cur.unitCostJpy) patch.unitCostJpy = jpy;
      const curNote = cur.note.startsWith(`Đợt ${batch!.code}`) ? cur.note.slice(`Đợt ${batch!.code}`.length).replace(/^ · /, "") : cur.note;
      if (g.note !== undefined && g.note !== curNote) patch.note = g.note.slice(0, 300);
      if (g.status && isPurchaseStatus(g.status) && g.status !== cur.status) patch.status = g.status as PurchaseStatus;
      if (Object.keys(patch).length) {
        const r = await updateBatchStock(id, patch);
        if (!r.ok) errors.push(`${label}: ${r.message}`);
        else changed++;
      }
    } else if (kind === "lot") {
      const cur = batch!.lots.find((x) => x.id === id);
      if (!cur) continue;
      const label = `Lô #${id}`;
      const patch: Parameters<typeof updateStockLot>[1] = {};
      const qty = g.qtyLeft !== undefined ? Number.parseInt(g.qtyLeft, 10) : undefined;
      if (qty !== undefined && Number.isInteger(qty) && qty >= 0 && qty !== cur.qtyLeft) patch.qtyLeft = qty;
      if (g.sourceKey !== undefined && g.sourceKey && g.sourceKey !== cur.sourceKey) patch.sourceKey = g.sourceKey;
      const expiry = expiryOf(g.expiry, label);
      if (expiry !== undefined && expiry !== cur.expiry) patch.expiry = expiry;
      const boughtAt = dateOf(g.boughtAt, label);
      if (boughtAt !== undefined && boughtAt !== cur.boughtAt) patch.boughtAt = boughtAt;
      const jpy = jpyOf(g.unitCostJpy);
      if (jpy !== undefined && jpy !== cur.unitCostJpy) patch.unitCostJpy = jpy;
      const curNote = cur.note.startsWith(`Đợt ${batch!.code}`) ? cur.note.slice(`Đợt ${batch!.code}`.length).replace(/^ · /, "") : cur.note;
      if (g.note !== undefined && g.note !== curNote) patch.note = g.note ? `Đợt ${batch!.code} · ${g.note.slice(0, 300)}` : `Đợt ${batch!.code}`;
      if (Object.keys(patch).length) {
        const ok = await updateStockLot(id, patch);
        if (!ok) errors.push(`${label}: không lưu được.`);
        else changed++;
      }
      const curStatus = statusForLocation(cur.warehouse, cur.inTransit);
      if (g.status && isPurchaseStatus(g.status) && g.status !== curStatus) {
        const r = await moveLotsToStatus([{ lotId: id }], g.status as PurchaseStatus);
        if (!r.ok) errors.push(`${label}: ${r.message}`);
        else changed++;
      }
    }
  }
  revalidatePath("/admin", "layout");
  if (errors.length) go(changed ? "saved" : "error", `${changed ? `Đã lưu ${changed} thay đổi. ` : ""}Lỗi: ${errors.join(" · ")}`, batchId);
  go("saved", changed ? `Đã lưu ${changed} thay đổi.` : "Không có gì thay đổi.", batchId);
}
