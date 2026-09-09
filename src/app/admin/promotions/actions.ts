"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { deleteVoucher, getProductById, saveVoucher, updateProductPricing } from "@/lib/db";
import { parseAmount } from "@/lib/format";

const DISCOUNTS = "/admin/promotions/discounts/";
const VOUCHERS = "/admin/promotions/vouchers/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (url: string, key: "saved" | "error", msg: string): never => redirect(`${url}?${key}=${encodeURIComponent(msg)}`);
const isRedirect = (e: unknown) => e instanceof Error && e.message.includes("NEXT_REDIRECT");

/** Put a product on sale: keeps the current price as the crossed-out regular price unless one is given. */
export async function setSaleAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const id = Number.parseInt(text(formData, "productId"), 10);
  const product = Number.isInteger(id) ? await getProductById(id) : null;
  if (!product) return back(DISCOUNTS, "error", "Chọn sản phẩm.");
  const sale = parseAmount(text(formData, "price"));
  const regularRaw = text(formData, "regularPrice");
  const regular = regularRaw ? parseAmount(regularRaw) : product.regularPrice ?? product.price;
  const percentRaw = text(formData, "percent");
  const finalSale = !sale && percentRaw ? Math.round((regular * (100 - Math.min(99, Math.max(1, parseAmount(percentRaw))))) / 100) : sale;
  if (!finalSale || finalSale <= 0) back(DISCOUNTS, "error", "Nhập giá khuyến mãi hoặc % giảm.");
  if (finalSale >= regular) back(DISCOUNTS, "error", `Giá khuyến mãi (${finalSale.toLocaleString("vi-VN")}đ) phải thấp hơn giá gốc (${regular.toLocaleString("vi-VN")}đ).`);
  await updateProductPricing(id, finalSale, regular);
  revalidatePath("/", "layout");
  back(DISCOUNTS, "saved", `Đã giảm giá "${product.name}": ${regular.toLocaleString("vi-VN")}đ → ${finalSale.toLocaleString("vi-VN")}đ.`);
}

/** End a sale: the regular price becomes the price again. */
export async function clearSaleAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const id = Number.parseInt(text(formData, "productId"), 10);
  const product = Number.isInteger(id) ? await getProductById(id) : null;
  if (!product) return back(DISCOUNTS, "error", "Không tìm thấy sản phẩm.");
  await updateProductPricing(id, product.regularPrice ?? product.price, null);
  revalidatePath("/", "layout");
  back(DISCOUNTS, "saved", `Đã bỏ giảm giá "${product.name}".`);
}

const toIso = (d: string, endOfDay: boolean) => (d ? new Date(`${d}T${endOfDay ? "23:59:59" : "00:00:00"}+07:00`).toISOString() : null);

export async function saveVoucherAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const idRaw = text(formData, "id");
  const kind = text(formData, "kind") === "fixed" ? "fixed" : "percent";
  const value = parseAmount(text(formData, "value"));
  if (!value) back(VOUCHERS, "error", "Nhập giá trị giảm.");
  if (kind === "percent" && value > 100) back(VOUCHERS, "error", "Phần trăm giảm tối đa 100.");
  const maxRaw = text(formData, "maxDiscount");
  const limitRaw = text(formData, "usageLimit");
  try {
    const id = await saveVoucher({
      id: idRaw ? Number.parseInt(idRaw, 10) : undefined,
      code: text(formData, "code"),
      kind,
      value,
      minSubtotal: parseAmount(text(formData, "minSubtotal")),
      maxDiscount: maxRaw ? parseAmount(maxRaw) : null,
      startsAt: toIso(text(formData, "startsAt"), false),
      endsAt: toIso(text(formData, "endsAt"), true),
      usageLimit: limitRaw ? Number.parseInt(limitRaw, 10) || null : null,
      active: formData.get("active") === "on",
      note: text(formData, "note"),
    });
    revalidatePath("/admin", "layout");
    redirect(`${VOUCHERS}?saved=${encodeURIComponent(idRaw ? "Đã lưu voucher." : "Đã tạo voucher.")}#voucher-${id}`);
  } catch (e) {
    if (isRedirect(e)) throw e;
    back(VOUCHERS, "error", e instanceof Error ? e.message : "Không lưu được voucher.");
  }
}

export async function deleteVoucherAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const id = Number.parseInt(text(formData, "id"), 10);
  if (Number.isInteger(id)) await deleteVoucher(id);
  revalidatePath("/admin", "layout");
  back(VOUCHERS, "saved", "Đã xoá voucher.");
}
