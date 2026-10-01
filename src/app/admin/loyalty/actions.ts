"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession, requireAdmin } from "@/lib/auth";
import { adjustPoints, redeemPoints, setLoyaltyRules, setOrderLoyaltyExcluded } from "@/lib/db";

const PAGE = "/admin/loyalty/";
const num = (fd: FormData, k: string) => {
  const d = String(fd.get(k) ?? "").replace(/[^\d]/g, "");
  return d ? Number.parseInt(d, 10) : 0;
};

/** Owner: point value and earn rates per tier. */
export async function saveLoyaltyRulesAction(formData: FormData): Promise<void> {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login/");
  if (s.role !== "owner") redirect(`${PAGE}?error=${encodeURIComponent("Chỉ chủ cửa hàng mới đổi được chính sách điểm.")}`);
  const pointValue = Math.max(1, num(formData, "pointValue"));
  const rules = { pointValue, earnPct: { "": num(formData, "pctNone"), silver: num(formData, "pctSilver"), gold: num(formData, "pctGold"), diamond: num(formData, "pctDiamond") }, minOrder: num(formData, "minOrder") };
  await setLoyaltyRules(rules);
  revalidatePath("/admin", "layout");
  redirect(`${PAGE}?saved=${encodeURIComponent("Đã lưu chính sách điểm thưởng (áp cho đơn giao từ giờ).")}`);
}

/** + / − points by hand on a customer (gift, correction). */
export async function adjustPointsAction(formData: FormData): Promise<void> {
  const s = await requireAdmin("customers");
  const customerId = String(formData.get("customerId") ?? "").trim();
  const back = String(formData.get("back") ?? PAGE);
  const points = Number.parseInt(String(formData.get("points") ?? "").replace(/[^\d-]/g, ""), 10);
  if (!customerId || !Number.isInteger(points) || points === 0) redirect(`${back}?error=${encodeURIComponent("Nhập số điểm (dương để tặng, âm để trừ).")}`);
  await adjustPoints(customerId, points, String(formData.get("note") ?? "").trim(), s.label);
  revalidatePath("/admin", "layout");
  redirect(`${back}?saved=${encodeURIComponent(`Đã ${points > 0 ? "tặng" : "trừ"} ${Math.abs(points)} điểm.`)}`);
}

/** "Dùng điểm" on an order: points → money off (0 = undo). */
export async function redeemPointsAction(formData: FormData): Promise<void> {
  const s = await requireAdmin("orders");
  const orderId = String(formData.get("orderId") ?? "").trim();
  const back = `/admin/orders/${orderId}/`;
  const points = num(formData, "points");
  const r = await redeemPoints(orderId, points, s.label);
  revalidatePath("/admin", "layout");
  revalidatePath(`/checkout/order-received/${orderId}`);
  if (!r.ok) redirect(`${back}?error=${encodeURIComponent(r.message)}`);
  redirect(`${back}?saved=${encodeURIComponent(r.points ? `Đã trừ ${r.points} điểm = ${r.discount.toLocaleString("vi-VN")}đ vào đơn.` : "Đã bỏ dùng điểm trên đơn này.")}`);
}

/** Tick "loại khỏi hậu mãi" on an order. */
export async function setOrderLoyaltyExcludedAction(formData: FormData): Promise<void> {
  await requireAdmin("orders");
  const orderId = String(formData.get("orderId") ?? "").trim();
  const excluded = formData.get("excluded") === "1";
  const ok = await setOrderLoyaltyExcluded(orderId, excluded);
  revalidatePath("/admin", "layout");
  redirect(`/admin/orders/${orderId}/?${ok ? "saved" : "error"}=${encodeURIComponent(ok ? (excluded ? "Đơn đã loại khỏi hậu mãi — không tích điểm, không tính hạng." : "Đơn tính lại vào hậu mãi.") : "Không tìm thấy đơn.")}`);
}
