"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ChatState } from "@/components/sites/lienstore/shop/cart/OrderChat";
import { can, getAdminSession } from "@/lib/auth";
import { reallocateOrder, setManualAllocation } from "@/lib/allocations-db";
import { listAllocationViews } from "@/lib/allocations-db";
import { getDb } from "@/lib/sqlite";
import { addOrderMessage, getOrderById, deleteOrder, setOrderCod, setOrderCodCollected, setOrderStage, setOrderTransferReceived, updateOrderStatus } from "@/lib/db";
import { deleteUpload } from "@/lib/uploads";
import { parseJpy, saveOrderReceipts } from "@/lib/order-receipts";
import { isShipStage, SHIP_STAGES } from "@/lib/shipping";
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

/**
 * The one "Trạng thái" select of the order page's bottom bar (saved with "Lưu thay đổi"): a progress step
 * (stage:<key>), a payment step (pay:transfer · pay:cod · pay:cod_done) or cancel / restore (status:cancelled · status:pending).
 */
export async function setOrderStateAction(formData: FormData): Promise<void> {
  if (!(await can("orders")) && !(await can("shipping"))) redirect("/admin/login/");
  const id = String(formData.get("id") ?? "");
  const v = String(formData.get("state") ?? "");
  const back = `/admin/orders/${id}/`;
  if (!id) redirect("/admin/orders/");
  let r: { ok: boolean; message: string } = { ok: false, message: "Trạng thái không hợp lệ." };
  if (v.startsWith("stage:")) {
    const stage = v.slice(6);
    if (isShipStage(stage)) {
      await setOrderStage(id, stage, "");
      r = { ok: true, message: `Đã chuyển đơn sang: ${SHIP_STAGES.find((x) => x.key === stage)?.label ?? stage}. Khách thấy ngay trong trang đơn hàng.` };
    }
  } else if (v === "pay:transfer") r = await setOrderTransferReceived(id);
  else if (v === "pay:cod" || v === "pay:cod_done" || v.startsWith("status:")) {
    if (!(await can("orders"))) redirect(`${back}?error=${encodeURIComponent("Cần quyền Đơn hàng.")}`);
    if (v === "pay:cod") r = await setOrderCod(id);
    else if (v === "pay:cod_done") r = await setOrderCodCollected(id);
    else if (v === "status:cancelled" || v === "status:pending") {
      await updateOrderStatus(id, v.slice(7) as OrderStatus);
      r = { ok: true, message: v === "status:cancelled" ? "Đã huỷ đơn — hàng đang giữ trở về tồn." : "Đã khôi phục đơn (Chờ xử lý)." };
    }
  }
  revalidatePath("/admin", "layout");
  redirect(`${back}?${r.ok ? "saved" : "error"}=${encodeURIComponent(r.message)}`);
}

/** Delete an order permanently (list and detail "Xóa đơn" buttons, confirmed in the browser first). */
const OWNER_ONLY = "Chỉ chủ cửa hàng mới được xóa đơn hàng.";
async function requireOwner(back: string): Promise<void> {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login/");
  if (s.role !== "owner") redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(OWNER_ONLY)}`);
}

export async function deleteOrderAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const back = String(formData.get("back") ?? "/admin/orders/");
  await requireOwner(id ? `/admin/orders/${id}/` : back);
  const r = id ? await deleteOrder(id) : null;
  if (!r) redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent("Không tìm thấy đơn để xóa.")}`);
  for (const p of r.filePaths) await deleteUpload(p);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}deleted=${encodeURIComponent(`Đã xóa đơn #${r.number}${r.filePaths.length ? ` cùng ${r.filePaths.length} file đính kèm` : ""}.`)}`);
}

/** Delete every ticked order in the list (the bulk form posts `ids`; one id = just that row). */
export async function deleteOrdersAction(formData: FormData): Promise<void> {
  await requireOwner("/admin/orders/");
  const ids = [...new Set(formData.getAll("ids").map(String).filter(Boolean))];
  if (!ids.length) redirect(`/admin/orders/?error=${encodeURIComponent("Chưa chọn đơn nào để xóa.")}`);
  const numbers: number[] = [];
  let files = 0;
  for (const id of ids) {
    const r = await deleteOrder(id);
    if (!r) continue;
    numbers.push(r.number);
    for (const p of r.filePaths) await deleteUpload(p);
    files += r.filePaths.length;
  }
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  const list = numbers.sort((a, b) => a - b).map((n) => `#${n}`).join(", ");
  redirect(`/admin/orders/?deleted=${encodeURIComponent(numbers.length ? `Đã xóa ${numbers.length} đơn (${list})${files ? ` cùng ${files} file đính kèm` : ""}.` : "Không đơn nào được xóa (có thể đã bị xóa trước đó).")}`);
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

/** "Phân bổ lại": automatic sources of every line are recomputed (manual overrides and deducted units stay). */
export async function reallocateOrderAction(formData: FormData): Promise<void> {
  if (!(await can("orders")) && !(await can("inventory"))) redirect("/admin/login/");
  const id = String(formData.get("id") ?? "");
  if (id) {
    await reallocateOrder(id);
    revalidatePath("/admin", "layout");
  }
  // one line per product: where its units now come from (Kho VN ×1 · Cần mua ×1 …)
  const order = id ? await getOrderById(id) : null;
  const views = order ? listAllocationViews(getDb(), order.items.map((it) => it.itemId).filter((x): x is number => typeof x === "number")) : [];
  const summary = (order?.items ?? [])
    .map((it) => {
      const parts = views.filter((v) => v.orderItemId === it.itemId).map((v) => `${v.label} ×${v.qty}`);
      return `${it.name.slice(0, 40)}: ${parts.join(", ") || "theo trạng thái tay"}`;
    })
    .join(" · ");
  redirect(`/admin/orders/${id}/?saved=${encodeURIComponent(`Đã tự động phân bổ — ${summary || "không có dòng"}. Quản lý mua hàng, Tồn kho và Hàng theo đơn đã cập nhật theo.`)}`);
}

/** Override the source of one line: "buy" or "lot:12" / "stock_purchase:25" / "batch:3". */
export async function setItemSourceAction(formData: FormData): Promise<void> {
  if (!(await can("orders")) && !(await can("inventory"))) redirect("/admin/login/");
  const id = String(formData.get("id") ?? "");
  const itemId = Number.parseInt(String(formData.get("itemId") ?? ""), 10);
  const raw = String(formData.get("source") ?? "buy");
  if (!Number.isInteger(itemId) || !(raw === "buy" || /^(grp|take):\d+$/.test(raw))) redirect(`/admin/orders/${id}/?error=${encodeURIComponent("Yêu cầu không hợp lệ.")}`);
  const r = await setManualAllocation(itemId, raw);
  revalidatePath("/admin", "layout");
  redirect(`/admin/orders/${id}/?${r.ok ? "saved" : "error"}=${encodeURIComponent(r.message)}`);
}

/** "Thanh toán khi nhận hàng" on the order: COD, stock deducted now, timeline passes the payment step; optionally remember the customer. */
export async function setOrderCodAction(formData: FormData): Promise<void> {
  if (!(await can("orders"))) redirect("/admin/login/");
  const id = String(formData.get("id") ?? "");
  const r = await setOrderCod(id);
  revalidatePath("/admin", "layout");
  redirect(`/admin/orders/${id}/?${r.ok ? "saved" : "error"}=${encodeURIComponent(r.message)}#tracking`);
}

/** "Đã nhận chuyển khoản": confirm payment (also for a COD order that paid before delivery — no second deduction). */
export async function markTransferReceivedAction(formData: FormData): Promise<void> {
  if (!(await can("orders")) && !(await can("shipping"))) redirect("/admin/login/");
  const id = String(formData.get("id") ?? "");
  const r = await setOrderTransferReceived(id);
  revalidatePath("/admin", "layout");
  redirect(`/admin/orders/${id}/?${r.ok ? "saved" : "error"}=${encodeURIComponent(r.message)}#tracking`);
}

/** "Hoàn tất thanh toán" of a COD order (money collected). */
export async function markCodCollectedAction(formData: FormData): Promise<void> {
  if (!(await can("orders")) && !(await can("shipping"))) redirect("/admin/login/");
  const id = String(formData.get("id") ?? "");
  const r = await setOrderCodCollected(id);
  revalidatePath("/admin", "layout");
  redirect(`/admin/orders/${id}/?${r.ok ? "saved" : "error"}=${encodeURIComponent(r.message)}#tracking`);
}

/** Shop → customer message on an order. */
export async function adminSendMessageAction(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const session = await getAdminSession();
  if (!session || !(session.permissions.includes("orders") || session.permissions.includes("shipping"))) return { error: "Bạn không có quyền trả lời đơn hàng." };
  const orderId = String(formData.get("orderId") ?? "");
  let body = String(formData.get("body") ?? "").trim();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!orderId || (!body && !files.length)) return { error: "Nhập nội dung tin nhắn hoặc đính kèm bill." };
  // "Đính kèm bill" in the chat: the files become the order's bills (the customer sees them on the order page) and the
  // message says so; a message with no text is just that notice
  let fileError = "";
  if (files.length) {
    if (!(await getOrderById(orderId))) return { error: "Không tìm thấy đơn hàng." };
    const amountJpy = parseJpy(String(formData.get("amountJpy") ?? ""));
    const r = await saveOrderReceipts(orderId, files, { note: String(formData.get("fileNote") ?? ""), amountJpy });
    fileError = r.error;
    if (r.saved) {
      const notice = `📎 Đã đính kèm bill: ${r.names.join(", ")}${amountJpy ? ` · ¥${amountJpy.toLocaleString("ja-JP")}` : ""}`;
      body = body ? `${body}

${notice}` : notice;
    }
    if (!body) return { error: fileError || "Không lưu được file." };
  }
  try {
    // no sender name: the chat shows the shop's public name (theme), never a hardcoded brand
    await addOrderMessage({ orderId, sender: "admin", senderName: "", body });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không gửi được." };
  }
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/my-account");
  revalidatePath(`/checkout/order-received/${orderId}`);
  return fileError ? { error: fileError } : null;
}
