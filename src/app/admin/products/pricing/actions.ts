"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getImportQuoteConfig, getPricingConfig, setPricingConfig, updateProductPricing } from "@/lib/db";
import { MARGIN_RANGE } from "@/lib/pricing";
import { suggestPrice } from "@/lib/pricing";

const PAGE = "/admin/products/pricing/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (key: "saved" | "error", msg: string): never => redirect(`${PAGE}?${key}=${encodeURIComponent(msg)}`);

/** Margin % and rounding step of the selling-price formula. */
export async function savePricingConfigAction(formData: FormData): Promise<void> {
  await requireAdmin("products");
  const marginPct = Number.parseFloat(text(formData, "marginPct").replace(",", "."));
  if (!Number.isFinite(marginPct) || marginPct < MARGIN_RANGE.min || marginPct > MARGIN_RANGE.max) back("error", `Lãi % phải là số từ ${MARGIN_RANGE.min} đến ${MARGIN_RANGE.max}.`);
  const roundTo = Number.parseInt(text(formData, "roundTo"), 10);
  if (![1, 100, 500, 1000, 5000, 10000].includes(roundTo)) back("error", "Bước làm tròn không hợp lệ.");
  await setPricingConfig({ marginPct: Math.round(marginPct * 10) / 10, roundTo });
  revalidatePath("/admin/products/", "layout");
  back("saved", `Đã lưu công thức: giá vốn + ${marginPct}% + phí 3 chặng nhập hàng, làm tròn lên ${roundTo.toLocaleString("vi-VN")}đ.`);
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
    const s = suggestPrice({ costPrice: p.costPrice, weightG: p.weightG, dimsCm: p.dimsCm, dimsConfidence: p.dimsConfidence }, quote, pricing);
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
