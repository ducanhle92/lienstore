"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { WAREHOUSE_ADDRESS_KEYS } from "@/lib/default-flow-job";
import { getDb, setSetting } from "@/lib/sqlite";

const PAGE = "/admin/inventory/warehouses/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim().slice(0, 300);

/** Kho hàng › Địa chỉ kho: the four warehouse addresses; the VN shop address also feeds the checkout "Nhận tại kho" text. */
export async function saveWarehouseAddressesAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const db = getDb();
  for (const key of Object.values(WAREHOUSE_ADDRESS_KEYS)) setSetting(db, key, text(formData, key));
  const vnShop = text(formData, WAREHOUSE_ADDRESS_KEYS.vnShop);
  if (vnShop) setSetting(db, "pickup_address", vnShop);
  const jpShop = text(formData, WAREHOUSE_ADDRESS_KEYS.jpShop);
  if (jpShop) setSetting(db, "jp_sender_address", jpShop);
  revalidatePath("/", "layout");
  redirect(`${PAGE}?saved=${encodeURIComponent("Đã lưu địa chỉ các kho.")}`);
}
