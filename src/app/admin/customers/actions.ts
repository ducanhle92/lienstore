"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession, requireAdmin } from "@/lib/auth";
import { isTier } from "@/lib/customer-tiers";
import { setCustomerRegular, setTierRules, upsertCustomerProfile } from "@/lib/db";

const LIST = "/admin/customers/";
const detail = (id: string) => `/admin/customers/${encodeURIComponent(`c:${id}`)}/`;

/** Admin › Khách hàng: tick "Khách quen" — the customer may pay on delivery; stock is deducted when the admin grants it. */
export async function setCustomerRegularAction(formData: FormData): Promise<void> {
  await requireAdmin("customers");
  const id = String(formData.get("customerId") ?? "").trim();
  const regular = formData.get("regular") === "1";
  if (!id) redirect(`${LIST}?error=${encodeURIComponent("Không tìm thấy hồ sơ khách.")}`);
  const ok = await setCustomerRegular(id, regular);
  revalidatePath("/admin", "layout");
  redirect(`${detail(id)}?${ok ? "saved" : "error"}=${encodeURIComponent(ok ? (regular ? "Đã đánh dấu khách quen — đơn của khách được chọn thanh toán khi nhận hàng." : "Đã bỏ đánh dấu khách quen.") : "Không tìm thấy hồ sơ khách.")}`);
}

/** Sửa hồ sơ (detail page) or Thêm khách (list page): name, phone, e-mail, address, note, manual tier. */
export async function saveCustomerProfileAction(formData: FormData): Promise<void> {
  await requireAdmin("customers");
  const v = (k: string) => String(formData.get(k) ?? "").trim();
  const id = v("customerId") || undefined;
  const tierRaw = v("tierManual");
  const r = await upsertCustomerProfile({ id, name: v("name"), phone: v("phone"), email: v("email"), address: v("address"), note: v("note"), tierManual: isTier(tierRaw) ? tierRaw : "" });
  revalidatePath("/admin", "layout");
  if (!r.ok) redirect(`${id ? detail(id) : LIST}?error=${encodeURIComponent(r.message)}`);
  redirect(`${detail(r.id)}?saved=${encodeURIComponent(id ? "Đã lưu hồ sơ khách." : "Đã thêm khách — hồ sơ sẽ tự nhận đơn theo số điện thoại này.")}`);
}

/** Owner: thresholds of Bạc / Vàng / Kim cương; every customer's tier is re-derived right away. */
export async function saveTierRulesAction(formData: FormData): Promise<void> {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login/");
  if (s.role !== "owner") redirect(`${LIST}?error=${encodeURIComponent("Chỉ chủ cửa hàng mới đổi được ngưỡng hạng.")}`);
  const num = (k: string) => {
    const d = String(formData.get(k) ?? "").replace(/[^\d]/g, "");
    return d ? Number.parseInt(d, 10) : 0;
  };
  const rules = { silverOrders: num("silverOrders"), silverSpend: num("silverSpend"), goldSpend: num("goldSpend"), diamondSpend: num("diamondSpend") };
  if (rules.goldSpend <= rules.silverSpend || rules.diamondSpend <= rules.goldSpend) redirect(`${LIST}?error=${encodeURIComponent("Ngưỡng phải tăng dần: Bạc < Vàng < Kim cương.")}`);
  const moved = await setTierRules(rules);
  revalidatePath("/admin", "layout");
  redirect(`${LIST}?saved=${encodeURIComponent(`Đã lưu ngưỡng hạng; ${moved} khách đổi hạng.`)}`);
}
