"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { mergeLotBack, splitLot } from "@/lib/db";
import { addLotsToBatch, createPurchaseBatch, removeLotsFromBatch } from "@/lib/purchase-batches-db";

/** Kho hàng › Kho Nhật › Tại kho shop: ticked lots (optionally a part of each) go into a shipment; or leave one. */
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const ids = (fd: FormData, k: string) => fd.getAll(k).map((v) => Number.parseInt(String(v), 10)).filter(Number.isInteger);
const back = (fd: FormData, fallback: string) => text(fd, "back") || fallback;
const go = (url: string, key: "saved" | "error", msg: string): never => redirect(`${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);

/** "Đưa vào chuyến": lotIds[] + qty_<id> (blank = whole lot) + batchId ("new" opens a gathering batch first). */
export async function sendLotsToBatchAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const url = back(formData, "/admin/inventory/?side=jp");
  const lotIds = ids(formData, "lotIds");
  if (!lotIds.length) go(url, "error", "Chưa tick lô nào.");
  let batchId = Number.parseInt(text(formData, "batchId"), 10);
  if (text(formData, "batchId") === "new" || !Number.isInteger(batchId)) {
    const b = createPurchaseBatch({ label: text(formData, "newLabel").slice(0, 80), sourceKey: "", boughtAt: null, note: "" });
    batchId = b.id;
  }
  const items = lotIds.map((lotId) => {
    const q = Number.parseInt(text(formData, `qty_${lotId}`), 10);
    return { lotId, qty: Number.isInteger(q) && q >= 0 ? q : null };
  });
  const r = addLotsToBatch(batchId, items);
  revalidatePath("/admin", "layout");
  go(url, r.ok ? "saved" : "error", r.message);
}

/** "Giữ lại": ticked lots leave their gathering batch and stay at Kho Nhật (shop). */
export async function holdLotsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const url = back(formData, "/admin/inventory/?side=jp");
  const lotIds = ids(formData, "lotIds");
  if (!lotIds.length) go(url, "error", "Chưa tick lô nào.");
  const r = removeLotsFromBatch(lotIds);
  revalidatePath("/admin", "layout");
  go(url, r.ok ? "saved" : "error", r.message);
}

/** "Gộp lại": a split-off lot goes back into its parent (same place / shipment). */
export async function mergeLotAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const url = back(formData, "/admin/inventory/?side=jp");
  const lotId = Number.parseInt(text(formData, "lotId"), 10);
  if (!Number.isInteger(lotId)) go(url, "error", "Thiếu lô.");
  const r = await mergeLotBack(lotId);
  revalidatePath("/admin", "layout");
  go(url, r.ok ? "saved" : "error", r.message);
}

/** Split part of a lot into its own lot (same place; child keeps a reference to the parent for stocktakes). */
export async function splitLotAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const url = back(formData, "/admin/inventory/?side=jp");
  const lotId = Number.parseInt(text(formData, "lotId"), 10);
  const qty = Number.parseInt(text(formData, "qty"), 10);
  if (!Number.isInteger(lotId) || !Number.isInteger(qty)) go(url, "error", "Nhập số đơn vị muốn tách.");
  const r = await splitLot(lotId, qty, { moveReservations: false });
  revalidatePath("/admin", "layout");
  go(url, r.ok ? "saved" : "error", r.message);
}
