"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { addStockLot, deleteStockLot, listStockLots, updateStockLot } from "@/lib/db";
import { listLotViews } from "@/lib/lots-db";
import { ensureLotReceipt, setLotReceipt } from "@/lib/purchase-batches-db";
import { addReceiptFiles } from "@/lib/receipts-db";
import { extForMime, MAX_UPLOAD_BYTES, RECEIPT_MIMES, saveUpload, slugifyFileName, uniqueName } from "@/lib/uploads";
import { getDb } from "@/lib/sqlite";
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

/** "Lưu thay đổi" on the product lots page: every row's inputs arrive as lot_<id>_<field>; only differences are written. */
export async function saveLotsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const productId = Number.parseInt(text(formData, "productId"), 10);
  if (!Number.isInteger(productId)) redirect("/admin/inventory/");
  const lots = await listStockLots(productId, false);
  const views = new Map(listLotViews(getDb(), { productId, includeEmpty: true }).map((v) => [v.id, v]));
  const groups = new Map<number, Record<string, string>>();
  for (const [k, v] of formData.entries()) {
    const m = /^lot_(\d+)_(\w+)$/.exec(k);
    if (!m || typeof v !== "string") continue;
    const id = Number.parseInt(m[1], 10);
    const g = groups.get(id) ?? {};
    g[m[2]] = v.trim();
    groups.set(id, g);
  }
  const errors: string[] = [];
  let changed = 0;
  for (const [id, g] of groups) {
    const cur = lots.find((l) => l.id === id);
    if (!cur) continue;
    const label = `Lô #${id}`;
    const patch: Parameters<typeof updateStockLot>[1] = {};
    if (g.receivedAt !== undefined && g.receivedAt) {
      const v = parseExpiry(g.receivedAt);
      if (!v) errors.push(`${label}: ngày nhập không hợp lệ.`);
      else if (v !== cur.receivedAt) patch.receivedAt = v;
    }
    if (g.qtyLeft !== undefined) {
      const q = intOr(g.qtyLeft, null);
      if (q === null || q < 0) errors.push(`${label}: số còn phải là số ≥ 0.`);
      else if (q !== cur.qtyLeft) patch.qtyLeft = q;
    }
    if (g.sourceKey !== undefined && g.sourceKey && g.sourceKey !== cur.sourceKey) patch.sourceKey = g.sourceKey;
    if (g.unitCostJpy !== undefined) {
      const j = intOr(g.unitCostJpy, null);
      if (j !== cur.unitCostJpy) patch.unitCostJpy = j;
    }
    if (g.expiry !== undefined) {
      const v = g.expiry ? parseExpiry(g.expiry) : null;
      if (g.expiry && !v) errors.push(`${label}: hạn dùng không hợp lệ.`);
      else if (v !== cur.expiry) patch.expiry = v;
    }
    if (g.warehouse !== undefined && isWarehouse(g.warehouse) && g.warehouse !== cur.warehouse) patch.warehouse = g.warehouse;
    if (g.note !== undefined && g.note.slice(0, 200) !== cur.note) patch.note = g.note.slice(0, 200);
    if (Object.keys(patch).length) {
      await updateStockLot(id, patch);
      changed++;
    }
    // bill code typed by hand: blank clears, a new code creates the bill, an existing code links to it
    if (g.billCode !== undefined) {
      const code = g.billCode.trim().slice(0, 60);
      const haveCode = views.get(id)?.receiptCode ?? "";
      if (code !== haveCode) {
        if (!code) setLotReceipt(id, null);
        else ensureLotReceipt(id, { code });
        changed++;
      }
    }
  }
  revalidatePath("/admin", "layout");
  if (errors.length) back(productId, changed ? "saved" : "error", `${changed ? `Đã lưu ${changed} thay đổi. ` : ""}Lỗi: ${errors.join(" · ")}`);
  back(productId, "saved", changed ? `Đã lưu ${changed} thay đổi.` : "Không có gì thay đổi.");
}

/** "Đính ảnh bill" on one lot: the lot gets a bill if it has none (PM-… or the code typed alongside), then the photos attach. */
export async function uploadLotBillFilesAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const productId = Number.parseInt(text(formData, "productId"), 10);
  const lotId = Number.parseInt(text(formData, "lotId"), 10);
  if (!Number.isInteger(productId) || !Number.isInteger(lotId)) redirect("/admin/inventory/");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) back(productId, "error", "Chưa chọn ảnh nào.");
  const receiptId = ensureLotReceipt(lotId, { code: text(formData, "billCode") });
  if (!receiptId) back(productId, "error", "Không tạo được bill cho lô này.");
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
  back(productId, saved.length ? "saved" : "error", `${saved.length ? `Đã đính ${saved.length} ảnh vào bill của lô #${lotId}.` : ""}${error ? ` ${error}` : ""}`.trim());
}
