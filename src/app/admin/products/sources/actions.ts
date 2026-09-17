"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { deletePurchaseSource, savePurchaseSource } from "@/lib/db";
import { isPurchaseSourceKind } from "@/lib/purchase-sources";

const PAGE = "/admin/products/sources/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (key: "saved" | "error", msg: string): never => redirect(`${PAGE}?${key}=${encodeURIComponent(msg)}`);

/** Add / edit one purchase source (website, physical store with address & branch, auction, second-hand…). */
export async function savePurchaseSourceEntryAction(formData: FormData): Promise<void> {
  await requireAdmin("products");
  const idRaw = Number.parseInt(text(formData, "id"), 10);
  const name = text(formData, "name").slice(0, 80);
  if (!name) back("error", "Nhập tên nguồn (ví dụ “Don Quijote Shibuya”, “Yahoo Auction”).");
  const kindRaw = text(formData, "kind");
  const kind = isPurchaseSourceKind(kindRaw) ? kindRaw : "other";
  const url = text(formData, "url").slice(0, 300);
  if (url && !/^https?:\/\//i.test(url)) back("error", "Link phải bắt đầu bằng http(s)://");
  try {
    const feeRaw = text(formData, "extraFeeJpy").replace(/[^\d]/g, "");
    const s = await savePurchaseSource({ id: Number.isInteger(idRaw) && idRaw > 0 ? idRaw : undefined, name, kind, url, address: text(formData, "address").slice(0, 200), branch: text(formData, "branch").slice(0, 80), note: text(formData, "note").slice(0, 300), extraFeeJpy: feeRaw ? Number.parseInt(feeRaw, 10) : 0, extraFeeNote: text(formData, "extraFeeNote").slice(0, 120), active: formData.get("active") !== "0" });
    revalidatePath("/admin", "layout");
    back("saved", `Đã lưu nguồn “${s.name}”.`);
  } catch (e) {
    if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
    back("error", e instanceof Error ? e.message : "Không lưu được nguồn.");
  }
}

/** Remove a source; quotes that pointed at it fall back to “Chưa xác định”. */
export async function deletePurchaseSourceAction(formData: FormData): Promise<void> {
  await requireAdmin("products");
  const id = Number.parseInt(text(formData, "id"), 10);
  const res = Number.isInteger(id) ? await deletePurchaseSource(id) : null;
  revalidatePath("/admin", "layout");
  if (!res) return back("error", "Không xoá được: nguồn có sẵn của hệ thống chỉ có thể tắt.");
  back("saved", `Đã xoá nguồn${res.moved ? ` — ${res.moved} báo giá chuyển sang “Chưa xác định”` : ""}.`);
}
