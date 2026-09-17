"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getProductById } from "@/lib/db";
import { clearFanpageToken, composeForProduct, createFanpagePost, deleteFanpagePost, getFanpageConfig, getFanpagePost, publishFanpagePost, saveFanpageAuto, saveFanpageConnection, testFanpageConnection, updateFanpagePost } from "@/lib/fanpage";
import { parseTimes } from "@/lib/fanpage-compose";

const PAGE = "/admin/fanpage/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (key: "saved" | "error", msg: string, extra = ""): never => redirect(`${PAGE}?${key}=${encodeURIComponent(msg)}${extra}`);

/** Page ID + access token (token kept as-is when the box is left blank) → saved, then tested. */
export async function saveFanpageConnectionAction(formData: FormData): Promise<void> {
  await requireAdmin("fanpage");
  const pageId = text(formData, "pageId").replace(/\D/g, "");
  if (!pageId) go("error", "Nhập Page ID (dãy số) của fanpage.");
  saveFanpageConnection({ pageId, token: text(formData, "token") || undefined, graphVersion: text(formData, "graphVersion") || undefined });
  const t = await testFanpageConnection();
  revalidatePath(PAGE);
  if (t.ok) go("saved", `Đã kết nối fanpage “${t.name}”.`);
  else go("error", `Đã lưu nhưng chưa kết nối được: ${t.message}`);
}

export async function clearFanpageTokenAction(): Promise<void> {
  await requireAdmin("fanpage");
  clearFanpageToken();
  revalidatePath(PAGE);
  go("saved", "Đã xoá access token.");
}

export async function saveFanpageAutoAction(formData: FormData): Promise<void> {
  await requireAdmin("fanpage");
  const times = parseTimes(text(formData, "times"));
  const enabled = formData.get("enabled") === "on";
  if (enabled && !times.length) go("error", "Nhập ít nhất một giờ đăng (VD 09:00, 20:00).");
  const pickRaw = text(formData, "pick");
  saveFanpageAuto({ enabled, times: times.length ? times : ["09:00", "20:00"], pick: pickRaw === "random" || pickRaw === "newest" ? pickRaw : "unposted", hashtags: text(formData, "hashtags").slice(0, 300) });
  revalidatePath(PAGE);
  go("saved", enabled ? `Tự động đăng: ${times.join(", ")} mỗi ngày.` : "Đã tắt tự động đăng (bài đã lên lịch vẫn đăng).");
}

/** Pick a product → draft with generated caption + its photos. */
export async function composeDraftAction(formData: FormData): Promise<void> {
  await requireAdmin("fanpage");
  const productId = Number.parseInt(text(formData, "productId"), 10);
  const product = Number.isInteger(productId) ? await getProductById(productId) : null;
  if (!product) go("error", "Chọn một sản phẩm trước.");
  const p = product!;
  const variant = Math.floor(Math.random() * 3);
  const c = await composeForProduct(p, variant);
  const post = createFanpagePost({ productId: p.id, message: c.message, images: c.images, link: c.link, scheduledAt: null, status: "draft", variant });
  revalidatePath(PAGE);
  redirect(`${PAGE}?draft=${post.id}#draft`);
}

/** Another wording for the same product (keeps the photo selection). */
export async function regenerateDraftAction(formData: FormData): Promise<void> {
  await requireAdmin("fanpage");
  const id = Number.parseInt(text(formData, "id"), 10);
  const post = Number.isInteger(id) ? getFanpagePost(id) : null;
  if (!post || !post.productId) go("error", "Không tìm thấy bài nháp.");
  const product = await getProductById(post!.productId!);
  if (!product) go("error", "Sản phẩm không còn.");
  const variant = (post!.variant + 1) % 3;
  const c = await composeForProduct(product!, variant);
  updateFanpagePost(id, { message: c.message, link: c.link, variant });
  revalidatePath(PAGE);
  redirect(`${PAGE}?draft=${id}#draft`);
}

/** Draft form: save / post now / schedule. */
export async function saveDraftAction(formData: FormData): Promise<void> {
  await requireAdmin("fanpage");
  const id = Number.parseInt(text(formData, "id"), 10);
  const post = Number.isInteger(id) ? getFanpagePost(id) : null;
  if (!post) go("error", "Không tìm thấy bài nháp.");
  const message = text(formData, "message");
  if (!message) go("error", "Nội dung bài không được để trống.", `&draft=${id}`);
  const images = formData.getAll("images").map(String).filter(Boolean).slice(0, 10);
  const mode = text(formData, "mode");
  updateFanpagePost(id, { message, images, link: text(formData, "link") || post!.link });
  if (mode === "now") {
    const r = await publishFanpagePost(id);
    revalidatePath(PAGE);
    if (r.ok) go("saved", `Đã đăng lên fanpage (bài ${r.fbPostId}).`);
    go("error", `Đăng thất bại: ${r.message}`, `&draft=${id}`);
  }
  if (mode === "schedule") {
    const when = text(formData, "scheduledAt"); // "YYYY-MM-DDTHH:MM" in the admin's (Vietnam) local time
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(when) ? new Date(`${when.slice(0, 16)}:00+07:00`).toISOString() : "";
    if (!iso) go("error", "Chọn thời điểm đăng.", `&draft=${id}`);
    updateFanpagePost(id, { scheduledAt: iso, status: "queued", error: "" });
    revalidatePath(PAGE);
    go("saved", `Đã lên lịch đăng lúc ${when.slice(11, 16)} ngày ${when.slice(8, 10)}/${when.slice(5, 7)}.`);
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=${encodeURIComponent("Đã lưu nháp.")}&draft=${id}#draft`);
}

export async function postNowAction(formData: FormData): Promise<void> {
  await requireAdmin("fanpage");
  const id = Number.parseInt(text(formData, "id"), 10);
  if (!Number.isInteger(id)) go("error", "Yêu cầu không hợp lệ.");
  const cfg = getFanpageConfig();
  if (!cfg.pageId || !cfg.token) go("error", "Chưa cấu hình kết nối Facebook Page (khung bên phải).");
  const r = await publishFanpagePost(id);
  revalidatePath(PAGE);
  if (r.ok) go("saved", `Đã đăng lên fanpage (bài ${r.fbPostId}).`);
  go("error", `Đăng thất bại: ${r.message}`);
}

export async function cancelPostAction(formData: FormData): Promise<void> {
  await requireAdmin("fanpage");
  const id = Number.parseInt(text(formData, "id"), 10);
  const post = Number.isInteger(id) ? getFanpagePost(id) : null;
  if (!post) go("error", "Không tìm thấy bài.");
  if (post!.status === "posted") go("error", "Bài đã đăng — xoá trực tiếp trên Facebook nếu cần.");
  if (post!.status === "queued") updateFanpagePost(id, { status: "cancelled" });
  else deleteFanpagePost(id);
  revalidatePath(PAGE);
  go("saved", post!.status === "queued" ? "Đã huỷ lịch đăng." : "Đã xoá bài.");
}
