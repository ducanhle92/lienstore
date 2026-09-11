"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth";
import { createShipmentBatch, getJpyRate, getOrderChargeableWeightG, getOrdersByIds, getShippingMethods, saveOrderLeg, setBatchTracking } from "@/lib/db";
import { IMPORT_LEGS, isShippingLeg, LEG_LABEL, quoteMethod, toQuoteMethod } from "@/lib/shipping";
import type { ShipmentBatch } from "@/types/shop";

const BACK = "/admin/shipping/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (key: "saved" | "error", msg: string, anchor = ""): never => redirect(`${BACK}?${key}=${encodeURIComponent(msg)}${anchor}`);

/**
 * "Gom lô": several orders travel together on one import leg (JP domestic parcel, one Kiến shipment, one Viettel parcel
 * to Thanh Hóa). The method is quoted once for the total billable weight and the lot fee is shared per gram, which is
 * cheaper than quoting each order alone; the saving is recorded on the batch.
 */
export async function createBatchAction(formData: FormData): Promise<void> {
  if (!(await can("shipping"))) redirect("/admin/login/");
  const ids = [...new Set(formData.getAll("batch_orders").map(String).filter(Boolean))];
  const [legRaw, methodRaw] = text(formData, "choice").split(":");
  const methodId = Number.parseInt(methodRaw ?? "", 10);
  if (!isShippingLeg(legRaw) || !(IMPORT_LEGS as string[]).includes(legRaw)) return go("error", "Chọn chặng và phương thức để gom lô.");
  const leg = legRaw as ShipmentBatch["leg"];
  if (ids.length < 1) return go("error", "Tick ít nhất một đơn trong bảng rồi bấm Gom lô.");
  const method = (await getShippingMethods(false)).find((m) => m.id === methodId && m.leg === leg);
  if (!method) return go("error", "Phương thức không hợp lệ cho chặng đã chọn.");
  const orders = await getOrdersByIds(ids);
  if (orders.length !== ids.length) return go("error", "Có đơn không tồn tại.");
  const rate = await getJpyRate();
  const qm = toQuoteMethod(method);
  const weights = await Promise.all(orders.map(async (o) => ({ order: o, weightG: Math.max(1, await getOrderChargeableWeightG(o.id)) })));
  const totalG = weights.reduce((s, w) => s + w.weightG, 0);
  const lot = quoteMethod(qm, leg, totalG, 0, rate);
  if (!lot) return go("error", "Phương thức chưa có cột giá để tính.");
  const individual = weights.reduce((s, w) => s + (quoteMethod(qm, leg, w.weightG, 0, rate)?.fee ?? 0), 0);
  const savings = Math.max(0, individual - lot.fee);
  const tracking = text(formData, "tracking").slice(0, 120);
  const batch = await createShipmentBatch({
    leg,
    methodId: method.id,
    zoneId: lot.zoneId,
    label: lot.label,
    totalWeightG: totalG,
    fee: lot.fee,
    feeRaw: lot.feeRaw,
    currency: lot.currency,
    tracking,
    orderIds: orders.map((o) => o.id),
    savings,
  });
  // share the lot fee per gram; the last order takes the rounding remainder
  let assigned = 0;
  for (let i = 0; i < weights.length; i++) {
    const { order, weightG } = weights[i];
    const share = i === weights.length - 1 ? lot.fee - assigned : Math.round((lot.fee * weightG) / totalG);
    assigned += share;
    await saveOrderLeg({
      orderId: order.id,
      leg,
      methodId: method.id,
      zoneId: lot.zoneId,
      label: `Lô #${batch.id} · ${lot.label}`,
      fee: share,
      tracking,
      note: `Gom ${weights.length} đơn · ${weightG.toLocaleString("vi-VN")} g / ${totalG.toLocaleString("vi-VN")} g · phí lô ${lot.fee.toLocaleString("vi-VN")}đ${/¥/.test(lot.currency) ? ` (${lot.feeRaw.toLocaleString("vi-VN")}¥)` : ""}`,
    });
  }
  revalidatePath("/admin", "layout");
  go("saved", `Đã gom ${weights.length} đơn (${orders.map((o) => `#${o.number}`).join(", ")}) thành lô #${batch.id} — ${LEG_LABEL[leg]} · ${lot.label}: phí lô ${lot.fee.toLocaleString("vi-VN")}đ cho ${totalG.toLocaleString("vi-VN")} g${savings > 0 ? `, tiết kiệm ${savings.toLocaleString("vi-VN")}đ so với gửi lẻ (${individual.toLocaleString("vi-VN")}đ)` : ""}.`, "#batches");
}

/** Tracking number of a batch → copied to the same leg of every order in it. */
export async function setBatchTrackingAction(formData: FormData): Promise<void> {
  if (!(await can("shipping"))) redirect("/admin/login/");
  const id = Number.parseInt(text(formData, "id"), 10);
  const tracking = text(formData, "tracking").slice(0, 120);
  const b = Number.isInteger(id) ? await setBatchTracking(id, tracking) : null;
  if (!b) return go("error", "Không tìm thấy lô.");
  revalidatePath("/admin", "layout");
  go("saved", `Đã lưu mã vận đơn "${tracking || "—"}" cho lô #${b.id} và ${b.orderIds.length} đơn trong lô.`, "#batches");
}
