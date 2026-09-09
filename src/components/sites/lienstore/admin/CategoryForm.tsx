"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { deleteCategoryAction, saveCategoryAction, type CategoryFormState } from "@/app/admin/categories/actions";
import { cn } from "@/lib/utils";
import type { ShopCategory } from "@/types/shop";
import { buildCategoryTree, descendantSlugs, flattenTree } from "@/lib/categories";
import { ConfirmSubmit } from "./ConfirmSubmit";
import { uploadImage } from "./image-upload";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Card, Flash } from "./ui";

interface CategoryFormProps {
  category?: ShopCategory;
  /** Existing image paths the admin can pick from (product thumbnails). */
  suggestions?: string[];
  /** All categories (for the parent select); the category itself and its descendants are excluded. */
  allCategories?: ShopCategory[];
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-[12px] leading-4 text-red-600">{msg}</p> : null;
}

export function CategoryForm({ category, suggestions = [], allCategories = [] }: CategoryFormProps) {
  const excluded = new Set(category ? descendantSlugs(allCategories, category.slug) : []);
  const parentOptions = flattenTree(buildCategoryTree(allCategories)).filter((n) => !excluded.has(n.category.slug));
  const [state, action, pending] = useActionState<CategoryFormState, FormData>(saveCategoryAction, null);
  const [image, setImage] = useState(category?.image ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fields = state?.fields ?? {};

  const onFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { thumb } = await uploadImage(file, "categories");
      setImage(thumb); // 300×300 white-padded square — what the home-page tiles show
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Không tải được ảnh");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <>
      {state?.error ? <Flash kind="error">{state.error}</Flash> : null}
      <form action={action} className="grid gap-6 lg:grid-cols-3">
        {category ? <input type="hidden" name="originalSlug" value={category.slug} /> : null}
        <div className="space-y-6 lg:col-span-2">
          <Card title="Thông tin danh mục">
            <div className="grid gap-4">
              <div>
                <label className={adminLabel} htmlFor="name">
                  Tên danh mục *
                </label>
                <input id="name" name="name" defaultValue={category?.name} required className={cn(adminInput, fields.name && "border-red-500")} />
                <FieldError msg={fields.name} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="slug">
                  Đường dẫn (slug)
                </label>
                <input id="slug" name="slug" defaultValue={category?.slug} placeholder="Để trống để tạo tự động từ tên" className={cn(adminInput, fields.slug && "border-red-500")} />
                <FieldError msg={fields.slug} />
                <p className="mt-1 text-[12px] text-lien-muted">Trang danh mục: /product-category/&lt;slug&gt;/ — đổi slug sẽ tự cập nhật cho mọi sản phẩm thuộc danh mục.</p>
              </div>
              <div>
                <label className={adminLabel} htmlFor="parentSlug">
                  Danh mục cha
                </label>
                <select id="parentSlug" name="parentSlug" defaultValue={category?.parentSlug ?? ""} className={adminInput}>
                  <option value="">— Không (danh mục gốc, hiện trên menu chính) —</option>
                  {parentOptions.map((n) => (
                    <option key={n.category.slug} value={n.category.slug}>
                      {"\u00a0\u00a0".repeat(n.depth)}
                      {n.depth ? "└ " : ""}
                      {n.category.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[12px] text-lien-muted">Danh mục con hiện dưới danh mục cha trong menu; trang danh mục cha liệt kê cả sản phẩm của các danh mục con.</p>
              </div>
              <div>
                <label className={adminLabel} htmlFor="description">
                  Mô tả (HTML, hiển thị dưới tiêu đề trang danh mục)
                </label>
                <textarea id="description" name="description" rows={5} defaultValue={category?.description} className={adminInput} />
              </div>
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Ảnh danh mục (lưới trang chủ)">
            <label className={adminLabel} htmlFor="image-file">
              Tải ảnh từ máy (JPG/PNG/WebP, tự cắt vuông 300×300 nền trắng)
            </label>
            <input
              ref={fileInput}
              id="image-file"
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => onFile(e.target.files)}
              className={cn(adminInput, "mb-3 cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-lien-blue file:px-3 file:py-1 file:text-white")}
            />
            {uploading ? <p className="mb-2 text-[12px] text-lien-muted">Đang tải ảnh lên…</p> : null}
            {uploadError ? <p className="mb-2 text-[12px] text-red-600">{uploadError}</p> : null}
            <label className={adminLabel} htmlFor="image">
              Hoặc đường dẫn ảnh (/sites/… hoặc https://…)
            </label>
            <input id="image" name="image" value={image} onChange={(e) => setImage(e.target.value)} className={cn(adminInput, "font-mono text-[13px]", fields.image && "border-red-500")} />
            <FieldError msg={fields.image} />
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="mt-3 h-40 w-40 rounded border border-[#e5e7eb] bg-white object-contain" />
            ) : (
              <p className="mt-3 text-[12px] text-lien-muted">Chưa có ảnh: trang chủ sẽ dùng ảnh sản phẩm đầu tiên trong danh mục.</p>
            )}
            {suggestions.length ? (
              <div className="mt-4">
                <p className="mb-2 text-[12px] font-semibold uppercase text-[#6b7280]">Chọn nhanh từ ảnh sản phẩm</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.slice(0, 12).map((src) => (
                    <button key={src} type="button" onClick={() => setImage(src)} className={cn("rounded border p-0.5", image === src ? "border-lien-blue" : "border-[#e5e7eb] hover:border-lien-blue")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-12 w-12 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending ? "Đang lưu…" : category ? "Lưu thay đổi" : "Tạo danh mục"}
            </button>
            <Link href="/admin/categories/" className={btnSecondary}>
              Huỷ
            </Link>
          </div>
        </div>
      </form>
      {category ? (
        <form action={deleteCategoryAction} className="mt-8 border-t border-[#e5e7eb] pt-6">
          <input type="hidden" name="slug" value={category.slug} />
          <ConfirmSubmit
            message={`Xoá danh mục “${category.name}”? ${category.count} sản phẩm sẽ bị gỡ khỏi danh mục này (không xoá sản phẩm).`}
            className={btnDanger}
          >
            Xoá danh mục
          </ConfirmSubmit>
        </form>
      ) : null}
    </>
  );
}
