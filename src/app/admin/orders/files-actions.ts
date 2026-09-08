"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth";
import { addOrderFile, deleteOrderFile, getOrderById, updateOrderAdminNote } from "@/lib/db";
import { deleteUpload, extForMime, MAX_UPLOAD_BYTES, RECEIPT_MIMES, saveUpload, slugifyFileName, uniqueName } from "@/lib/uploads";

function parseInt0(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? Number.parseInt(digits, 10) : null;
}

/** Attach one or more receipt files (image/PDF) to an order. */
export async function uploadOrderFilesAction(formData: FormData): Promise<void> {
  if (!(await can("orders"))) redirect("/admin/login/");
  const orderId = String(formData.get("orderId") ?? "");
  const order = await getOrderById(orderId);
  if (!order) redirect("/admin/orders/");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const amountJpy = parseInt0(String(formData.get("amountJpy") ?? ""));
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  let saved = 0;
  let error = "";
  for (const file of files) {
    if (!RECEIPT_MIMES.has(file.type)) {
      error = `Bỏ qua ${file.name}: chỉ nhận ảnh hoặc PDF.`;
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      error = `Bỏ qua ${file.name}: vượt 10 MB.`;
      continue;
    }
    const ext = extForMime(file.type) || ".bin";
    const name = uniqueName(slugifyFileName(file.name), ext);
    const stored = await saveUpload(`orders/${order.id}`, name, Buffer.from(await file.arrayBuffer()));
    await addOrderFile({ orderId: order.id, kind: "receipt", fileName: file.name, path: stored.rel, mime: file.type, size: file.size, note, amountJpy });
    saved += 1;
  }
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
