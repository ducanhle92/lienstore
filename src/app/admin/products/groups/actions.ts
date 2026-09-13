"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { assignProductsToGroup, deleteProductGroup, getProductGroupById, saveProductGroup, setProductVariant, ungroupProducts } from "@/lib/db";
import { normalizeAttrLabels } from "@/lib/variants";

const PAGE = "/admin/products/groups/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const ids = (fd: FormData, k: string) => fd.getAll(k).map((v) => Number.parseInt(String(v), 10)).filter((n) => Number.isInteger(n) && n > 0);
const back = (key: "saved" | "error", msg: string, page = PAGE): never => redirect(`${page}?${key}=${encodeURIComponent(msg)}`);

/** Products list › tick several rows › "Gộp thành nhóm biến thể". */
export async function groupProductsAction(formData: FormData): Promise<void> {
  await requireAdmin("products");
  const selected = ids(formData, "ids");
  const name = text(formData, "groupName");
  const existing = Number.parseInt(text(formData, "groupId"), 10);
  if (selected.length < (Number.isInteger(existing) && existing > 0 ? 1 : 2)) back("error", "Chọn ít nhất 2 sản phẩm để gộp (hoặc 1 sản phẩm khi thêm vào nhóm đã có).", "/admin/products/");
  let groupId = existing;
  if (!Number.isInteger(groupId) || groupId <= 0) {
    if (!name) back("error", "Nhập tên nhóm (tên chung của dòng sản phẩm, ví dụ “Nama Socola Royce”).", "/admin/products/");
    const g = await saveProductGroup({ name, attrLabels: normalizeAttrLabels(text(formData, "attrLabels")) });
    groupId = g.id;
  }
  const n = await assignProductsToGroup(groupId, selected);
  revalidatePath("/", "layout");
  redirect(`${PAGE}${groupId}/?saved=${encodeURIComponent(`Đã gộp ${n} sản phẩm vào nhóm.`)}`);
}

/** Group page › search box: add (or move) the ticked products into this family. */
export async function addToGroupAction(formData: FormData): Promise<void> {
  await requireAdmin("products");
  const groupId = Number.parseInt(text(formData, "groupId"), 10);
  const selected = ids(formData, "ids");
  if (!Number.isInteger(groupId) || !selected.length) back("error", "Chọn ít nhất một sản phẩm.", `${PAGE}${groupId}/`);
  const n = await assignProductsToGroup(groupId, selected);
  revalidatePath("/", "layout");
  back("saved", `Đã thêm ${n} sản phẩm vào nhóm. Điền giá trị các cấp ở bảng bên để phân nhánh.`, `${PAGE}${groupId}/`);
}

export async function saveGroupAction(formData: FormData): Promise<void> {
  await requireAdmin("products");
  const id = Number.parseInt(text(formData, "id"), 10);
  const name = text(formData, "name");
  if (!name) back("error", "Tên nhóm không được trống.", `${PAGE}${id}/`);
  // one field per level (AttrLabelsEditor) or a single comma-separated field — both accepted
  const g = await saveProductGroup({ id: Number.isInteger(id) && id > 0 ? id : undefined, name, attrLabels: normalizeAttrLabels(formData.getAll("attrLabels").map(String).join(",")) });
  revalidatePath("/", "layout");
  redirect(`${PAGE}${g.id}/?saved=${encodeURIComponent("Đã lưu nhóm.")}`);
}

/** Per-member row on the group page: attribute values + order; or remove from the group. */
export async function saveVariantAction(formData: FormData): Promise<void> {
  await requireAdmin("products");
  const groupId = Number.parseInt(text(formData, "groupId"), 10);
  const productId = Number.parseInt(text(formData, "productId"), 10);
  const g = await getProductGroupById(groupId);
  if (!g || !Number.isInteger(productId)) return back("error", "Không tìm thấy nhóm / sản phẩm.");
  if (formData.get("remove") === "1") {
    await ungroupProducts([productId]);
    revalidatePath("/", "layout");
    back("saved", "Đã tách sản phẩm khỏi nhóm.", `${PAGE}${groupId}/`);
  }
  const attrs: Record<string, string> = {};
  g.attrLabels.forEach((label, i) => {
    const v = text(formData, `attr_${i}`).slice(0, 40);
    if (v) attrs[label] = v;
  });
  const pos = Number.parseInt(text(formData, "position"), 10);
  await setProductVariant(productId, groupId, attrs, Number.isInteger(pos) ? pos : 0);
  revalidatePath("/", "layout");
  back("saved", "Đã lưu biến thể.", `${PAGE}${groupId}/`);
}

export async function deleteGroupAction(formData: FormData): Promise<void> {
  await requireAdmin("products");
  const id = Number.parseInt(text(formData, "id"), 10);
  const ok = Number.isInteger(id) && (await deleteProductGroup(id));
  revalidatePath("/", "layout");
  if (!ok) back("error", "Không xoá được nhóm.");
  back("saved", "Đã xoá nhóm — các sản phẩm lại hiển thị riêng lẻ.");
}
