"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { WAREHOUSE_ADDRESS_KEYS } from "@/lib/default-flow-job";
import { getDb, setSetting } from "@/lib/sqlite";
import { EXTRA_ADDRESSES_KEY, extraAddressesFromForm } from "@/lib/warehouse-addresses";

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
  // "Địa chỉ khác": parallel fields from the list editor, rows without an address are dropped
  const col = (k: string) => formData.getAll(k).map((v) => String(v ?? "").trim());
  const ids = col("xa_id");
  const extras = extraAddressesFromForm(ids.map((id, i) => ({ id, label: col("xa_label")[i] ?? "", kind: col("xa_kind")[i] ?? "other", address: col("xa_address")[i] ?? "", note: col("xa_note")[i] ?? "" })));
  setSetting(db, EXTRA_ADDRESSES_KEY, JSON.stringify(extras));
  revalidatePath("/", "layout");
  redirect(`${PAGE}?saved=${encodeURIComponent(`Đã lưu địa chỉ các kho${extras.length ? ` và ${extras.length} địa chỉ khác` : ""}.`)}`);
}
