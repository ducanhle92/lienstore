"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, getAdminSession } from "@/lib/auth";
import { getOrderById, getOrderChargeableWeightG, getOrderLegs, getShippingMethods, saveOrderLeg, setOrderLegStatus, updateOrderShipping } from "@/lib/db";
import { parseAmount } from "@/lib/format";
import { isLegStatus, LEG_STATUS_LABEL } from "@/lib/leg-status";
import { isShippingLeg, LEG_LABEL, zoneFeeForWeight } from "@/lib/shipping";

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * Save one leg (JP domestic / JP→VN / VN domestic) of an order: chosen method + zone, fee (auto from the zone × billable kg
 * when left blank), tracking number, note. For the VN-domestic leg the fee can be applied to what the customer pays.
 */
export async function saveOrderLegAction(formData: FormData): Promise<void> {
  if (!(await can("shipping")) && !(await can("orders"))) redirect("/admin/login/");
  const orderId = text(formData, "orderId");
  const legRaw = formData.get("leg");
  const back = text(formData, "back") || "/admin/shipping/";
  if (!orderId || !isShippingLeg(legRaw)) redirect(back);
  const leg = legRaw;
  const order = await getOrderById(orderId);
  if (!order) redirect(back);

  // "m:<methodId>:<zoneId|->" from the select
  const choice = text(formData, "choice");
  let methodId: number | null = null;
  let zoneId: number | null = null;
  const m = choice.match(/^m:(\d+):(\d+|-)$/);
  if (m) {
    methodId = Number.parseInt(m[1], 10);
    zoneId = m[2] === "-" ? null : Number.parseInt(m[2], 10);
  }
  const feeRaw = text(formData, "fee");
  let fee = feeRaw ? Math.max(0, parseAmount(feeRaw)) : null;
  let label = "";
  if (methodId) {
    const method = (await getShippingMethods(false)).find((x) => x.id === methodId && x.leg === leg);
    if (method) {
      const zone = zoneId ? method.zones.find((z) => z.id === zoneId) : undefined;
      label = `${method.name}${zone ? ` · ${zone.name}` : ""}${method.carrierName ? ` (${method.carrierName})` : ""}`;
      if (fee === null && zone) {
        const base = zoneFeeForWeight(zone, await getOrderChargeableWeightG(orderId));
        fee = zone.freeOver !== null && order.subtotal >= zone.freeOver ? 0 : base;
      }
    }
  }
  await saveOrderLeg({
    orderId,
    leg,
    methodId,
    zoneId,
    label,
    fee: fee ?? 0,
    tracking: text(formData, "tracking"),
    note: text(formData, "note"),
  });
  if (leg === "vn_domestic" && formData.get("applyToCustomer") === "on") {
    await updateOrderShipping(orderId, { fee: fee ?? 0, label: label || order.shippingLabel, delivery: methodId ? "ship" : order.delivery });
  }
  // shipment status of the leg (chưa gửi / đã gửi / đã đến) — logged, and the order's lines + stage follow
  const statusRaw = text(formData, "status");
  const before = (await getOrderLegs([orderId])).get(orderId)?.find((l) => l.leg === leg)?.status ?? "pending";
  if (isLegStatus(statusRaw) && statusRaw !== before) {
    const who = (await getAdminSession())?.label ?? "";
    await setOrderLegStatus(orderId, leg, statusRaw, { tracking: text(formData, "tracking"), note: text(formData, "note"), actor: who });
  }
  revalidatePath("/admin", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}saved=${encodeURIComponent(`Đã lưu vận chuyển đơn #${order.number}.`)}#order-${orderId}`);
}

/** Quick status change of one leg (Vận chuyển › sheet của từng chặng): status + optional tracking / note. */
export async function setOrderLegStatusAction(formData: FormData): Promise<void> {
  if (!(await can("shipping")) && !(await can("orders"))) redirect("/admin/login/");
  const orderId = text(formData, "orderId");
  const legRaw = formData.get("leg");
  const statusRaw = text(formData, "status");
  const back = text(formData, "back") || "/admin/shipping/";
  if (!orderId || !isShippingLeg(legRaw) || !isLegStatus(statusRaw)) redirect(back);
  const order = await getOrderById(orderId);
  if (!order) redirect(back);
  const who = (await getAdminSession())?.label ?? "";
  const trackingRaw = formData.get("tracking");
  await setOrderLegStatus(orderId, legRaw, statusRaw, { tracking: trackingRaw === null ? undefined : String(trackingRaw).trim(), note: text(formData, "note"), actor: who });
  revalidatePath("/admin", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}saved=${encodeURIComponent(`Đơn #${order.number} · ${LEG_LABEL[legRaw]}: ${LEG_STATUS_LABEL[statusRaw]}.`)}#order-${orderId}`);
}
