"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getCategories, getImportQuoteConfig, getJpyRate, getPricingConfig, getPurchaseSourceDefault, getShippingMethods, optimizeCostSources, setPricingConfig, setPurchaseSourceDefault, setQuoteDefaults, updateProductPricing } from "@/lib/db";
import { COST_SOURCE_LABEL, isCostSourceKind } from "@/lib/cost-sources";
import { IMPORT_LEGS, type ShippingLeg } from "@/lib/shipping";
import { MARGIN_RANGE } from "@/lib/pricing";
import { refreshDcomRate, runPricingJob, setAutoSell, setDcomRate, setFxMode } from "@/lib/fx";
import { suggestPrice } from "@/lib/pricing";

const PAGE = "/admin/products/pricing/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (key: "saved" | "error", msg: string): never => redirect(`${PAGE}?${key}=${encodeURIComponent(msg)}`);

/** Rounding step of the selling-price formula (the margins are saved by saveCategoryMarginAction). */
export async function savePricingConfigAction(formData: FormData): Promise<void> {
  await requireAdmin("products");
  const roundTo = Number.parseInt(text(formData, "roundTo"), 10);
  if (![1, 100, 500, 1000, 5000, 10000].includes(roundTo)) back("error", "Bước làm tròn không hợp lệ.");
  const cur = await getPricingConfig();
  await setPricingConfig({ ...cur, roundTo });
  revalidatePath("/admin/products/", "layout");
  back("saved", `Đã lưu: giá kỳ vọng làm tròn lên ${roundTo === 1 ? "không làm tròn" : `${roundTo.toLocaleString("vi-VN")}đ`}.`);
}

/** Nguồn mua hàng: preferred source. */
export async function savePurchaseSourceAction(formData: FormData): Promise<void> {
  await requireAdmin("products");
  const v = text(formData, "source");
  if (!isCostSourceKind(v)) back("error", "Nguồn mua không hợp lệ.");
  await setPurchaseSourceDefault(v);
  revalidatePath("/admin", "layout");
  back("saved", `Đã đặt nguồn mua mặc định: ${COST_SOURCE_LABEL[v as keyof typeof COST_SOURCE_LABEL]}.`);
}

/** "Tối ưu giá vốn theo nguồn rẻ nhất" — every product switches to its cheapest ¥ quote; VND cost follows the rate. */
export async function optimizeCostSourcesAction(): Promise<void> {
  await requireAdmin("products");
  const [rate, preferred] = await Promise.all([getJpyRate(), getPurchaseSourceDefault()]);
  const r = await optimizeCostSources(rate, preferred);
  revalidatePath("/", "layout");
  back("saved", `Đã tối ưu: ${r.changed}/${r.checked} sản phẩm chuyển sang nguồn rẻ hơn, tiết kiệm ${r.savingsJpy.toLocaleString("vi-VN")}¥ ≈ ${Math.round(r.savingsJpy * rate).toLocaleString("vi-VN")}đ giá vốn.`);
}

/** Tham số chi phí vận chuyển: default carrier per import leg + the consolidated lot size. */
export async function saveCostParamsAction(formData: FormData): Promise<void> {
  await requireAdmin("products");
  const lotKg = Number.parseFloat(text(formData, "lotKg").replace(",", "."));
  if (!Number.isFinite(lotKg) || lotKg < 1 || lotKg > 100) back("error", "Cân lô gom hàng phải từ 1 đến 100 kg.");
  const methods = await getShippingMethods(true);
  const defaults: Partial<Record<ShippingLeg, number>> = {};
  const names: string[] = [];
  for (const leg of IMPORT_LEGS) {
    const id = Number.parseInt(text(formData, `default_${leg}`), 10);
    const m = methods.find((x) => x.id === id && x.leg === leg && x.active);
    if (m) {
      defaults[leg] = m.id;
      names.push(m.name);
    }
  }
  await setQuoteDefaults(defaults);
  const cur = await getPricingConfig();
  await setPricingConfig({ ...cur, lotWeightG: Math.round(lotKg * 1000) });
  revalidatePath("/", "layout");
  back("saved", `Đã lưu tham số chi phí: ${names.join(" → ") || "chưa chọn hãng"}; chia phí theo lô ${lotKg} kg.`);
}

/** Tỉ lệ lãi kỳ vọng theo danh mục: sub-category when given, else the whole category. */
export async function saveCategoryMarginAction(formData: FormData): Promise<void> {
  await requireAdmin("products");
  const slug = text(formData, "subcategory") || text(formData, "category");
  const pct = Number.parseFloat(text(formData, "pct").replace(",", "."));
  if (!Number.isFinite(pct) || pct < MARGIN_RANGE.min || pct > MARGIN_RANGE.max) back("error", `Tỉ lệ lãi kỳ vọng phải là số từ ${MARGIN_RANGE.min} đến ${MARGIN_RANGE.max}.`);
  const cur = await getPricingConfig();
  if (slug === "__all__") {
    await setPricingConfig({ ...cur, marginPct: Math.round(pct * 10) / 10 });
    revalidatePath("/admin/products/", "layout");
    return back("saved", `Đã đặt tỉ lệ lãi kỳ vọng mặc định ${pct}% cho tất cả sản phẩm (danh mục / sản phẩm có tỉ lệ riêng vẫn giữ).`);
  }
  const cats = await getCategories();
  const cat = cats.find((c) => c.slug === slug);
  if (!cat) return back("error", "Chọn danh mục.");
  await setPricingConfig({ ...cur, marginByCategory: { ...cur.marginByCategory, [slug]: Math.round(pct * 10) / 10 } });
  revalidatePath("/admin/products/", "layout");
  back("saved", `Đã đặt tỉ lệ lãi kỳ vọng ${pct}% cho danh mục "${cat.name}".`);
}

export async function deleteCategoryMarginAction(formData: FormData): Promise<void> {
  await requireAdmin("products");
  const slug = text(formData, "slug");
  const cur = await getPricingConfig();
  const next = { ...cur.marginByCategory };
  delete next[slug];
  await setPricingConfig({ ...cur, marginByCategory: next });
  revalidatePath("/admin/products/", "layout");
  back("saved", "Đã bỏ tỉ lệ riêng của danh mục — dùng lại mặc định.");
}

/**
 * Write the suggested price onto every product that has a cost price and is not on sale.
 * Products with a sale price keep both prices untouched (the admin handles them in Sales › Giảm giá sản phẩm).
 */
export async function applySuggestedPricesAction(formData: FormData): Promise<void> {
  await requireAdmin("products");
  const only = new Set(formData.getAll("ids").map((v) => Number.parseInt(String(v), 10)).filter(Number.isInteger));
  const [products, quote, pricing] = await Promise.all([getAllProducts(true), getImportQuoteConfig(), getPricingConfig()]);
  let changed = 0;
  let skippedSale = 0;
  for (const p of products) {
    if (only.size && !only.has(p.id)) continue;
    const s = suggestPrice({ costPrice: p.costPrice, weightG: p.weightG, dimsCm: p.dimsCm, dimsConfidence: p.dimsConfidence, marginPct: p.marginPct, categories: p.categories }, quote, pricing);
    if (!s) continue;
    if (p.regularPrice !== null) {
      skippedSale++;
      continue;
    }
    if (s.suggested !== p.price && (await updateProductPricing(p.id, s.suggested, null))) changed++;
  }
  revalidatePath("/", "layout");
  back("saved", `Đã cập nhật giá bán cho ${changed} sản phẩm theo công thức.${skippedSale ? ` Bỏ qua ${skippedSale} sản phẩm đang giảm giá.` : ""}`);
}

/** Tỉ giá: DCOM typed by the owner, or the market rate; auto-sell toggle. */
export async function saveFxAction(formData: FormData): Promise<void> {
  await requireAdmin("products");
  const raw = text(formData, "dcomRate").replace(/\./g, "").replace(",", ".");
  const dcom = Number.parseFloat(raw);
  if (raw && (!Number.isFinite(dcom) || dcom < 50 || dcom > 1000)) back("error", "Tỉ giá DCOM phải là số VND cho 1 yên, ví dụ 167,4.");
  setDcomRate(raw ? dcom : null);
  setFxMode(text(formData, "mode") === "market" ? "market" : "dcom");
  setAutoSell(formData.get("autoSell") === "on");
  revalidatePath("/admin", "layout");
  back("saved", raw ? `Đã lưu tỉ giá DCOM nhập tay ${dcom} đ/¥ (ghi đè tỉ giá tự lấy).` : "Đã lưu thiết lập tỉ giá — dùng tỉ giá DCOM tự lấy.");
}

/** "Lấy tỉ giá DCOM ngay" — scrape sendmoney.co.jp and apply. */
export async function refreshDcomAction(): Promise<void> {
  await requireAdmin("products");
  const got = await refreshDcomRate();
  revalidatePath("/admin", "layout");
  if (!got) return back("error", "Không lấy được tỉ giá từ sendmoney.co.jp (trang không phản hồi hoặc đổi bố cục). Tỉ giá cũ vẫn giữ.");
  back("saved", `Đã lấy tỉ giá DCOM ${got.rate} đ/¥${got.pageTime ? ` (DCOM cập nhật ${got.pageTime})` : ""}.`);
}

/** "Cập nhật giá vốn theo tỉ giá ngay" — the same job that runs at 04:00. */
export async function runPricingNowAction(): Promise<void> {
  await requireAdmin("products");
  const r = await runPricingJob();
  revalidatePath("/", "layout");
  back("saved", `Đã chạy: tỉ giá ${r.rate} (${r.rateSource}) · cập nhật giá vốn ${r.costsUpdated} sản phẩm · giá bán ${r.pricesUpdated} sản phẩm${r.skippedSale ? ` (bỏ qua ${r.skippedSale} đang giảm giá)` : ""}.`);
}
