"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth";
import { getProductById, setProductStockInWarehouse, updateProductStock } from "@/lib/db";
import { parseStocktakeCsv } from "@/lib/stocktake-csv";

/**
 * Kho hàng › Nhập CSV kiểm kê: the exported table with "Kiểm đếm thực tế" filled in. Each counted row sets that
 * product's stock to the counted number (lots follow: extra units become an adjustment lot, fewer leave FEFO); rows
 * left blank are untouched. Min-stock is kept as it was.
 */
export async function importStocktakeCsvAction(formData: FormData): Promise<void> {
  if (!(await can("inventory"))) redirect("/admin/login/");
  const fail = (msg: string): never => redirect(`/admin/inventory/?error=${encodeURIComponent(msg)}`);
  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) fail("Hãy chọn file CSV kiểm kê.");
  const f = file as File;
  if (f.size > 5 * 1024 * 1024) fail("File CSV tối đa 5 MB.");
  const parsed = parseStocktakeCsv(Buffer.from(await f.arrayBuffer()).toString("utf8"));
  if (parsed.rows.length === 0 && parsed.errors.length) fail(parsed.errors[0]);
  const errors = [...parsed.errors];
  let updated = 0;
  for (const r of parsed.rows) {
    const p = await getProductById(r.id);
    if (!p) {
      errors.push(`#${r.id}: không có sản phẩm này`);
      continue;
    }
    if (r.warehouse) {
      if (await setProductStockInWarehouse(r.id, r.warehouse, r.count)) updated++;
    } else if (p.stock !== r.count && (await updateProductStock(r.id, r.count))) updated++;
    else if (p.stock === r.count) updated++;
  }
  revalidatePath("/", "layout");
  redirect(`/admin/inventory/?saved=${encodeURIComponent(`kiemke:${updated}:${parsed.skipped}:${errors.length}:${errors.slice(0, 5).join("; ")}`)}`);
}

/** Inline stock update from the inventory table. Empty stock = stop tracking. */
export async function updateStockAction(formData: FormData): Promise<void> {
  if (!(await can("inventory"))) redirect("/admin/login/");
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  const stockRaw = String(formData.get("stock") ?? "").trim();
  const minRaw = String(formData.get("minStock") ?? "").trim();
  const back = String(formData.get("back") ?? "/admin/inventory/");
  if (Number.isInteger(id)) {
    const stock = stockRaw === "" ? null : Math.max(0, Number.parseInt(stockRaw.replace(/[^\d]/g, "") || "0", 10));
    const minStock = minRaw === "" ? null : Math.max(0, Number.parseInt(minRaw.replace(/[^\d]/g, "") || "0", 10));
    await updateProductStock(id, stock, minStock);
    revalidatePath("/", "layout");
  }
  redirect(`${back}${back.includes("?") ? "&" : "?"}saved=${id}`);
}
