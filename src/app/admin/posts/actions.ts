"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { deletePost, getPostBySlugAdmin, savePost, setPostStatus } from "@/lib/db";
import { slugify } from "@/lib/format";
import { saveUpload } from "@/lib/uploads";

const LIST = "/admin/posts/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (url: string, key: "saved" | "error", msg: string): never => redirect(`${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);
const isRedirect = (e: unknown) => e instanceof Error && e.message.includes("NEXT_REDIRECT");
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };

/** Strip tags for the excerpt when the author leaves it empty. */
function autoExcerpt(html: string): string {
  const t = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 220 ? `${t.slice(0, 217).trimEnd()}…` : t;
}

/** Create or update a post (Tổng quan › Góc chia sẻ). */
export async function savePostAction(formData: FormData): Promise<void> {
  await requireAdmin("posts");
  const original = text(formData, "original_slug");
  const title = text(formData, "title");
  const url = original ? `${LIST}${encodeURIComponent(original)}/` : `${LIST}new/`;
  if (!title) back(url, "error", "Bài viết cần có tiêu đề.");
  let slug = slugify(text(formData, "slug") || title);
  if (!slug) back(url, "error", "Đường dẫn không hợp lệ.");
  const content = String(formData.get("content") ?? "");
  const excerpt = text(formData, "excerpt") || autoExcerpt(content);
  const dateRaw = text(formData, "date");
  const date = /^\d{4}-\d{2}-\d{2}/.test(dateRaw) ? new Date(`${dateRaw}T09:00:00+07:00`).toISOString() : new Date().toISOString();
  const status = formData.get("status") === "draft" ? "draft" : "publish";
  let image = text(formData, "image");
  try {
    const file = formData.get("imageFile");
    if (file instanceof File && file.size > 0) {
      if (!IMAGE_TYPES[file.type]) back(url, "error", "Ảnh đại diện phải là JPG, PNG, WebP, GIF hoặc AVIF.");
      if (file.size > 8 * 1024 * 1024) back(url, "error", "Ảnh tối đa 8 MB.");
      const saved = await saveUpload(`posts/${new Date().toISOString().slice(0, 7)}`, `${slug}-cover-${Date.now()}.${IMAGE_TYPES[file.type]}`, Buffer.from(await file.arrayBuffer()));
      image = saved.url;
    }
    if (!original) {
      // new post: never overwrite an existing slug silently
      let candidate = slug;
      for (let i = 2; await getPostBySlugAdmin(candidate); i++) candidate = `${slug}-${i}`;
      slug = candidate;
    } else if (slug !== original && (await getPostBySlugAdmin(slug))) {
      back(url, "error", `Đường dẫn "${slug}" đã có bài khác dùng.`);
    }
    await savePost({ originalSlug: original || undefined, slug, title, content, excerpt, date, status, image });
    revalidatePath("/", "layout");
    redirect(`${LIST}${encodeURIComponent(slug)}/?saved=${encodeURIComponent(original ? "Đã lưu bài viết." : "Đã tạo bài viết.")}`);
  } catch (e) {
    if (isRedirect(e)) throw e;
    back(url, "error", e instanceof Error ? e.message : "Không lưu được bài viết.");
  }
}

export async function setPostStatusAction(formData: FormData): Promise<void> {
  await requireAdmin("posts");
  const slug = text(formData, "slug");
  const status = formData.get("status") === "draft" ? "draft" : "publish";
  await setPostStatus(slug, status);
  revalidatePath("/", "layout");
  back(text(formData, "back") || LIST, "saved", status === "publish" ? "Đã đăng bài." : "Đã ẩn bài (bản nháp).");
}

export async function deletePostAction(formData: FormData): Promise<void> {
  await requireAdmin("posts");
  const slug = text(formData, "slug");
  await deletePost(slug);
  revalidatePath("/", "layout");
  back(LIST, "saved", "Đã xoá bài viết.");
}
