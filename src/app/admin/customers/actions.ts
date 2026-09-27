"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { setCustomerRegular } from "@/lib/db";

/** Admin › Khách hàng: tick "Khách quen" — the customer may pay on delivery; stock is deducted when the admin grants it. */
export async function setCustomerRegularAction(formData: FormData): Promise<void> {
  await requireAdmin("customers");
  const id = String(formData.get("customerId") ?? "").trim();
  const key = String(formData.get("key") ?? "").trim();
  const regular = formData.get("regular") === "1";
  if (!id) redirect(`/admin/customers/${encodeURIComponent(key)}/?error=${encodeURIComponent("Khách vãng lai (chưa có tài khoản) không đánh dấu được.")}`);
  const ok = await setCustomerRegular(id, regular);
  revalidatePath("/admin", "layout");
  redirect(`/admin/customers/${encodeURIComponent(key)}/?${ok ? "saved" : "error"}=${encodeURIComponent(ok ? (regular ? "Đã đánh dấu khách quen — đơn của khách được chọn thanh toán khi nhận hàng." : "Đã bỏ đánh dấu khách quen.") : "Không tìm thấy khách hàng.")}`);
}
