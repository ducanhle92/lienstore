"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { deleteBanner, getBanners, saveBanner } from "@/lib/db";
import { saveUpload } from "@/lib/uploads";

const PAGE = "/admin/banners/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (key: "saved" | "error", msg: string): never => redirect(`${PAGE}?${key}=${encodeURIComponent(msg)}`);
const isRedirect = (e: unknown) => e instanceof Error && e.message.includes("NEXT_REDIRECT");
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

/** Create or update a banner; an uploaded picture replaces the URL typed in the field. */
export async function saveBannerAction(formData: FormData): Promise<void> {
  await requireAdmin("banners");
  const idRaw = text(formData, "id");
  let image = text(formData, "image");
  const href = text(formData, "href");
  try {
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      if (!IMAGE_TYPES.has(file.type)) back("error", "Ảnh phải là JPG, PNG, WebP, GIF hoặc AVIF.");
      if (file.size > 8 * 1024 * 1024) back("error", "Ảnh tối đa 8 MB.");
      const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const safe = file.name.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "banner";
      const saved = await saveUpload("banners", `${Date.now()}-${safe}.${ext}`, Buffer.from(await file.arrayBuffer()));
      image = saved.url;
    }
    if (!image) back("error", "Cần ảnh banner: tải ảnh lên hoặc dán đường dẫn ảnh.");
    if (href && !/^(\/|https?:\/\/)/.test(href)) back("error", "Link phải bắt đầu bằng / (trang trong web) hoặc https://.");
    const id = await saveBanner({
      id: idRaw ? Number.parseInt(idRaw, 10) : undefined,
      image,
      href,
      alt: text(formData, "alt"),
      position: Number.parseInt(text(formData, "position"), 10) || 0,
      active: formData.get("active") === "on",
    });
    revalidatePath("/", "layout");
    redirect(`${PAGE}?saved=${encodeURIComponent(idRaw ? "Đã lưu banner." : "Đã thêm banner.")}#banner-${id}`);
  } catch (e) {
    if (isRedirect(e)) throw e;
    back("error", e instanceof Error ? e.message : "Không lưu được banner.");
  }
}

export async function deleteBannerAction(formData: FormData): Promise<void> {
  await requireAdmin("banners");
  const id = Number.parseInt(text(formData, "id"), 10);
  if (!Number.isInteger(id)) back("error", "Yêu cầu không hợp lệ.");
  await deleteBanner(id);
  revalidatePath("/", "layout");
  back("saved", "Đã xoá banner.");
}

/** Move a banner one step up or down in the rotation. */
export async function moveBannerAction(formData: FormData): Promise<void> {
  await requireAdmin("banners");
  const id = Number.parseInt(text(formData, "id"), 10);
  const dir = text(formData, "dir") === "up" ? -1 : 1;
  const all = await getBanners(false);
  const i = all.findIndex((b) => b.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) back("saved", "Không đổi thứ tự.");
  const a = all[i];
  const b = all[j];
  await saveBanner({ ...a, position: j });
  await saveBanner({ ...b, position: i });
  // normalise the rest so positions stay 0..n-1
  for (let k = 0; k < all.length; k++) if (k !== i && k !== j) await saveBanner({ ...all[k], position: k });
  revalidatePath("/", "layout");
  back("saved", "Đã đổi thứ tự.");
}
