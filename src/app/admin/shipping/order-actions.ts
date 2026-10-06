"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, getAdminSession } from "@/lib/auth";
import { getOrderById, getOrderChargeableWeightG, getOrderLegs, getShippingMethods, saveOrderLeg, setOrderLegStatus, updateOrderShipping } from "@/lib/db";
import { parseAmount } from "@/lib/format";
import { isLegStatus, LEG_STATUS_LABEL } from "@/lib/leg-status";
import { isShippingLeg, LEG_LABEL, type ShippingLeg, zoneFeeForWeight } from "@/lib/shipping";

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
  // ④ "Khách tới kho lấy": no carrier, no fee — the order becomes a pickup order
  const pickup = leg === "vn_domestic" && choice === "pickup";
  if (pickup) fee = 0;
  // a carrier quote picked from the API list has no static method: keep its label as typed
  let label = pickup ? "Khách tự tới kho lấy" : methodId ? "" : text(formData, "label").slice(0, 120);
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
  const prevVnFee = (await getOrderLegs([orderId])).get(orderId)?.find((l) => l.leg === "vn_domestic")?.fee ?? 0;
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
    await updateOrderShipping(orderId, { fee: fee ?? 0, label: label || order.shippingLabel, delivery: pickup ? "pickup" : methodId ? "ship" : order.delivery, prevVnFee });
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

/**
 * ⑦ Giao hàng VN: the row's / bulk bar's ĐVVC choice ("<methodId>" | "pickup" | "" = keep). Writes the leg's method +
 * label (fee and zone stay as they are); returns the label for the message, null when nothing changed.
 */
async function applyMethodChoice(orderId: string, leg: ShippingLeg, choice: string, tracking?: string): Promise<string | null> {
  if (!choice) return null;
  const cur = (await getOrderLegs([orderId])).get(orderId)?.find((l) => l.leg === leg);
  let methodId: number | null = null;
  let label = "";
  if (choice === "pickup") label = "Khách tự tới kho lấy";
  else {
    const method = (await getShippingMethods(false)).find((x) => String(x.id) === choice && x.leg === leg);
    if (!method) return null;
    methodId = method.id;
    label = `${method.name}${method.carrierName && !method.name.includes(method.carrierName) ? ` (${method.carrierName})` : ""}`;
  }
  if (cur && cur.methodId === methodId && cur.label === label && (tracking === undefined || tracking === cur.tracking)) return null;
  await saveOrderLeg({ orderId, leg, methodId, zoneId: methodId && cur?.methodId === methodId ? (cur.zoneId ?? null) : null, label, fee: cur?.fee ?? 0, tracking: tracking ?? cur?.tracking ?? "", note: cur?.note ?? "" });
  return label;
}

/** Quick status change of one leg (Vận chuyển › sheet của từng chặng): status + optional tracking / note. */
export async function setOrderLegStatusAction(formData: FormData): Promise<void> {
  if (!(await can("shipping")) && !(await can("orders"))) redirect("/admin/login/");
  const orderId = text(formData, "orderId");
  const legRaw = formData.get("leg");
  // a button may name the new status ("to"); otherwise the row's status field (e.g. "Lưu thay đổi" of a tracking edit)
  const statusRaw = text(formData, "to") || text(formData, "status");
  const back = text(formData, "back") || "/admin/shipping/";
  if (!orderId || !isShippingLeg(legRaw) || !isLegStatus(statusRaw)) redirect(back);
  const order = await getOrderById(orderId);
  if (!order) redirect(back);
  const who = (await getAdminSession())?.label ?? "";
  const trackingRaw = formData.get("tracking");
  const tracking = trackingRaw === null ? undefined : String(trackingRaw).trim();
  const carrier = await applyMethodChoice(orderId, legRaw, text(formData, "method"), tracking);
  await setOrderLegStatus(orderId, legRaw, statusRaw, { tracking, note: text(formData, "note"), actor: who });
  revalidatePath("/admin", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}saved=${encodeURIComponent(`Đơn #${order.number} · ${LEG_LABEL[legRaw]}: ${LEG_STATUS_LABEL[statusRaw]}${carrier ? ` · ${carrier}` : ""}${tracking ? ` · mã ${tracking}` : ""}.`)}#order-${orderId}`);
}

/** Sheet của một chặng › ticked orders: one leg status (+ note) for all of them; tracking numbers stay as they are. */
export async function bulkOrderLegStatusAction(formData: FormData): Promise<void> {
  if (!(await can("shipping")) && !(await can("orders"))) redirect("/admin/login/");
  const legRaw = formData.get("leg");
  const statusRaw = text(formData, "status");
  const back = text(formData, "back") || "/admin/shipping/";
  const sep = back.includes("?") ? "&" : "?";
  const ids = formData.getAll("orderIds").map((v) => String(v).trim()).filter(Boolean);
  if (!isShippingLeg(legRaw) || !isLegStatus(statusRaw)) redirect(back);
  if (!ids.length) redirect(`${back}${sep}error=${encodeURIComponent("Chưa tick đơn nào.")}`);
  const who = (await getAdminSession())?.label ?? "";
  const note = text(formData, "note");
  const choice = text(formData, "method");
  let n = 0;
  for (const id of ids) {
    if (!(await getOrderById(id))) continue;
    await applyMethodChoice(id, legRaw, choice);
    await setOrderLegStatus(id, legRaw, statusRaw, { note, actor: who });
    n++;
  }
  revalidatePath("/admin", "layout");
  redirect(`${back}${sep}saved=${encodeURIComponent(`${n} đơn · ${LEG_LABEL[legRaw]}: ${LEG_STATUS_LABEL[statusRaw]}.`)}`);
}
