"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { deleteProductAction, saveProductAction, type ProductFormState } from "@/app/admin/products/actions";
import { effectiveMarginPct, type PricingConfig, suggestPrice } from "@/lib/pricing";
import { costSourceLabel, sourceFromUrl } from "@/lib/cost-sources";
import { CostSourcesEditor } from "./CostSourcesEditor";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { isDimsConfidence, LEG_LABEL, type ShippingQuoteConfig } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import type { CatalogProduct, CostSource, ShopCategory } from "@/types/shop";
import { ConfirmSubmit } from "./ConfirmSubmit";
import { DescriptionEditor } from "./DescriptionEditor";
import { ProductImageManager } from "./ProductImageManager";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Card, Flash } from "./ui";

interface ProductFormProps {
  product?: CatalogProduct;
  categories: ShopCategory[];
  /** Japanese price quotes per purchase source (existing products). */
  costSources?: CostSource[];
  /** Preferred purchase source (Công thức giá › Nguồn mua hàng). */
  defaultSource?: string;
  /** Import-leg methods + ¥ rate and margin % for the suggested selling price (Kho hàng › Công thức giá). */
  quote?: ShippingQuoteConfig;
  pricing?: PricingConfig;
  /** SKU proposed by the convention (existing products only). */
  skuSuggestion?: string;
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

export function ProductForm({ product, categories, quote, pricing, skuSuggestion, costSources = [], defaultSource = "amazon" }: ProductFormProps) {
  // rows of the ¥ editor: saved sources, or the legacy single price of the product
  const costDrafts = costSources.length ? costSources.map((c) => ({ source: c.source, priceJpy: String(c.priceJpy), url: c.url })) : product?.costJpy ? [{ source: product.costSource || sourceFromUrl(product.costUrl), priceJpy: String(product.costJpy), url: product.costUrl }] : [];
  const costPrimary = Math.max(0, costDrafts.findIndex((c) => product?.costJpy !== null && product?.costJpy !== undefined && Number(c.priceJpy) === product.costJpy && (!product.costSource || c.source === product.costSource)));
  const [state, action, pending] = useActionState<ProductFormState, FormData>(saveProductAction, null);
  const [priceText, setPriceText] = useState(String(product?.price ?? ""));
  const [costText, setCostText] = useState(String(product?.costPrice ?? ""));
  const [skuText, setSkuText] = useState(product?.sku ?? "");
  const [marginText, setMarginText] = useState(product?.marginPct === null || product?.marginPct === undefined ? "" : String(product.marginPct));
  const [weightText, setWeightText] = useState(String(product?.weightG ?? ""));
  const [dimsText, setDimsText] = useState(product?.dimsCm ?? "");
  const [confText, setConfText] = useState(product?.dimsConfidence ?? "");
  const [catSlugs, setCatSlugs] = useState<string[]>(product?.categories ?? []);
  const defaultMargin = pricing ? effectiveMarginPct(pricing, null, catSlugs) : 25;
  const [primaryJpy, setPrimaryJpy] = useState<number | null>(product?.costJpy ?? null);
  const margin = computeMargin(priceText, costText);
  const costNum = digits(costText);
  const rate = quote?.jpyRate ?? 0;
  /** Giá vốn VNĐ from the chosen ¥ quote at today's rate. */
  const costFromJpy = primaryJpy && rate ? Math.round(primaryJpy * rate) : null;
  const recalcCost = () => {
    if (costFromJpy) setCostText(String(costFromJpy));
    return costFromJpy;
  };
  /** Recompute the expected selling price from the (recalculated) cost and the margin, and use it. */
  const recalcPrice = () => {
    const cost = recalcCost() ?? (Number.isFinite(costNum) ? costNum : null);
    if (!quote || !pricing || cost === null) return;
    const s = suggestPrice(
      { costPrice: cost, weightG: Number.isFinite(digits(weightText)) ? digits(weightText) : null, dimsCm: dimsText || null, dimsConfidence: isDimsConfidence(confText) ? confText : null, marginPct: marginText.trim() === "" ? null : Number.parseFloat(marginText.replace(",", ".")), categories: catSlugs },
      quote,
      pricing,
    );
    if (s) setPriceText(String(s.suggested));
  };
  const suggestion =
    quote && pricing
      ? suggestPrice(
          { costPrice: Number.isFinite(costNum) ? costNum : null, weightG: Number.isFinite(digits(weightText)) ? digits(weightText) : null, dimsCm: dimsText || null, dimsConfidence: isDimsConfidence(confText) ? confText : null, marginPct: marginText.trim() === "" ? null : Number.parseFloat(marginText.replace(",", ".")), categories: catSlugs },
          quote,
          pricing,
        )
      : null;
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

          <Card title="Danh mục *">
            <div className={cn("grid max-h-60 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3", fields.categories && "rounded border border-red-500 p-2")}>
              {categories.map((c) => (
                <label key={c.slug} className="flex items-start gap-2 text-[13px] leading-5">
                  <input type="checkbox" name="categories" value={c.slug} defaultChecked={product?.categories.includes(c.slug)} onChange={(e) => setCatSlugs((s) => (e.target.checked ? [...s, c.slug] : s.filter((x) => x !== c.slug)))} className="mt-0.5 h-4 w-4" />
                  <span>
                    {c.name} <span className="text-lien-muted">({c.count})</span>
                  </span>
                </label>
              ))}
            </div>
            <FieldError msg={fields.categories} />
          </Card>

          <Card title="Từ khóa (thông tin cơ bản)">
            <label className={adminLabel} htmlFor="tags">
              Cách nhau bằng dấu phẩy
            </label>
            <input id="tags" name="tags" defaultValue={product?.tags.join(", ")} className={adminInput} />
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
                <label className={adminLabel}>Giá vốn (円 — giá tại Nhật) theo nguồn mua</label>
                <CostSourcesEditor initial={costDrafts} primaryIndex={costPrimary} defaultSource={defaultSource} error={fields.costJpy} onPrimaryChange={(p) => setPrimaryJpy(p?.priceJpy ?? null)} />
                <p className="mt-1 text-[12px] leading-4 text-lien-muted">
                  Mỗi nguồn kèm link mua (thay cho ô link nhà cung cấp). Nút tròn chọn giá dùng làm giá vốn; đổi nguồn xong bấm &quot;Tính lại giá vốn&quot; bên dưới (mỗi đêm hệ thống cũng tính lại theo tỉ giá).
                  {product?.costSource ? ` Nguồn hiện tại: ${costSourceLabel(product.costSource)}${product.costCheckedAt ? ` · ${product.costCheckedAt.slice(0, 10)}` : ""}.` : ""}
                </p>
              </div>
              <div>
                <label className={adminLabel} htmlFor="costPrice">
                  Giá vốn (VNĐ) <span className="font-normal text-lien-muted">(tự tính từ ¥ nếu để trống)</span>
                </label>
                <div className="flex gap-2">
                  <input id="costPrice" name="costPrice" inputMode="numeric" value={costText} onChange={(e) => setCostText(e.target.value)} placeholder="Chỉ hiển thị trong quản trị" className={cn(adminInput, "!mb-0 flex-1", fields.costPrice && "border-red-500")} />
                  <button type="button" onClick={recalcCost} disabled={!costFromJpy} title={costFromJpy ? `${primaryJpy?.toLocaleString("vi-VN")}¥ × ${rate.toLocaleString("vi-VN")} = ${costFromJpy.toLocaleString("vi-VN")}đ` : "Chọn một nguồn có giá ¥ trước"} className="shrink-0 rounded-md border border-lien-blue px-2.5 py-1.5 text-[12px] font-semibold text-lien-blue hover:bg-lien-blue-soft disabled:opacity-50" data-testid="recalc-cost">
                    <Fa name="refresh" /> Tính lại giá vốn
                  </button>
                </div>
                <FieldError msg={fields.costPrice} />
                {costFromJpy && Number.isFinite(costNum) && costNum !== costFromJpy ? <p className="mt-1 text-[12px] text-amber-700">Theo nguồn đã chọn: {costFromJpy.toLocaleString("vi-VN")}đ ({primaryJpy?.toLocaleString("vi-VN")}¥ × {rate.toLocaleString("vi-VN")}) — bấm &quot;Tính lại giá vốn&quot; để cập nhật.</p> : null}
                {margin ? (
                  <p className={cn("mt-1 text-[12px] leading-4", margin.profit >= 0 ? "text-green-700" : "text-red-600")}>
                    Lợi nhuận/sp: {margin.profit.toLocaleString("vi-VN")}đ ({margin.pct}%)
                  </p>
                ) : null}
                {suggestion ? (
                  <div className="mt-2 rounded-md border border-lien-blue/30 bg-lien-blue-soft/60 p-2.5 text-[12px] leading-5 text-lien-text">
                    <p className="m-0 font-semibold text-lien-heading">
                      Giá kỳ vọng bán ra trên website: {suggestion.suggested.toLocaleString("vi-VN")}đ{" "}
                      {digits(priceText) !== suggestion.suggested ? (
                        <button type="button" onClick={() => setPriceText(String(suggestion.suggested))} className="ml-1 rounded bg-lien-blue px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-lien-blue-hover">
                          Dùng giá này
                        </button>
                      ) : (
                        <span className="ml-1 text-green-700">✓ đang dùng</span>
                      )}
                      <button type="button" onClick={recalcPrice} className="ml-1 rounded border border-lien-blue px-2 py-0.5 text-[11px] font-semibold text-lien-blue hover:bg-lien-blue-soft" title="Tính lại giá vốn từ nguồn ¥ đã chọn rồi tính giá kỳ vọng theo tỉ lệ lãi riêng và dùng làm giá bán" data-testid="recalc-price">
                        <Fa name="refresh" /> Tính lại giá kỳ vọng &amp; dùng
                      </button>
                    </p>
                    <p className="m-0 text-lien-muted">
                      Giá vốn về tới VN {suggestion.landed.toLocaleString("vi-VN")} = vốn {suggestion.cost.toLocaleString("vi-VN")} + ship 3 chặng {suggestion.shipping.toLocaleString("vi-VN")} ({suggestion.weightG.toLocaleString("vi-VN")} g tính phí
                      {suggestion.legs.length ? `: ${suggestion.legs.map((l) => `${LEG_LABEL[l.leg]} ${l.fee.toLocaleString("vi-VN")}`).join(" · ")}` : " — chưa có phương thức chặng nhập hàng"}) · × (1 + {suggestion.marginPct}%) → lợi nhuận kỳ vọng {suggestion.margin.toLocaleString("vi-VN")}đ.
                    </p>
                  </div>
                ) : null}
              </div>
              <div>
                <label className={adminLabel} htmlFor="marginPct">
                  Tỉ lệ lãi kỳ vọng riêng (%) <span className="font-normal text-lien-muted">(để trống = dùng {defaultMargin}%{pricing && defaultMargin !== pricing.marginPct ? " theo danh mục" : " mặc định của shop"})</span>
                </label>
                <input id="marginPct" name="marginPct" inputMode="decimal" value={marginText} onChange={(e) => setMarginText(e.target.value)} placeholder={String(defaultMargin)} className={cn(adminInput, "!w-[140px]")} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="minStock">
                  Mức tồn tối thiểu (cảnh báo sắp hết)
                </label>
                <input id="minStock" name="minStock" inputMode="numeric" defaultValue={product?.minStock ?? ""} placeholder="Mặc định 0 (không cảnh báo)" className={cn(adminInput, fields.minStock && "border-red-500")} />
                <FieldError msg={fields.minStock} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={adminLabel} htmlFor="weightG">
                    Khối lượng (gram)
                  </label>
                  <input id="weightG" name="weightG" inputMode="numeric" value={weightText} onChange={(e) => setWeightText(e.target.value)} placeholder="VD: 350" className={cn(adminInput, fields.weightG && "border-red-500")} />
                  <FieldError msg={fields.weightG} />
                </div>
                <div>
                  <label className={adminLabel} htmlFor="dimsCm">
                    Kích thước (cm, D x R x C)
                  </label>
                  <input id="dimsCm" name="dimsCm" value={dimsText} onChange={(e) => setDimsText(e.target.value)} placeholder="VD: 12x8x5" className={cn(adminInput, fields.dimsCm && "border-red-500")} />
                  <FieldError msg={fields.dimsCm} />
                </div>
                <div>
                  <label className={adminLabel} htmlFor="dimsConfidence">
                    Độ tin cậy kích thước / khối lượng
                  </label>
                  <select id="dimsConfidence" name="dimsConfidence" value={confText} onChange={(e) => setConfText(e.target.value)} className={adminInput}>
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
                  Mã SKU <span className="font-normal text-lien-muted">(THƯƠNG HIỆU-DANH MỤC-YYMM-MÃ SP)</span>
                </label>
                <input id="sku" name="sku" value={skuText} onChange={(e) => setSkuText(e.target.value.toUpperCase())} placeholder={skuSuggestion ?? "VD: LION-TM-2609-0173"} className={cn(adminInput, "font-mono uppercase")} />
                {skuSuggestion && skuText !== skuSuggestion ? (
                  <button type="button" onClick={() => setSkuText(skuSuggestion)} className="mt-1 text-[12px] text-lien-blue hover:underline">
                    Dùng mã đề xuất {skuSuggestion}
                  </button>
                ) : null}
              </div>
              <div>
                <label className={adminLabel} htmlFor="fulfillment">
                  Hình thức
                </label>
                <select id="fulfillment" name="fulfillment" defaultValue={product?.fulfillment ?? (product?.stock !== null && product?.stock !== undefined ? "stock" : "order")} className={adminInput}>
                  <option value="stock">Lưu kho — có sẵn tại kho Việt Nam</option>
                  <option value="order">Order — mua tại Nhật khi có đơn (khách thanh toán trước)</option>
                </select>
              </div>
              <div>
                <label className={adminLabel} htmlFor="stock">
                  Trạng thái tồn kho — số lượng <span className="font-normal text-lien-muted">(để trống = không theo dõi)</span>
                </label>
                <input id="stock" name="stock" inputMode="numeric" defaultValue={product?.stock ?? ""} className={cn(adminInput, fields.stock && "border-red-500")} />
                <FieldError msg={fields.stock} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="sale_status">
                  Tình trạng bán
                </label>
                <select id="sale_status" name="sale_status" defaultValue={product?.stockStatus === "discontinued" ? "discontinued" : "instock"} className={adminInput}>
                  <option value="instock">Còn bán — Có sẵn khi tồn kho &gt; 0, ngược lại là Hàng order</option>
                  <option value="discontinued">Hết hàng — mẫu này không còn bán tại Nhật (khách không đặt được)</option>
                </select>
              </div>
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
