"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession, requireAdmin } from "@/lib/auth";
import { isPurchaseStatus, PURCHASE_LABEL, type PurchaseStatus } from "@/lib/purchase";
import { packUnits } from "@/lib/shipments-db";
import { getDb, withTransaction } from "@/lib/sqlite";
import { sortUnits } from "@/lib/units";
import { listUnits, moveUnitsSync, touchSync } from "@/lib/units-db";

/** Tồn kho › tại kho shop: ticked rows (unit ids, optionally only qty_<first id> of them) move on or go into a run. */
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (fd: FormData, fallback: string) => text(fd, "back") || fallback;
const go = (url: string, key: "saved" | "error", msg: string): never => redirect(`${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);

/** Each ticked checkbox carries its row's unit ids "12,13,14"; qty_<12> takes only that many (nearest expiry first). */
function pickedUnits(formData: FormData): number[] {
  const out: number[] = [];
  for (const v of formData.getAll("uids")) {
    const ids = String(v).split(/[,.\s]+/).map((x) => Number.parseInt(x, 10)).filter(Number.isInteger);
    if (!ids.length) continue;
    const q = Number.parseInt(text(formData, `qty_${ids[0]}`), 10);
    if (Number.isInteger(q) && q >= 0 && q < ids.length) {
      const sorted = sortUnits(listUnits(getDb(), { ids })).map((u) => u.id);
      out.push(...sorted.slice(0, q));
    } else out.push(...ids);
  }
  return out;
}

/** "Chuyển": the picked units move to the chosen status; orders / batches / Tồn kho follow. */
export async function moveUnitsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const url = back(formData, "/admin/inventory/?side=jp");
  const ids = pickedUnits(formData);
  if (!ids.length) go(url, "error", "Chưa tick dòng nào.");
  const status = text(formData, "status");
  if (!isPurchaseStatus(status)) go(url, "error", "Chưa chọn trạng thái.");
  const actor = (await getAdminSession())?.label ?? "";
  const db = getDb();
  const n = withTransaction(db, () => {
    const k = moveUnitsSync(db, ids, status as PurchaseStatus, { actor, note: "Tồn kho" });
    touchSync(db, { unitIds: ids });
    return k;
  });
  revalidatePath("/admin", "layout");
  go(url, "saved", `Đã chuyển ${n} cái → ${PURCHASE_LABEL[status as PurchaseStatus]}.`);
}

/** "Đóng vào chuyến": the picked units go into a packing run — off the shelf, waiting for the carrier. */
export async function packUnitsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const url = back(formData, "/admin/inventory/?side=jp");
  const ids = pickedUnits(formData);
  if (!ids.length) go(url, "error", "Chưa tick dòng nào.");
  const shipmentId = Number.parseInt(text(formData, "shipmentId"), 10);
  if (!Number.isInteger(shipmentId)) go(url, "error", "Chưa chọn chuyến đóng hàng.");
  const r = packUnits(shipmentId, ids, (await getAdminSession())?.label ?? "");
  revalidatePath("/admin", "layout");
  go(url, r.ok ? "saved" : "error", r.message);
}
