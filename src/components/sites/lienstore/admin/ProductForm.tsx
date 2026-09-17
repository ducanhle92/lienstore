"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { deleteProductAction, saveProductAction, type ProductFormState } from "@/app/admin/products/actions";
import { DEFAULT_PRICING, effectiveMarginPct, type PricingConfig, suggestPrice } from "@/lib/pricing";
import { costSourceLabel, landedFeeJpy, type SourceFees, sourceFeeLines, sourceFromUrl } from "@/lib/cost-sources";
import { htmlToPlain, isSimpleHtml } from "@/lib/plain-html";
import { suggestStandardStock } from "@/lib/stock-advice";
import { expectedPriceOf, PRODUCT_CHANGE_FIELDS, priceView, promoPriceOf, storedPrices } from "@/lib/price-display";
import { formatDateTime } from "@/lib/format";
import type { ProductChange } from "@/lib/db";
import { CostSourcesEditor } from "./CostSourcesEditor";
import { InfoPopover } from "./InfoPopover";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { billableProductWeightG, isDimsConfidence, LEG_LABEL, type ShippingQuoteConfig } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import type { CatalogProduct, CostSource, ProductGroup, PurchaseSource, ShopCategory } from "@/types/shop";
import { purchaseSourceName } from "@/lib/purchase-sources";
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
  /** Variant families to pick from (Kho hàng › Nhóm biến thể). */
  groups?: ProductGroup[];
  /** Purchase-source registry (Kho hàng › Nguồn nhập). */
  sources?: PurchaseSource[];
  /** Units sold per month, oldest first (existing products) — the buying trend behind "Hàng order → Lưu kho". */
  monthlySales?: Array<{ month: string; units: number }>;
  /** Change history (newest first) for the "Lịch sử thay đổi" card. */
  changes?: ProductChange[];
}

const digits = (s: string) => Number.parseInt(s.replace(/[^\d]/g, ""), 10);

/** Profit per unit + margin % for the live hint under the cost field. */
function computeMargin(priceText: string, costText: string): { profit: number; pct: number } | null {
  const price = digits(priceText);
  const cost = digits(costText);
  if (!Number.isFinite(price) || !Number.isFinite(cost) || price <= 0) return null;
  return { profit: price - cost, pct: Math.round(((price - cost) / price) * 1000) / 10 };
}

/**
 * Textarea the owner fills in natural language; the server wraps paragraphs in <p>. Content that already has richer
 * HTML (links, bold…) is shown as-is so nothing is lost — with a note.
 */
function PlainTextField({ id, name, initialHtml, rows, placeholder }: { id: string; name: string; initialHtml: string; rows: number; placeholder?: string }) {
  const simple = isSimpleHtml(initialHtml);
  return (
    <>
      <textarea id={id} name={name} rows={rows} defaultValue={simple ? htmlToPlain(initialHtml) : initialHtml} placeholder={placeholder} className={cn(adminInput, !simple && "font-mono text-[12px]")} />
      {!simple ? <p className="mt-1 text-[11px] text-lien-muted">Nội dung này có định dạng HTML (link, chữ đậm…), giữ nguyên để không mất định dạng.</p> : null}
    </>
  );
}

/** Card that starts folded: the title row shows a one-line summary; click to open and edit. */
function FoldCard({ title, summary, open, children, testId, info }: { title: string; summary: string; open?: boolean; children: React.ReactNode; testId?: string; info?: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-[#e5e7eb] bg-white shadow-sm" open={open} data-testid={testId}>
      <summary className="flex cursor-pointer select-none flex-wrap items-baseline gap-x-2 px-5 py-3 text-[15px] font-semibold leading-6 text-lien-heading">
        {title}
        {info ? <InfoPopover>{info}</InfoPopover> : null}
        <span className="text-[13px] font-normal text-lien-muted">— {summary}</span>
        <span className="ml-auto text-[12px] font-normal text-lien-blue">bấm để mở</span>
      </summary>
      <div className="border-t border-[#e5e7eb] p-5">{children}</div>
    </details>
  );
}

/** Numbered block inside the "Bán hàng" card: a heading, an ⓘ with the explanation, then the fields. */
function Section({ n, title, info, children, testId }: { n: number; title: string; info?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <section className="rounded-md border border-[#e5e7eb] p-3" data-testid={testId}>
      <h3 className="m-0 mb-3 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide text-lien-heading">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lien-blue text-[11px] text-white">{n}</span>
        {title}
        {info ? <InfoPopover>{info}</InfoPopover> : null}
      </h3>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-[12px] leading-4 text-red-600">{msg}</p> : null;
}

export function ProductForm({ product, categories, quote, pricing, skuSuggestion, costSources = [], defaultSource = "amazon", groups = [], sources = [], monthlySales = [], changes = [] }: ProductFormProps) {
  const [groupSel, setGroupSel] = useState<string>(product?.groupId ? String(product.groupId) : "");
  const [editSlug, setEditSlug] = useState(false);
  const [stockMode, setStockMode] = useState<"order" | "stock">(product ? (product.stock !== null || product.fulfillment === "stock" ? "stock" : "order") : "order");
  const [minStockText, setMinStockText] = useState(product?.minStock === null || product?.minStock === undefined ? "" : String(product.minStock));
  const advice = suggestStandardStock(monthlySales);
  const maxMonth = Math.max(1, ...monthlySales.map((m) => m.units));
  const [newLabels, setNewLabels] = useState("");
  const selGroup = groups.find((g) => String(g.id) === groupSel) ?? null;
  const groupSummary = groupSel === "new" ? "đang tạo nhóm mới" : selGroup ? `${selGroup.name}${Object.values(product?.variantAttrs ?? {}).length ? ` · ${Object.values(product?.variantAttrs ?? {}).join(" · ")}` : ""}` : "sản phẩm độc lập";
  const groupLabels = groupSel === "new" ? newLabels.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3) : (selGroup?.attrLabels ?? []);
  // rows of the ¥ editor: saved sources, or the legacy single price of the product
  const costDrafts = costSources.length ? costSources.map((c) => ({ source: c.source, priceJpy: String(c.priceJpy), url: c.url, checkedAt: c.checkedAt ?? undefined })) : product?.costJpy ? [{ source: product.costSource || sourceFromUrl(product.costUrl), priceJpy: String(product.costJpy), url: product.costUrl, checkedAt: product.costCheckedAt ?? undefined }] : [];
  const costPrimary = Math.max(0, costDrafts.findIndex((c) => product?.costJpy !== null && product?.costJpy !== undefined && Number(c.priceJpy) === product.costJpy && (!product.costSource || c.source === product.costSource)));
  const [state, action, pending] = useActionState<ProductFormState, FormData>(saveProductAction, null);
  // three prices: expected web price (required) · promo (charged while set) · market reference
  const [priceText, setPriceText] = useState(product ? String(expectedPriceOf(product)) : "");
  const [promoText, setPromoText] = useState(product ? String(promoPriceOf(product) ?? "") : "");
  const [marketText, setMarketText] = useState(String(product?.marketPrice ?? ""));
  const [costText, setCostText] = useState(String(product?.costPrice ?? ""));
  const [skuText, setSkuText] = useState(product?.sku ?? "");
  const [marginText, setMarginText] = useState(product?.marginPct === null || product?.marginPct === undefined ? "" : String(product.marginPct));
  const [weightText, setWeightText] = useState(String(product?.weightG ?? ""));
  const [dimsText, setDimsText] = useState(product?.dimsCm ?? "");
  const [confText, setConfText] = useState(product?.dimsConfidence ?? "");
  const [catSlugs, setCatSlugs] = useState<string[]>(product?.categories ?? []);
  const defaultMargin = pricing ? effectiveMarginPct(pricing, null, catSlugs) : 25;
  const [primaryJpy, setPrimaryJpy] = useState<number | null>(product?.costJpy ?? null);
  const [primarySource, setPrimarySource] = useState<string>(product?.costSource ?? "");
  const stored = storedPrices(Number.isFinite(digits(priceText)) ? digits(priceText) : 0, Number.isFinite(digits(promoText)) ? digits(promoText) : null);
  const preview = priceView({ ...stored, marketPrice: Number.isFinite(digits(marketText)) ? digits(marketText) : null });
  const margin = computeMargin(String(stored.price), costText);
  const costNum = digits(costText);
  const rate = quote?.jpyRate ?? 0;
  const sourceFees: SourceFees = Object.fromEntries(sources.filter((s) => s.fees.length).map((s) => [s.key, s.fees]));
  const lotWeightGForFees = pricing?.lotWeightG ?? DEFAULT_PRICING.lotWeightG;
  /** Billable grams of this item for weight-based surcharges (same rule as shipping). */
  const billableForFees = billableProductWeightG(Number.isFinite(digits(weightText)) ? digits(weightText) : null, dimsText || null, isDimsConfidence(confText) ? confText : null);
  /** Surcharges of the chosen source for this item (Nguồn nhập › Phụ phí) — part of the landed ¥. */
  const primaryFee = landedFeeJpy(primarySource, sourceFees, billableForFees, lotWeightGForFees);
  const primaryFeeLines = sourceFeeLines(primarySource, sourceFees, billableForFees, lotWeightGForFees);
  /** Giá vốn VNĐ from the chosen ¥ quote (+ source surcharge) at today's rate. */
  const costFromJpy = primaryJpy && rate ? Math.round((primaryJpy + primaryFee) * rate) : null;
  const recalcCost = () => {
    if (costFromJpy) setCostText(String(costFromJpy));
    return costFromJpy;
  };
  /** "Tính lại giá kỳ vọng": refresh the VND cost from the chosen ¥ source; the expected-price box recomputes from it and the margin. */
  const recalcPrice = () => {
    recalcCost();
  };
  const suggestion =
    quote && pricing
      ? suggestPrice(
          { costPrice: Number.isFinite(costNum) ? costNum : null, weightG: Number.isFinite(digits(weightText)) ? digits(weightText) : null, dimsCm: dimsText || null, dimsConfidence: isDimsConfidence(confText) ? confText : null, marginPct: marginText.trim() === "" ? null : Number.parseFloat(marginText.replace(",", ".")), categories: catSlugs },
          quote,
          pricing,
        )
      : null;
  // for the "?" explanations on the expected-price breakdown (how each row was computed)
  const lotWeightG = pricing?.lotWeightG ?? DEFAULT_PRICING.lotWeightG;
  const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
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
            {/* the rest of the basics (URL, descriptions, Japanese copy, variant family) folds away — the name pair is what one edits most */}
            <details className="rounded-md border border-[#e5e7eb] open:bg-[#fafafa]" open={editSlug || !!fields.slug || !product} data-testid="fold-basic-more">
              <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-semibold text-lien-heading">
                Đường dẫn, mô tả & nội dung <span className="font-normal text-lien-muted">— bấm để mở</span>
              </summary>
              <div className="grid gap-4 border-t border-[#e5e7eb] p-3">
              {/* the URL is generated from the name; an existing product keeps its URL unless the owner deliberately changes it */}
              <div className="text-[12px] text-lien-muted">
                {editSlug || fields.slug ? (
                  <>
                    <label className={adminLabel} htmlFor="slug">
                      Đường dẫn (tự sinh từ tên — chỉ sửa khi thật cần)
                    </label>
                    <input id="slug" name="slug" defaultValue={product?.slug} placeholder="Để trống để tạo tự động từ tên" className={cn(adminInput, fields.slug && "border-red-500")} />
                    <FieldError msg={fields.slug} />
                  </>
                ) : (
                  <>
                    {product ? <input type="hidden" name="slug" value={product.slug} readOnly /> : null}
                    Đường dẫn: <span className="font-mono">/product/{product?.slug ?? "…"}/</span> — tự sinh từ tên sản phẩm.{" "}
                    <button type="button" onClick={() => setEditSlug(true)} className="text-lien-blue hover:underline">
                      Đổi
                    </button>
                  </>
                )}
              </div>
              <div>
                <label className={adminLabel} htmlFor="shortDescription">
                  Mô tả ngắn <span className="font-normal text-lien-muted">— 1–2 câu, viết thường như nói với khách</span>
                </label>
                <PlainTextField id="shortDescription" name="shortDescription" initialHtml={product?.shortDescription ?? ""} rows={3} placeholder="VD: Viên uống vitamin nhóm B của Nhật, hỗ trợ giảm mụn và da sần từ bên trong." />
              </div>
              <details className="rounded-md border border-[#e5e7eb] open:bg-[#fafafa]" data-testid="desc-vi">
                <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-semibold text-lien-heading">
                  Mô tả chi tiết <span className="font-normal text-lien-muted">— bấm để mở: giới thiệu, thông tin nhanh, công dụng, thành phần, cách dùng, lưu ý</span>
                </summary>
                <div className="border-t border-[#e5e7eb] p-3">
                  <DescriptionEditor name="description" lang="vi" initialHtml={product?.description ?? ""} productName={product?.name} />
                </div>
              </details>
              <details className="rounded-md border border-[#e5e7eb] open:bg-[#fafafa]" data-testid="desc-ja">
                <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-semibold text-lien-heading">
                  Nội dung tiếng Nhật <span className="font-normal text-lien-muted">— bấm để mở; để trống thì khách chọn 日本語 vẫn thấy bản tiếng Việt</span>
                </summary>
                <div className="grid gap-4 border-t border-[#e5e7eb] p-3">
                  <div>
                    <label className={adminLabel} htmlFor="shortDescriptionJa">
                      Mô tả ngắn tiếng Nhật <span className="font-normal text-lien-muted">— viết thường, 1–2 câu</span>
                    </label>
                    <PlainTextField id="shortDescriptionJa" name="shortDescriptionJa" initialHtml={product?.shortDescriptionJa ?? ""} rows={2} placeholder="例: 肌あれ・にきびを体の内側からケアするビタミン剤です。" />
                  </div>
                  <div>
                    <p className={adminLabel}>Mô tả chi tiết tiếng Nhật</p>
                    <DescriptionEditor name="descriptionJa" lang="ja" initialHtml={product?.descriptionJa ?? ""} productName={product?.nameJa || product?.name} />
                  </div>
                </div>
              </details>
              </div>
            </details>
            <details className="rounded-md border border-[#e5e7eb] open:bg-[#fafafa]" open={groupSel === "new"} data-testid="fold-group">
              <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-semibold text-lien-heading">
                Nhóm biến thể <span className="font-normal text-lien-muted">— {groupSummary} · bấm để mở</span>
              </summary>
              <div className="border-t border-[#e5e7eb] p-3">
            <div className="grid gap-3">
              <div>
                <label className={adminLabel} htmlFor="groupId">
                  Thuộc dòng sản phẩm <span className="font-normal text-lien-muted">(cùng loại, chỉ khác vị / dung tích / số viên…)</span>
                </label>
                <select id="groupId" name="groupId" value={groupSel} onChange={(e) => setGroupSel(e.target.value)} className={adminInput}>
                  <option value="">— Sản phẩm độc lập —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.attrLabels.length ? ` (${g.attrLabels.join(", ")})` : ""}
                    </option>
                  ))}
                  <option value="new">+ Tạo nhóm mới…</option>
                </select>
              </div>
              {groupSel === "new" ? (
                <>
                  <div>
                    <label className={adminLabel} htmlFor="groupName">
                      Tên chung của nhóm
                    </label>
                    <input id="groupName" name="groupName" placeholder="VD: SAVAS Whey Protein 100" className={adminInput} />
                  </div>
                  <div>
                    <label className={adminLabel} htmlFor="groupAttrLabels">
                      Thuộc tính phân biệt <span className="font-normal text-lien-muted">(cha → con, tối đa 4, cách nhau dấu phẩy; để trống = “Loại”)</span>
                    </label>
                    <input id="groupAttrLabels" name="groupAttrLabels" value={newLabels} onChange={(e) => setNewLabels(e.target.value)} placeholder="VD: Vị, Khối lượng" className={adminInput} />
                  </div>
                </>
              ) : null}
              {groupSel ? (
                <>
                  {groupLabels.map((label, i) => (
                    <div key={label}>
                      <label className={adminLabel} htmlFor={`variant_${i}`}>
                        {label} <span className="font-normal text-lien-muted">của sản phẩm này</span>
                      </label>
                      <input id={`variant_${i}`} name={`variant_${i}`} defaultValue={product?.variantAttrs[label] ?? ""} placeholder={label === "Vị" ? "VD: Dâu" : label} className={adminInput} />
                    </div>
                  ))}
                  <div>
                    <label className={adminLabel} htmlFor="variantPosition">
                      Thứ tự trong nhóm <span className="font-normal text-lien-muted">(nhỏ nhất = thẻ đại diện ngoài kệ)</span>
                    </label>
                    <input id="variantPosition" name="variantPosition" inputMode="numeric" defaultValue={product?.variantPosition ?? 0} className={adminInput} />
                  </div>
                  {selGroup ? (
                    <p className="m-0 text-[12px] text-lien-muted">
                      <Link href={`/admin/products/groups/${selGroup.id}/`} className="text-lien-blue hover:underline">
                        Xem / sửa cả nhóm →
                      </Link>
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="m-0 text-[12px] leading-5 text-lien-muted">Ngoài kệ mỗi nhóm chỉ hiện một thẻ “N lựa chọn”; trong trang sản phẩm khách bấm chip để đổi loại. Ảnh, giá, SKU, mô tả vẫn riêng cho từng biến thể.</p>
              )}
            </div>
              </div>
            </details>
          </div>
          </Card>

          <FoldCard title="Danh mục *" summary={catSlugs.length ? catSlugs.map((slug) => categories.find((c) => c.slug === slug)?.name ?? slug).join(", ") : "chưa chọn"} open={!!fields.categories || !product} testId="fold-categories">
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
          </FoldCard>

          <FoldCard title="Từ khóa" summary={product?.tags.length ? `${product.tags.length} từ khoá: ${product.tags.slice(0, 4).join(", ")}${product.tags.length > 4 ? "…" : ""}` : "chưa có"} testId="fold-tags">
            <label className={adminLabel} htmlFor="tags">
              Cách nhau bằng dấu phẩy <span className="font-normal text-lien-muted">— dùng để tìm kiếm; khách chỉ thấy từ khoá tiếng Việt</span>
            </label>
            <input id="tags" name="tags" defaultValue={product?.tags.join(", ")} className={adminInput} />
          </FoldCard>

          <Card title="Hình ảnh">
            <ProductImageManager
              initial={product?.images ?? []}
              initialThumbs={product?.thumb && product.images[0] ? { [product.images[0]]: product.thumb } : {}}
              error={fields.images}
            />
          </Card>

          {product ? (
            <FoldCard title="Xu hướng mua" summary={advice.avgPerMonth > 0 ? `TB ${advice.avgPerMonth.toLocaleString("vi-VN")} đv/tháng · ${advice.total} đv/${monthlySales.length} tháng${advice.suggested ? ` · nên lưu kho ≈ ${advice.suggested}` : ""}` : `chưa có đơn trong ${monthlySales.length} tháng`} testId="fold-trend">
                <div className="rounded-md border border-[#e5e7eb] bg-[#fafafa] p-2.5 text-[12px] leading-5" data-testid="sales-trend">
                  <p className="m-0 font-semibold text-lien-heading">Xu hướng mua {monthlySales.length} tháng gần đây</p>
                  <div className="mt-1.5 flex h-12 items-end gap-1" aria-hidden>
                    {monthlySales.map((m) => (
                      <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-0.5" title={`${m.month}: ${m.units} đv`}>
                        <span className="text-[10px] leading-3 text-lien-muted">{m.units || ""}</span>
                        <div className={cn("w-full rounded-t", m.units ? "bg-lien-blue" : "bg-[#e5e7eb]")} style={{ height: `${Math.max(3, Math.round((m.units / maxMonth) * 32))}px` }} />
                        <span className="text-[10px] leading-3 text-lien-muted">{m.month.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="m-0 mt-1.5 text-lien-text">
                    {advice.avgPerMonth > 0 ? (
                      <>
                        Bán trung bình <strong>{advice.avgPerMonth.toLocaleString("vi-VN")}</strong> đv/tháng ({advice.total} đv/{monthlySales.length} tháng).{" "}
                        {advice.suggested > 0 ? (
                          <>
                            Nên <strong>lưu kho ≈ {advice.suggested}</strong> đv (đủ bán ~{advice.coverMonths} tháng).{" "}
                            <button
                              type="button"
                              onClick={() => {
                                setStockMode("stock");
                                setMinStockText(String(advice.suggested));
                              }}
                              className="rounded border border-lien-blue px-1.5 py-0.5 text-[11px] font-semibold text-lien-blue hover:bg-lien-blue-soft"
                              data-testid="use-advice"
                            >
                              Dùng mức này
                            </button>
                          </>
                        ) : (
                          "Bán chưa đều — giữ Hàng order là hợp lý."
                        )}
                      </>
                    ) : (
                      "Chưa có đơn nào trong giai đoạn này — giữ Hàng order, chưa cần lưu kho."
                    )}
                  </p>
                </div>
            </FoldCard>
          ) : null}

          {product ? (
            <FoldCard title="Lịch sử thay đổi" summary={changes.length ? `${changes.length} lần đổi gần đây · mới nhất ${formatDateTime(changes[0].createdAt)} (${changes[0].actor || "—"})` : "chưa có thay đổi nào được ghi"} testId="fold-history">
              {changes.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-[13px]">
                    <thead>
                      <tr className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
                        <th className="px-2 py-1.5">Lúc</th>
                        <th className="px-2 py-1.5">Ai</th>
                        <th className="px-2 py-1.5">Thay đổi</th>
                        <th className="px-2 py-1.5">Từ</th>
                        <th className="px-2 py-1.5">Thành</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((c) => (
                        <tr key={c.id} className="border-t border-[#f0f0f0]">
                          <td className="whitespace-nowrap px-2 py-1.5 text-lien-muted">{formatDateTime(c.createdAt)}</td>
                          <td className="whitespace-nowrap px-2 py-1.5">{c.actor || "—"}</td>
                          <td className="px-2 py-1.5 font-semibold text-lien-heading">{PRODUCT_CHANGE_FIELDS[c.field] ?? c.field}</td>
                          <td className="px-2 py-1.5 text-lien-muted">{c.oldValue || "—"}</td>
                          <td className="px-2 py-1.5">{c.newValue || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="m-0 text-[13px] text-lien-muted">Từ bản này, mỗi lần đổi giá bán, giá thị trường, giá vốn, tồn kho, trạng thái… đều được ghi lại kèm người / hệ thống thực hiện.</p>
              )}
            </FoldCard>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card title="Bán hàng">
            <div className="grid gap-4">
              <Section n={1} title="Giá bán cho khách" info={<>Giá thị trường là giá đối chiếu (nơi khác bán) — luôn là giá bị gạch trên web, kèm % rẻ hơn. Giá kỳ vọng là giá bán bình thường (tính theo công thức bên dưới). Khi chạy khuyến mại, khách trả giá khuyến mại thay cho giá kỳ vọng; giá gạch vẫn là giá thị trường nên không có chuyện “tăng rồi giảm”.</>} testId="sec-price">
              <div className="grid gap-3" data-testid="price-trio">
                <div>
                  <label className={adminLabel} htmlFor="expectedPrice">
                    Giá kỳ vọng bán ra trên website (VNĐ) *
                  </label>
                  <input id="expectedPrice" name="expectedPrice" inputMode="numeric" value={priceText} onChange={(e) => setPriceText(e.target.value)} required className={cn(adminInput, fields.price && "border-red-500")} />
                  <FieldError msg={fields.price} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={adminLabel} htmlFor="marketPrice">
                      Giá thị trường <span className="font-normal text-lien-muted">(giá đối chiếu — luôn là giá bị gạch)</span>
                    </label>
                    <input id="marketPrice" name="marketPrice" inputMode="numeric" value={marketText} onChange={(e) => setMarketText(e.target.value)} placeholder="giá nơi khác bán" className={cn(adminInput, fields.marketPrice && "border-red-500")} />
                    <FieldError msg={fields.marketPrice} />
                  </div>
                  <div>
                    <label className={adminLabel} htmlFor="promoPrice">
                      Giá khuyến mại <span className="font-normal text-lien-muted">(khi có chương trình; cao/thấp hơn kỳ vọng đều được)</span>
                    </label>
                    <input id="promoPrice" name="promoPrice" inputMode="numeric" value={promoText} onChange={(e) => setPromoText(e.target.value)} placeholder="trống = không KM" className={cn(adminInput, fields.promoPrice && "border-red-500")} />
                    <FieldError msg={fields.promoPrice} />
                  </div>
                </div>
                <p className="m-0 text-[12px] leading-5 text-lien-text" data-testid="price-preview">
                  Khách thấy:{" "}
                  {preview.current > 0 ? (
                    <>
                      {preview.strike ? <del className="text-lien-muted">{preview.strike.toLocaleString("vi-VN")}đ</del> : null} <strong className={preview.strike ? "text-lien-sale-text" : "text-lien-heading"}>{preview.current.toLocaleString("vi-VN")}đ</strong>
                      {preview.pct ? <span className="ml-1 rounded bg-lien-sale px-1 text-[11px] font-bold text-white">-{preview.pct}%</span> : null}
                      <span className="ml-1 text-lien-muted">{preview.kind === "market" ? `— gạch giá thị trường${stored.regularPrice ? ", đang khuyến mại" : ""}` : preview.kind === "promo" ? "— chưa có giá thị trường: gạch giá kỳ vọng" : stored.regularPrice ? "— đang khuyến mại, chưa có giá thị trường để gạch" : "— không gạch giá"}</span>
                    </>
                  ) : (
                    <span className="text-lien-muted">Liên hệ (chưa có giá)</span>
                  )}
                </p>
              </div>
              </Section>
              <Section n={2} title="Giá vốn — mua tại Nhật" info="Mỗi nguồn kèm giá ¥ và link mua; nút tròn = giá dùng làm giá vốn. Giá vốn VNĐ = (¥ + phụ phí của nguồn) × tỉ giá, hệ thống cũng tính lại mỗi đêm theo tỉ giá." testId="sec-cost">
              <div>
                <label className={adminLabel}>Giá vốn (円 — giá tại Nhật) theo nguồn mua</label>
                <CostSourcesEditor
                  initial={costDrafts}
                  primaryIndex={costPrimary}
                  defaultSource={defaultSource}
                  sources={sources}
                  fees={sourceFees}
                  billableG={billableForFees}
                  lotWeightG={lotWeightGForFees}
                  error={fields.costJpy}
                  onPrimaryChange={(p) => {
                    setPrimaryJpy(p?.priceJpy ?? null);
                    setPrimarySource(p?.source ?? "");
                  }}
                />
                <p className="mt-1 text-[12px] leading-4 text-lien-muted">
                  {product?.costSource ? `Nguồn hiện tại: ${sources.length ? purchaseSourceName(product.costSource, sources) : costSourceLabel(product.costSource)}${product.costCheckedAt ? ` · ${product.costCheckedAt.slice(0, 10)}` : ""}.` : "Chọn nguồn và giá ¥; nút tròn = giá dùng làm giá vốn."}{" "}
                  <Link href="/admin/products/sources/" className="text-lien-blue hover:underline">
                    Nguồn nhập
                  </Link>
                  <InfoPopover>
                    Mỗi nguồn kèm link mua (thay cho ô link nhà cung cấp); chưa rõ mua ở đâu thì chọn “Chưa xác định — thêm sau”. Thêm cửa hàng / sàn mới ở Nguồn nhập. Nút tròn chọn giá dùng làm giá vốn; đổi nguồn xong bấm &quot;Tính lại giá vốn&quot; bên dưới (mỗi đêm hệ thống cũng tính lại theo tỉ giá).
                  </InfoPopover>
                </p>
              </div>
              <div>
                <label className={adminLabel} htmlFor="costPrice">
                  Giá vốn (VNĐ) <span className="font-normal text-lien-muted">(tự tính từ ¥ nếu để trống)</span>
                </label>
                <div className="flex gap-2">
                  <input id="costPrice" name="costPrice" inputMode="numeric" value={costText} onChange={(e) => setCostText(e.target.value)} placeholder="Chỉ hiển thị trong quản trị" className={cn(adminInput, "!mb-0 flex-1", fields.costPrice && "border-red-500")} />
                  <button type="button" onClick={recalcCost} disabled={!costFromJpy} title={costFromJpy ? `(${primaryJpy?.toLocaleString("vi-VN")}¥${primaryFee ? ` + ${primaryFee.toLocaleString("vi-VN")}¥ phụ phí nguồn` : ""}) × ${rate.toLocaleString("vi-VN")} = ${costFromJpy.toLocaleString("vi-VN")}đ` : "Chọn một nguồn có giá ¥ trước"} className="shrink-0 rounded-md border border-lien-blue px-2.5 py-1.5 text-[12px] font-semibold text-lien-blue hover:bg-lien-blue-soft disabled:opacity-50" data-testid="recalc-cost">
                    <Fa name="refresh" /> Tính lại giá vốn
                  </button>
                </div>
                <FieldError msg={fields.costPrice} />
                {costFromJpy && Number.isFinite(costNum) && costNum !== costFromJpy ? (
                  <p className="mt-1 text-[12px] text-amber-700">
                    Theo nguồn đã chọn: {costFromJpy.toLocaleString("vi-VN")}đ ({primaryJpy?.toLocaleString("vi-VN")}¥{primaryFee ? ` + ${primaryFee.toLocaleString("vi-VN")}¥ phụ phí` : ""} × {rate.toLocaleString("vi-VN")}) — bấm &quot;Tính lại giá vốn&quot; để cập nhật.
                  </p>
                ) : null}
                {primaryFee ? (
                  <p className="mt-1 text-[12px] text-lien-muted">
                    Phụ phí nguồn cho sản phẩm này: {primaryFee.toLocaleString("vi-VN")}¥ ({primaryFeeLines.map((l) => `${l.label}: ${l.how}`).join("; ")}) — đã cộng vào giá vốn.
                  </p>
                ) : null}
                {margin ? (
                  <p className={cn("mt-1 text-[12px] leading-4", margin.profit >= 0 ? "text-green-700" : "text-red-600")}>
                    Lợi nhuận/sp: {margin.profit.toLocaleString("vi-VN")}đ ({margin.pct}%)
                  </p>
                ) : null}
              </div>
              </Section>
              <Section n={3} title="Tỉ lệ lãi & giá kỳ vọng" info="Giá kỳ vọng = giá vốn × (1 + tỉ lệ lãi) + phí vận chuyển ba chặng về kho VN, làm tròn theo Công thức giá. Bấm “Dùng giá này” để đưa vào ô Giá kỳ vọng bán ra ở mục 1." testId="sec-margin">
              <div>
                <label className={adminLabel} htmlFor="marginPct">
                  Tỉ lệ lãi kỳ vọng (%){" "}
                  <span className="font-normal text-lien-muted">{marginText.trim() === "" ? `— đang dùng ${defaultMargin}% ${pricing && defaultMargin !== pricing.marginPct ? "theo danh mục" : "mặc định của shop"}; sửa số để đặt riêng cho sản phẩm` : "— tỉ lệ riêng của sản phẩm"}</span>
                </label>
                {/* the hidden field carries the override ("" = follow category / shop default); the visible box always shows the number in force */}
                <input type="hidden" name="marginPct" value={marginText} readOnly />
                <div className="flex items-center gap-2">
                  <input id="marginPct" inputMode="decimal" value={marginText} onChange={(e) => setMarginText(e.target.value)} placeholder={String(defaultMargin)} className={cn(adminInput, "!mb-0 !w-[120px]", fields.marginPct && "border-red-500", !fields.marginPct && marginText.trim() !== "" && "border-lien-blue font-semibold")} data-testid="margin-input" />
                  {marginText.trim() !== "" ? (
                    <button type="button" onClick={() => setMarginText("")} className="text-[12px] text-lien-muted underline hover:text-lien-blue" data-testid="margin-reset">
                      Bỏ tỉ lệ riêng, theo {defaultMargin}%
                    </button>
                  ) : null}
                  <span className="text-[12px] text-lien-muted">Bấm &quot;Lưu thay đổi&quot; để ghi. Nhập từ 0 đến 500.</span>
                </div>
                <FieldError msg={fields.marginPct} />
                {suggestion ? (
                  <div className="mt-3 rounded-md border border-lien-blue/30 bg-lien-blue-soft/60 p-2.5 text-[12px] leading-5 text-lien-text" data-testid="expected-box">
                    <p className="m-0 font-semibold text-lien-heading">
                      Giá kỳ vọng bán ra trên website: <span data-testid="expected-price">{suggestion.suggested.toLocaleString("vi-VN")}đ</span>
                      {digits(priceText) === suggestion.suggested ? <span className="ml-1 font-normal text-green-700">✓ đang dùng</span> : null}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <button type="button" onClick={recalcPrice} className="rounded border border-lien-blue px-2 py-0.5 text-[11px] font-semibold text-lien-blue hover:bg-lien-blue-soft" title="Tính lại giá vốn từ nguồn ¥ đã chọn và giá kỳ vọng theo tỉ lệ lãi hiện tại" data-testid="recalc-price">
                        <Fa name="refresh" /> Tính lại giá kỳ vọng
                      </button>
                      <button type="button" onClick={() => setPriceText(String(suggestion.suggested))} disabled={digits(priceText) === suggestion.suggested} className="rounded bg-lien-blue px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-lien-blue-hover disabled:opacity-50" data-testid="use-expected">
                        <Fa name="check" /> Dùng giá này
                      </button>
                    </div>
                    <table className="mt-2 w-full border-collapse text-[12px]" data-testid="expected-breakdown">
                      <tbody>
                        <tr>
                          <td className="py-0.5 pr-2 text-lien-muted">
                            Giá vốn tại Nhật (¥ → VNĐ)
                            <InfoPopover>
                              {primaryJpy && costFromJpy ? (
                                <>
                                  ({primaryJpy.toLocaleString("vi-VN")}¥{primaryFee ? ` + ${primaryFee.toLocaleString("vi-VN")}¥ phụ phí nguồn` : ""}) × {rate.toLocaleString("vi-VN")}đ/¥ = <strong>{vnd(costFromJpy)}</strong>
                                  {suggestion.cost !== costFromJpy ? <> (đang sửa tay: {vnd(suggestion.cost)})</> : null}
                                </>
                              ) : (
                                <>Nhập tay: {vnd(suggestion.cost)} (chưa chọn nguồn ¥).</>
                              )}
                            </InfoPopover>
                          </td>
                          <td className="py-0.5 text-right font-medium text-lien-heading">{suggestion.cost.toLocaleString("vi-VN")}đ</td>
                        </tr>
                        {primaryFee ? (
                          <tr>
                            <td className="py-0.5 pr-2 pl-3 text-[11px] text-lien-muted">
                              trong đó phụ phí nguồn ({primaryFee.toLocaleString("vi-VN")}¥)
                              <InfoPopover>
                                {primaryFeeLines.map((l) => (
                                  <span key={l.label} className="block">
                                    <strong>{l.label}</strong>: {l.how} = {Math.round(l.jpy).toLocaleString("vi-VN")}¥
                                  </span>
                                ))}
                                Cân tính phí của sản phẩm: {billableForFees.toLocaleString("vi-VN")} g · × {rate.toLocaleString("vi-VN")}đ/¥ = <strong>{vnd(primaryFee * rate)}</strong>
                              </InfoPopover>
                            </td>
                            <td className="py-0.5 text-right text-[11px] text-lien-muted">{vnd(primaryFee * rate)}</td>
                          </tr>
                        ) : null}
                        <tr>
                          <td className="py-0.5 pr-2 text-lien-muted">
                            Tỉ lệ lợi nhuận kỳ vọng
                            <InfoPopover>
                              {marginText.trim() === "" ? (pricing && defaultMargin !== pricing.marginPct ? "Theo danh mục" : "Mặc định shop") : "Riêng sản phẩm này"}: {suggestion.marginPct}%. Chỉ nhân vào giá vốn, không nhân vào ship.
                            </InfoPopover>
                          </td>
                          <td className="py-0.5 text-right text-lien-text">{suggestion.marginPct}%</td>
                        </tr>
                        <tr className="border-t border-lien-blue/20">
                          <td className="py-0.5 pr-2 font-medium text-lien-text">
                            Lợi nhuận kỳ vọng (trên giá vốn tại Nhật)
                            <InfoPopover>
                              {vnd(suggestion.cost)} × {suggestion.marginPct}% = <strong>{vnd((suggestion.cost * suggestion.marginPct) / 100)}</strong>
                            </InfoPopover>
                          </td>
                          <td className="py-0.5 text-right font-medium text-lien-heading">{vnd((suggestion.cost * suggestion.marginPct) / 100)}</td>
                        </tr>
                        {(["jp_domestic", "jp_vn", "vn_transfer"] as const).map((leg) => {
                          const l = suggestion.legs.find((x) => x.leg === leg);
                          const pct = lotWeightG > 0 ? Math.round((suggestion.weightG / lotWeightG) * 1000) / 10 : 0;
                          return (
                            <tr key={leg}>
                              <td className="py-0.5 pr-2 text-lien-muted">
                                Phí {LEG_LABEL[leg]}
                                <InfoPopover>
                                  {l ? (
                                    <>
                                      <strong>{l.label}</strong>
                                      <br />
                                      {pct}% của lô ({suggestion.weightG.toLocaleString("vi-VN")}g/{(lotWeightG / 1000).toLocaleString("vi-VN")}kg) = <strong>{vnd(l.fee)}</strong>
                                    </>
                                  ) : (
                                    "Chưa có phương thức — tạm tính 0đ."
                                  )}
                                </InfoPopover>
                              </td>
                              <td className="py-0.5 text-right text-lien-text">{l ? `${l.fee.toLocaleString("vi-VN")}đ` : "— chưa có phương thức"}</td>
                            </tr>
                          );
                        })}
                        <tr className="border-t border-lien-blue/20">
                          <td className="py-0.5 pr-2 font-medium text-lien-text">
                            Tổng phí vận chuyển ({suggestion.weightG.toLocaleString("vi-VN")} g tính phí)
                            <InfoPopover>
                              {suggestion.legs.length ? suggestion.legs.map((l) => vnd(l.fee)).join(" + ") : "0đ"} = <strong>{vnd(suggestion.shipping)}</strong>
                            </InfoPopover>
                          </td>
                          <td className="py-0.5 text-right font-medium text-lien-heading">{suggestion.shipping.toLocaleString("vi-VN")}đ</td>
                        </tr>
                        <tr className="border-t border-lien-blue/20">
                          <td className="py-0.5 pr-2 font-semibold text-lien-heading">
                            Giá vốn về tới kho VN
                            <InfoPopover>
                              {vnd(suggestion.cost)} + {vnd(suggestion.shipping)} = <strong>{vnd(suggestion.landed)}</strong>
                            </InfoPopover>
                          </td>
                          <td className="py-0.5 text-right font-semibold text-lien-heading">{suggestion.landed.toLocaleString("vi-VN")}đ</td>
                        </tr>
                        <tr className="border-t border-lien-blue/30">
                          <td className="py-1 pr-2 font-semibold text-lien-heading">
                            Giá kỳ vọng bán ra trên website
                            <InfoPopover>
                              ({vnd(suggestion.cost)} × {(1 + suggestion.marginPct / 100).toLocaleString("vi-VN")}) + {vnd(suggestion.shipping)} = {vnd(Math.round(suggestion.raw))} → làm tròn {(pricing?.roundTo ?? DEFAULT_PRICING.roundTo).toLocaleString("vi-VN")}đ = <strong>{vnd(suggestion.suggested)}</strong>
                            </InfoPopover>
                          </td>
                          <td className="py-1 text-right font-semibold text-lien-heading">{suggestion.suggested.toLocaleString("vi-VN")}đ</td>
                        </tr>
                        <tr>
                          <td className={cn("py-0.5 pr-2 font-medium", suggestion.margin >= 0 ? "text-green-700" : "text-red-600")}>
                            Lợi nhuận kỳ vọng
                            <InfoPopover>
                              {vnd(suggestion.suggested)} − {vnd(suggestion.landed)} = <strong>{vnd(suggestion.margin)}</strong>
                              {suggestion.suggested > 0 ? ` (${(Math.round((suggestion.margin / suggestion.suggested) * 1000) / 10).toLocaleString("vi-VN")}%)` : null}
                            </InfoPopover>
                          </td>
                          <td className={cn("py-0.5 text-right font-medium", suggestion.margin >= 0 ? "text-green-700" : "text-red-600")}>{suggestion.margin.toLocaleString("vi-VN")}đ</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="m-0 mt-1.5 text-[11px] text-lien-muted">
                      Bấm <Fa name="info-circle" className="text-lien-blue/70" /> ở mỗi dòng để xem cách tính.
                    </p>
                  </div>
                ) : null}
              </div>
              </Section>
            </div>
          </Card>

          <FoldCard title="Kích thước & khối lượng" summary={`${weightText.trim() ? `${weightText} g` : "chưa có cân"} · ${dimsText.trim() ? `${dimsText} cm` : "chưa có kích thước"} · tin cậy ${confText === "high" ? "cao" : confText === "medium" ? "trung bình" : confText === "low" ? "thấp" : "chưa đánh giá"}`} info="Phí vận chuyển tính trên <strong>cân tính phí</strong> = max(cân thật, D×R×C/6000) × hệ số an toàn theo độ tin cậy (Cao ×1,2 · Trung bình ×1,5 · Thấp ×2), làm tròn lên từng kg. Khách chỉ thấy số đo khi độ tin cậy là Cao." testId="fold-dims">
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
            </div>
          </FoldCard>

          <FoldCard title="Mã SKU & trạng thái" summary={`${skuText || "chưa có SKU"} · ${product?.stockStatus === "discontinued" ? "Hết hàng" : "Còn bán"} · ${product?.status === "draft" ? "Bản nháp" : "Đang bán"}`} open={!product} testId="fold-status">
            <div className="grid gap-4">
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
          </FoldCard>

          <FoldCard title="Kho hàng" summary={stockMode === "stock" ? `Lưu kho · mức tiêu chuẩn ${minStockText || "?"}${product?.stock !== null && product?.stock !== undefined ? ` · tồn ${product.stock}` : ""}` : "Hàng order — mua tại Nhật khi có đơn"} testId="fold-stock">
            <div className="grid gap-3" data-testid="stock-mode">
              <label className={cn("flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-[13px] leading-5", stockMode === "order" ? "border-lien-blue bg-lien-blue-soft/40" : "border-[#e5e7eb]")}>
                <input type="radio" name="stockMode" value="order" checked={stockMode === "order"} onChange={() => setStockMode("order")} className="mt-1 h-4 w-4" />
                <span>
                  <strong className="text-lien-heading">Hàng order</strong> — mua tại Nhật khi có đơn, khách thanh toán trước. Không theo dõi tồn kho.
                </span>
              </label>
              <label className={cn("flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-[13px] leading-5", stockMode === "stock" ? "border-lien-blue bg-lien-blue-soft/40" : "border-[#e5e7eb]")}>
                <input type="radio" name="stockMode" value="stock" checked={stockMode === "stock"} onChange={() => setStockMode("stock")} className="mt-1 h-4 w-4" />
                <span>
                  <strong className="text-lien-heading">Lưu kho</strong> — giữ sẵn hàng để giao nhanh; Kho hàng nhắc mua bù khi tồn xuống dưới mức tiêu chuẩn.
                </span>
              </label>
              {stockMode === "stock" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={adminLabel} htmlFor="minStock">
                      Lưu kho bao nhiêu? <span className="font-normal text-lien-muted">(mức tồn tiêu chuẩn)</span>
                    </label>
                    <input id="minStock" name="minStock" inputMode="numeric" value={minStockText} onChange={(e) => setMinStockText(e.target.value)} placeholder="VD: 10" className={cn(adminInput, fields.minStock && "border-red-500")} data-testid="min-stock" />
                    <FieldError msg={fields.minStock} />
                  </div>
                  <div>
                    <label className={adminLabel} htmlFor="stock">
                      Tồn hiện tại <span className="font-normal text-lien-muted">(tất cả kho)</span>
                    </label>
                    <input id="stock" name="stock" inputMode="numeric" defaultValue={product?.stock ?? 0} className={cn(adminInput, fields.stock && "border-red-500")} />
                    <FieldError msg={fields.stock} />
                    {product ? (
                      <Link href={`/admin/inventory/lots/${product.id}/`} className="mt-1 inline-block text-[12px] text-lien-blue hover:underline">
                        Lô hàng theo kho (Nhật / ĐVVC / VN) →
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : (
                <input type="hidden" name="minStock" value={minStockText} readOnly />
              )}
            </div>
          </FoldCard>

          {/* sticks to the bottom of the window while the (long) form scrolls, so Lưu / Huỷ / Xoá are always one click away */}
          <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-t-md border-t border-[#e5e7eb] bg-white/95 px-1 py-3 shadow-[0_-6px_16px_-10px_rgba(0,0,0,0.35)] backdrop-blur" data-testid="form-actions">
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending ? "Đang lưu…" : product ? "Lưu thay đổi" : "Tạo sản phẩm"}
            </button>
            <Link href="/admin/products/" className={btnSecondary}>
              Huỷ
            </Link>
            {product ? (
              // submits the separate delete form below (a form cannot nest inside another form)
              <ConfirmSubmit form="delete-product" message={`Xoá vĩnh viễn sản phẩm “${product.name}”?`} className={cn(btnDanger, "ml-auto")}>
                Xoá sản phẩm
              </ConfirmSubmit>
            ) : null}
          </div>
        </div>
      </form>

      {product ? (
        <form id="delete-product" action={deleteProductAction}>
          <input type="hidden" name="id" value={product.id} />
        </form>
      ) : null}
    </>
  );
}
