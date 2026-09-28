"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth";
import { deleteOrderFile, getOrderById, updateOrderAdminNote } from "@/lib/db";
import { parseJpy, saveOrderReceipts } from "@/lib/order-receipts";
import { deleteUpload } from "@/lib/uploads";

/** Attach one or more receipt files (image/PDF) to an order. */
export async function uploadOrderFilesAction(formData: FormData): Promise<void> {
  if (!(await can("orders"))) redirect("/admin/login/");
  const orderId = String(formData.get("orderId") ?? "");
  const order = await getOrderById(orderId);
  if (!order) redirect("/admin/orders/");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const { saved, error } = await saveOrderReceipts(order.id, files, { note: String(formData.get("note") ?? ""), amountJpy: parseJpy(String(formData.get("amountJpy") ?? "")) });
  revalidatePath(`/admin/orders/${order.id}`);
  const q = new URLSearchParams();
  if (saved) q.set("files", String(saved));
  if (error) q.set("fileError", error);
  redirect(`/admin/orders/${order.id}/?${q.toString()}`);
}

export async function deleteOrderFileAction(formData: FormData): Promise<void> {
  if (!(await can("orders"))) redirect("/admin/login/");
  const id = Number.parseInt(String(formData.get("fileId") ?? ""), 10);
  const orderId = String(formData.get("orderId") ?? "");
  if (Number.isInteger(id)) {
    const removed = await deleteOrderFile(id);
    if (removed) await deleteUpload(removed.path);
  }
  revalidatePath(`/admin/orders/${orderId}`);
  redirect(`/admin/orders/${orderId}/?fileDeleted=1`);
}

export async function saveAdminNoteAction(formData: FormData): Promise<void> {
  if (!(await can("orders"))) redirect("/admin/login/");
  const orderId = String(formData.get("orderId") ?? "");
  const note = String(formData.get("adminNote") ?? "").trim().slice(0, 2000);
  await updateOrderAdminNote(orderId, note);
  revalidatePath(`/admin/orders/${orderId}`);
  redirect(`/admin/orders/${orderId}/?noted=1`);
}
