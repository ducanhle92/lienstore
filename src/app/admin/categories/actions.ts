"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth";
import { categorySlugExists, deleteCategory, saveCategory } from "@/lib/db";
import { slugify } from "@/lib/format";

export type CategoryFormState = { error?: string; fields?: Record<string, string> } | null;

export async function saveCategoryAction(_prev: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  if (!(await can("categories"))) return { error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const originalSlug = get("originalSlug") || undefined;
  const name = get("name");
  const fields: Record<string, string> = {};
  if (!name) fields.name = "Tên danh mục là bắt buộc.";
  const slug = slugify(get("slug") || name);
  if (!slug) fields.slug = "Đường dẫn không hợp lệ.";
  else if (await categorySlugExists(slug, originalSlug)) fields.slug = "Đường dẫn đã tồn tại.";
  const image = get("image") || null;
  if (image && !/^(\/|https?:\/\/)/.test(image)) fields.image = "Ảnh phải là đường dẫn /sites/… hoặc https://…";
  if (Object.keys(fields).length) return { error: "Vui lòng kiểm tra lại các trường được đánh dấu.", fields };

  try {
    await saveCategory({ slug, name, description: get("description"), image, originalSlug });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không thể lưu danh mục." };
  }
  revalidatePath("/", "layout");
  redirect(`/admin/categories/?saved=${encodeURIComponent(slug)}`);
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  if (!(await can("categories"))) redirect("/admin/login/");
  const slug = String(formData.get("slug") ?? "");
  if (slug) {
    await deleteCategory(slug);
    revalidatePath("/", "layout");
  }
  redirect("/admin/categories/?deleted=1");
}
