"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth";
import { updateProductStock } from "@/lib/db";

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
