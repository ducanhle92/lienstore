"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { mergeLotBack, moveLotsToStatus, splitLot } from "@/lib/db";
import { isPurchaseStatus } from "@/lib/purchase";
import { packLots } from "@/lib/shipments-db";

/** Kho hàng › Kho Nhật › Tại kho shop: ticked lots (optionally a part of each) move on to the next place. */
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const ids = (fd: FormData, k: string) => fd.getAll(k).map((v) => Number.parseInt(String(v), 10)).filter(Number.isInteger);
const back = (fd: FormData, fallback: string) => text(fd, "back") || fallback;
const go = (url: string, key: "saved" | "error", msg: string): never => redirect(`${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);

/** "Chuyển": lotIds[] + qty_<id> (blank = whole lot; 0 = only the paid units) + status (place). */
export async function moveLotsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const url = back(formData, "/admin/inventory/?side=jp");
  const lotIds = ids(formData, "lotIds");
  if (!lotIds.length) go(url, "error", "Chưa tick lô nào.");
  const status = text(formData, "status");
  if (!isPurchaseStatus(status)) go(url, "error", "Chưa chọn trạng thái.");
  const items = lotIds.map((lotId) => {
    const q = Number.parseInt(text(formData, `qty_${lotId}`), 10);
    return { lotId, qty: Number.isInteger(q) && q >= 0 ? q : null };
  });
  const r = await moveLotsToStatus(items, status as never);
  revalidatePath("/admin", "layout");
  go(url, r.ok ? "saved" : "error", r.message);
}

/** "Đóng vào chuyến": ticked lots (or a part of each) go into a packing run — off the shelf, waiting for the carrier. */
export async function packLotsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const url = back(formData, "/admin/inventory/?side=jp");
  const lotIds = ids(formData, "lotIds");
  if (!lotIds.length) go(url, "error", "Chưa tick lô nào.");
  const shipmentId = Number.parseInt(text(formData, "shipmentId"), 10);
  if (!Number.isInteger(shipmentId)) go(url, "error", "Chưa chọn chuyến đóng hàng.");
  const items = lotIds.map((lotId) => {
    const q = Number.parseInt(text(formData, `qty_${lotId}`), 10);
    return { lotId, qty: Number.isInteger(q) && q >= 0 ? q : null };
  });
  const r = packLots(shipmentId, items);
  revalidatePath("/admin", "layout");
  go(url, r.ok ? "saved" : "error", r.message);
}

/** "Gộp lại": a split-off lot goes back into its parent (same place / batch). */
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
