"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ChatState } from "@/components/sites/lienstore/shop/cart/OrderChat";
import { can, getAdminSession } from "@/lib/auth";
import { addOrderMessage, setOrderStage, updateOrderStatus } from "@/lib/db";
import { isShipStage } from "@/lib/shipping";
import type { OrderStatus } from "@/types/shop";

const STATUSES: OrderStatus[] = ["pending", "processing", "completed", "cancelled"];

export async function updateOrderStatusAction(formData: FormData): Promise<void> {
  if (!(await can("orders"))) redirect("/admin/login/");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as OrderStatus;
  if (id && STATUSES.includes(status)) {
    await updateOrderStatus(id, status);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${id}`);
    revalidatePath("/admin");
  }
  redirect(`/admin/orders/${id}/?updated=1`);
}

/** Move the order along the logistics steps (Đã mua tại Nhật → Kho Nhật → … → Đã nhận hàng). */
export async function setStageAction(formData: FormData): Promise<void> {
  if (!(await can("orders")) && !(await can("shipping"))) redirect("/admin/login/");
  const id = String(formData.get("id") ?? "");
  const stage = formData.get("stage");
  if (id && isShipStage(stage)) {
    await setOrderStage(id, stage, String(formData.get("note") ?? "").trim().slice(0, 300));
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${id}`);
    revalidatePath("/admin");
  }
  redirect(`/admin/orders/${id}/?staged=1#tracking`);
}

/** Shop → customer message on an order. */
export async function adminSendMessageAction(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const session = await getAdminSession();
  if (!session || !(session.permissions.includes("orders") || session.permissions.includes("shipping"))) return { error: "Bạn không có quyền trả lời đơn hàng." };
  const orderId = String(formData.get("orderId") ?? "");
  const body = String(formData.get("body") ?? "");
  if (!orderId || !body.trim()) return { error: "Nhập nội dung tin nhắn." };
  try {
    await addOrderMessage({ orderId, sender: "admin", senderName: "LienStore", body });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không gửi được." };
  }
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/my-account");
  revalidatePath(`/checkout/order-received/${orderId}`);
  return null;
}
