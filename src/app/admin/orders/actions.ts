"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth";
import { updateOrderStatus } from "@/lib/db";
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
