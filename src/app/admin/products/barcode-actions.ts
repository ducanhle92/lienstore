"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, getAdminSession } from "@/lib/auth";
import { linkBarcode, unlinkBarcode } from "@/lib/barcodes-db";
import { DomainError } from "@/lib/service-error";

/**
 * Mã JAN / mã vạch của sản phẩm (ô "Mã SKU & trạng thái" trên trang sản phẩm). Same service as the scan screen and the
 * API (`lib/barcodes-db.ts`): a code points to ONE product, several codes per product (pack sizes, old packaging).
 */
const back = (productId: number, key: "saved" | "error", msg: string): never => redirect(`/admin/products/${productId}/?${key}=${encodeURIComponent(msg)}#fold-status`);

export async function addBarcodeAction(formData: FormData): Promise<void> {
  if (!(await can("products"))) redirect("/admin/login/");
  const productId = Number.parseInt(String(formData.get("productId") ?? ""), 10);
  if (!Number.isInteger(productId)) redirect("/admin/products/");
  const code = String(formData.get("code") ?? "").trim();
  if (!code) back(productId, "error", "Nhập hoặc quét mã JAN trước.");
  const packQty = Number.parseInt(String(formData.get("packQty") ?? "1"), 10);
  const actor = (await getAdminSession())?.label ?? "admin";
  try {
    const r = linkBarcode({ productId, code, packQty: Number.isInteger(packQty) && packQty > 0 ? packQty : 1, packLabel: String(formData.get("packLabel") ?? ""), force: formData.get("force") === "1" }, { actor });
    revalidatePath("/admin", "layout");
    back(productId, "saved", r.status === "unchanged" ? `Mã ${r.link.code} đã có sẵn.` : `Đã liên kết mã ${r.link.code}${r.link.packQty > 1 ? ` (${r.link.packLabel || "gói"} ${r.link.packQty} cái)` : ""}.`);
  } catch (e) {
    if (e instanceof DomainError) back(productId, "error", e.code === "CODE_IS_SKU_OF_OTHER" ? `${e.message} Tick “Vẫn liên kết” nếu chắc chắn.` : e.message);
    throw e;
  }
}

export async function removeBarcodeAction(formData: FormData): Promise<void> {
  if (!(await can("products"))) redirect("/admin/login/");
  const productId = Number.parseInt(String(formData.get("productId") ?? ""), 10);
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  if (!Number.isInteger(productId) || !Number.isInteger(id)) redirect("/admin/products/");
  const actor = (await getAdminSession())?.label ?? "admin";
  try {
    const link = unlinkBarcode(id, { actor });
    revalidatePath("/admin", "layout");
    back(productId, "saved", `Đã gỡ mã ${link.code}.`);
  } catch (e) {
    if (e instanceof DomainError) back(productId, "error", e.message);
    throw e;
  }
}
