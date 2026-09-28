"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { reallocateOpenOrders, reallocateOrder } from "@/lib/allocations-db";
import { requireAdmin } from "@/lib/auth";

const PAGE = "/admin/inventory/?side=orders";
const go = (key: "saved" | "error", msg: string): never => redirect(`${PAGE}&${key}=${encodeURIComponent(msg)}`);

/** Tồn kho › Hàng theo đơn › "Ghép lại tất cả đơn đang chờ". */
export async function reallocateAllAction(): Promise<void> {
  await requireAdmin("inventory");
  const r = await reallocateOpenOrders();
  revalidatePath("/admin", "layout");
  go("saved", `Đã ghép lại ${r.orders} đơn đang chờ (${r.lines} phần giữ chỗ được xếp lại theo quy tắc vị trí → hạn dùng → bill).`);
}

/** "Ghép lại" one order (its automatic reservations are redone; deducted units and manual picks stay). */
export async function reallocateOneAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = String(formData.get("orderId") ?? "").trim();
  if (!id) go("error", "Thiếu đơn.");
  await reallocateOrder(id);
  revalidatePath("/admin", "layout");
  go("saved", "Đã ghép lại nguồn hàng cho đơn.");
}
