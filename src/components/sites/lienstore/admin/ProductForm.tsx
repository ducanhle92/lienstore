"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { deleteProductAction, saveProductAction, type ProductFormState } from "@/app/admin/products/actions";
import { cn } from "@/lib/utils";
import type { CatalogProduct, ShopCategory } from "@/types/shop";
import { ConfirmSubmit } from "./ConfirmSubmit";
import { DescriptionEditor } from "./DescriptionEditor";
import { ProductImageManager } from "./ProductImageManager";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Card, Flash } from "./ui";

interface ProductFormProps {
  product?: CatalogProduct;
  categories: ShopCategory[];
}

const digits = (s: string) => Number.parseInt(s.replace(/[^\d]/g, ""), 10);

/** Profit per unit + margin % for the live hint under the cost field. */
function computeMargin(priceText: string, costText: string): { profit: number; pct: number } | null {
  const price = digits(priceText);
  const cost = digits(costText);
  if (!Number.isFinite(price) || !Number.isFinite(cost) || price <= 0) return null;
  return { profit: price - cost, pct: Math.round(((price - cost) / price) * 1000) / 10 };
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-[12px] leading-4 text-red-600">{msg}</p> : null;
}

export function ProductForm({ product, categories }: ProductFormProps) {
  const [state, action, pending] = useActionState<ProductFormState, FormData>(saveProductAction, null);
  const [priceText, setPriceText] = useState(String(product?.price ?? ""));
  const [costText, setCostText] = useState(String(product?.costPrice ?? ""));
  const margin = computeMargin(priceText, costText);
  const fields = state?.fields ?? {};

  return (
    <>
      {state?.error ? <Flash kind="error">{state.error}</Flash> : null}
      <form action={action} className="grid gap-6 lg:grid-cols-3">
        {product ? <input type="hidden" name="id" value={product.id} /> : null}

        <div className="space-y-6 lg:col-span-2">
          <Card title="Thông tin cơ bản">
            <div className="grid gap-4">
              <div>
                <label className={adminLabel} htmlFor="name">
                  Tên sản phẩm *
                </label>
                <input id="name" name="name" defaultValue={product?.name} required className={cn(adminInput, fields.name && "border-red-500")} />
                <FieldError msg={fields.name} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="nameJa">
                  Tên tiếng Nhật <span className="font-normal text-lien-muted">(hiện khi khách chọn 日本語)</span>
                </label>
                <input id="nameJa" name="nameJa" defaultValue={product?.nameJa} placeholder="VD: 雪肌精 クリアウェルネス 140g" className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="slug">
                  Đường dẫn (slug)
                </label>
                <input id="slug" name="slug" defaultValue={product?.slug} placeholder="Để trống để tạo tự động từ tên" className={cn(adminInput, fields.slug && "border-red-500")} />
                <FieldError msg={fields.slug} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="shortDescription">
                  Mô tả ngắn (HTML)
                </label>
                <textarea id="shortDescription" name="shortDescription" rows={3} defaultValue={product?.shortDescription} className={adminInput} />
              </div>
              <div>
                <p className={adminLabel}>Mô tả chi tiết</p>
                <DescriptionEditor name="description" lang="vi" initialHtml={product?.description ?? ""} productName={product?.name} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="shortDescriptionJa">
                  Mô tả ngắn tiếng Nhật
                </label>
                <textarea id="shortDescriptionJa" name="shortDescriptionJa" rows={2} defaultValue={product?.shortDescriptionJa} className={adminInput} />
              </div>
              <div>
                <p className={adminLabel}>
                  Mô tả chi tiết tiếng Nhật <span className="font-normal text-lien-muted">— để trống thì hiện bản tiếng Việt</span>
                </p>
                <DescriptionEditor name="descriptionJa" lang="ja" initialHtml={product?.descriptionJa ?? ""} productName={product?.nameJa || product?.name} />
              </div>
            </div>
          </Card>

          <Card title="Hình ảnh">
            <ProductImageManager
              initial={product?.images ?? []}
              initialThumbs={product?.thumb && product.images[0] ? { [product.images[0]]: product.thumb } : {}}
              error={fields.images}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Bán hàng">
            <div className="grid gap-4">
              <div>
                <label className={adminLabel} htmlFor="price">
                  Giá (VNĐ) *
                </label>
                <input id="price" name="price" inputMode="numeric" value={priceText} onChange={(e) => setPriceText(e.target.value)} required className={cn(adminInput, fields.price && "border-red-500")} />
                <FieldError msg={fields.price} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="regularPrice">
                  Giá gốc (nếu đang giảm giá)
                </label>
                <input id="regularPrice" name="regularPrice" inputMode="numeric" defaultValue={product?.regularPrice ?? ""} className={cn(adminInput, fields.regularPrice && "border-red-500")} />
                <FieldError msg={fields.regularPrice} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="costPrice">
                  Giá vốn (giá nhập, VNĐ)
                </label>
                <input id="costPrice" name="costPrice" inputMode="numeric" value={costText} onChange={(e) => setCostText(e.target.value)} placeholder="Chỉ hiển thị trong quản trị" className={cn(adminInput, fields.costPrice && "border-red-500")} />
                <FieldError msg={fields.costPrice} />
                {margin ? (
                  <p className={cn("mt-1 text-[12px] leading-4", margin.profit >= 0 ? "text-green-700" : "text-red-600")}>
                    Lợi nhuận/sp: {margin.profit.toLocaleString("vi-VN")}đ ({margin.pct}%)
                  </p>
                ) : null}
              </div>
              <div>
                <label className={adminLabel} htmlFor="supplierUrl">
                  Link nhà cung cấp (Amazon JP, trang hãng…)
                </label>
                <input id="supplierUrl" name="supplierUrl" type="url" defaultValue={product?.supplierUrl ?? ""} placeholder="https://www.amazon.co.jp/dp/…" className={cn(adminInput, fields.supplierUrl && "border-red-500")} />
                <FieldError msg={fields.supplierUrl} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="minStock">
                  Mức tồn tối thiểu (cảnh báo sắp hết)
                </label>
                <input id="minStock" name="minStock" inputMode="numeric" defaultValue={product?.minStock ?? ""} placeholder="Mặc định 2" className={cn(adminInput, fields.minStock && "border-red-500")} />
                <FieldError msg={fields.minStock} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={adminLabel} htmlFor="weightG">
                    Khối lượng (gram)
                  </label>
                  <input id="weightG" name="weightG" inputMode="numeric" defaultValue={product?.weightG ?? ""} placeholder="VD: 350" className={cn(adminInput, fields.weightG && "border-red-500")} />
                  <FieldError msg={fields.weightG} />
                </div>
                <div>
                  <label className={adminLabel} htmlFor="dimsCm">
                    Kích thước (cm, D x R x C)
                  </label>
                  <input id="dimsCm" name="dimsCm" defaultValue={product?.dimsCm ?? ""} placeholder="VD: 12x8x5" className={cn(adminInput, fields.dimsCm && "border-red-500")} />
                  <FieldError msg={fields.dimsCm} />
                </div>
                <div>
                  <label className={adminLabel} htmlFor="dimsConfidence">
                    Độ tin cậy kích thước / khối lượng
                  </label>
                  <select id="dimsConfidence" name="dimsConfidence" defaultValue={product?.dimsConfidence ?? ""} className={adminInput}>
                    <option value="">Chưa đánh giá (tính như Thấp ×2)</option>
                    <option value="high">Cao — nguồn bán hàng / cân thật (×1,2)</option>
                    <option value="medium">Trung bình — suy luận tương đương (×1,5)</option>
                    <option value="low">Thấp — ước đoán (×2)</option>
                  </select>
                </div>
                <div>
                  <label className={adminLabel} htmlFor="dimsSource">
                    Cơ sở / nguồn số liệu
                  </label>
                  <input id="dimsSource" name="dimsSource" defaultValue={product?.dimsSource ?? ""} placeholder="VD: Amazon.co.jp 梱包サイズ; ước theo 60 viên" className={adminInput} />
                </div>
                <p className="col-span-2 -mt-1 text-[12px] text-lien-muted">
                  Phí vận chuyển tính trên <strong>cân tính phí</strong> = max(cân thật, D×R×C/6000) × hệ số an toàn theo độ tin cậy (Cao ×1,2 · Trung bình ×1,5 · Thấp ×2), làm tròn lên từng kg. Khách chỉ thấy số đo khi độ tin cậy là Cao.
                </p>
              </div>
              <div>
                <label className={adminLabel} htmlFor="sku">
                  Mã SKU
                </label>
                <input id="sku" name="sku" defaultValue={product?.sku ?? ""} className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="stock">
                  Tồn kho (để trống = không theo dõi)
                </label>
                <input id="stock" name="stock" inputMode="numeric" defaultValue={product?.stock ?? ""} className={cn(adminInput, fields.stock && "border-red-500")} />
                <FieldError msg={fields.stock} />
              </div>
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" name="out_of_stock" defaultChecked={product?.stockStatus === "outofstock"} className="h-4 w-4" />
                Đánh dấu hết hàng
              </label>
              <div>
                <label className={adminLabel} htmlFor="status">
                  Trạng thái
                </label>
                <select id="status" name="status" defaultValue={product?.status ?? "publish"} className={adminInput}>
                  <option value="publish">Đang bán</option>
                  <option value="draft">Bản nháp (ẩn)</option>
                </select>
              </div>
            </div>
          </Card>

          <Card title="Danh mục *">
            <div className={cn("grid max-h-72 gap-1.5 overflow-y-auto pr-1", fields.categories && "rounded border border-red-500 p-2")}>
              {categories.map((c) => (
                <label key={c.slug} className="flex items-start gap-2 text-[13px] leading-5">
                  <input type="checkbox" name="categories" value={c.slug} defaultChecked={product?.categories.includes(c.slug)} className="mt-0.5 h-4 w-4" />
                  <span>
                    {c.name} <span className="text-lien-muted">({c.count})</span>
                  </span>
                </label>
              ))}
            </div>
            <FieldError msg={fields.categories} />
          </Card>

          <Card title="Từ khóa">
            <label className={adminLabel} htmlFor="tags">
              Cách nhau bằng dấu phẩy
            </label>
            <input id="tags" name="tags" defaultValue={product?.tags.join(", ")} className={adminInput} />
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending ? "Đang lưu…" : product ? "Lưu thay đổi" : "Tạo sản phẩm"}
            </button>
            <Link href="/admin/products/" className={btnSecondary}>
              Huỷ
            </Link>
          </div>
        </div>
      </form>

      {product ? (
        <form action={deleteProductAction} className="mt-8 border-t border-[#e5e7eb] pt-6">
          <input type="hidden" name="id" value={product.id} />
          <ConfirmSubmit message={`Xoá vĩnh viễn sản phẩm “${product.name}”?`} className={btnDanger}>
            Xoá sản phẩm
          </ConfirmSubmit>
        </form>
      ) : null}
    </>
  );
}
