"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession, requireAdmin } from "@/lib/auth";
import { isPurchaseStatus, PURCHASE_LABEL, type PurchaseStatus } from "@/lib/purchase";
import { packUnits } from "@/lib/shipments-db";
import { getDb, withTransaction } from "@/lib/sqlite";
import { isUnitRemoved, sortUnits, UNIT_REMOVED_LABEL, type UnitRemoved } from "@/lib/units";
import { listUnits, moveUnitsSync, removeUnitsSync, touchSync } from "@/lib/units-db";

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

/**
 * "Xoá" on Kho Nhật / Kho VN: the ticked units leave the stock with a reason (Nhập nhầm / Thất lạc / Hỏng…) and a
 * required note. Nothing is wiped: the unit keeps its history (who, when, why), shows under "Đã xoá / loại" and can be
 * restored on its product page; orders that held it look for other stock (touchSync).
 */
export async function removeTickedUnitsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const url = back(formData, "/admin/inventory/?side=jp");
  const ids = pickedUnits(formData);
  if (!ids.length) go(url, "error", "Chưa tick dòng nào.");
  const note = text(formData, "note").slice(0, 300);
  if (note.length < 3) go(url, "error", "Ghi lý do xoá (ít nhất vài chữ) để admin / chủ shop kiểm tra được.");
  const reasonRaw = text(formData, "reason");
  const reason: UnitRemoved = isUnitRemoved(reasonRaw) ? reasonRaw : "mistake";
  const actor = (await getAdminSession())?.label ?? "";
  const db = getDb();
  const n = withTransaction(db, () => {
    const k = removeUnitsSync(db, ids, reason, { actor, note });
    touchSync(db, { unitIds: ids });
    return k;
  });
  revalidatePath("/admin", "layout");
  go(url, "saved", `Đã xoá ${n} cái khỏi tồn kho (${UNIT_REMOVED_LABEL[reason]}: ${note}). Xem lại / khôi phục ở mục "Đã xoá / loại" cuối trang.`);
}
