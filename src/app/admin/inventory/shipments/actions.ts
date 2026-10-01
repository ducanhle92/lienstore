"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession, requireAdmin } from "@/lib/auth";
import { parseExpiry } from "@/lib/lots";
import { isShipmentStatus, shipmentEditable, type ShipmentStatus } from "@/lib/shipments";
import { createShipment, deleteShipment, packCandidates, packProduct, setShipmentStatus, unpackUnits, updateShipment } from "@/lib/shipments-db";

const PAGE = "/admin/inventory/shipments/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const actor = async () => (await getAdminSession())?.label ?? "";
const intOr = (fd: FormData, k: string) => {
  const n = Number.parseInt(text(fd, k), 10);
  return Number.isInteger(n) ? n : null;
};
const go = (key: "saved" | "error", msg: string, shipmentId?: number | null, transit = false): never =>
  redirect(`${PAGE}?${transit ? "stage=transit&" : ""}${key}=${encodeURIComponent(msg)}${shipmentId ? `#shipment-${shipmentId}` : ""}`);
/** "2026-09-27" / "27/09/2026" → ISO; empty → null; garbage → undefined. */
const dateOrNull = (raw: string): string | null | undefined => (raw ? (parseExpiry(raw) ?? undefined) : null);

export async function createShipmentAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const plannedAt = dateOrNull(text(formData, "plannedAt"));
  if (plannedAt === undefined) go("error", "Ngày dự kiến gửi không hợp lệ (VD 2026-10-02).");
  const s = createShipment({ label: text(formData, "label"), plannedAt: plannedAt ?? null, note: text(formData, "note") });
  revalidatePath("/admin", "layout");
  go("saved", `Đã mở chuyến ${s.code}. Tìm sản phẩm và thêm số lượng đóng vào.`, s.id);
}

export async function updateShipmentAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = intOr(formData, "shipmentId");
  if (!id) go("error", "Yêu cầu không hợp lệ.");
  const plannedAt = dateOrNull(text(formData, "plannedAt"));
  if (plannedAt === undefined) go("error", "Ngày dự kiến gửi không hợp lệ (VD 2026-10-02).", id);
  const shippedAt = dateOrNull(text(formData, "shippedAt"));
  if (shippedAt === undefined) go("error", "Ngày gửi không hợp lệ (VD 2026-10-02).", id);
  const opt = (k: string) => (formData.has(k) ? text(formData, k) : undefined);
  updateShipment(id!, { label: opt("label"), plannedAt: plannedAt ?? null, shippedAt: shippedAt ?? null, tracking: opt("tracking"), trackingDomestic: opt("trackingDomestic"), note: opt("note") });
  revalidatePath("/admin", "layout");
  go("saved", "Đã lưu thông tin chuyến.", id);
}

export async function setShipmentStatusAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = intOr(formData, "shipmentId");
  const status = text(formData, "status");
  if (!id || !isShipmentStatus(status)) go("error", "Yêu cầu không hợp lệ.", id);
  const r = await setShipmentStatus(id!, status as ShipmentStatus, await actor());
  revalidatePath("/admin", "layout");
  // the run now lives on ⑤ Vận chuyển once it left the shop (and back on ④ when moved back)
  const moved = r.ok && !shipmentEditable(status as ShipmentStatus);
  go(r.ok ? "saved" : "error", r.ok ? `Đã cập nhật chuyến${r.lots ? ` — ${r.lots} cái đổi vị trí theo; đơn hàng, đợt mua, Tồn kho cập nhật` : ""}.${status === "done" ? " Hàng đã vào ⑥ Tồn kho VN." : ""}` : (r.message ?? "Không cập nhật được."), id, moved || (!r.ok && text(formData, "view") === "transit"));
}

/** "Thêm": qty units of a product, FEFO from Kho Nhật (shop). */
export async function packProductAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = intOr(formData, "shipmentId");
  const productId = intOr(formData, "productId");
  const qty = intOr(formData, "qty");
  if (!id) go("error", "Yêu cầu không hợp lệ.");
  if (!productId) go("error", "Chưa chọn sản phẩm.", id);
  if (!qty || qty <= 0) go("error", "Nhập số lượng đóng (> 0).", id);
  const r = packProduct(id!, productId!, qty!, await actor());
  revalidatePath("/admin", "layout");
  go(r.ok ? "saved" : "error", r.message, id);
}

/** "✕ rút": units (a whole bill line of the run, or one code) back to the shelf at Kho Nhật (shop). */
export async function unpackUnitsAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = intOr(formData, "shipmentId");
  const ids = formData.getAll("uids").flatMap((v) => String(v).split(/[,.\s]+/)).map((v) => Number.parseInt(v, 10)).filter(Number.isInteger);
  if (!ids.length) go("error", "Yêu cầu không hợp lệ.", id);
  const r = unpackUnits(ids, await actor());
  revalidatePath("/admin", "layout");
  go(r.ok ? "saved" : "error", r.message, id);
}

export async function deleteShipmentAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = intOr(formData, "shipmentId");
  if (!id) go("error", "Yêu cầu không hợp lệ.");
  const r = deleteShipment(id!);
  revalidatePath("/admin", "layout");
  go(r.ok ? "saved" : "error", r.message, r.ok ? null : id);
}

/** "Thêm vào chuyến (đã tick)": candidate keys u:<id>.<id>… with an optional qty_<first id>. */
export async function packCandidatesAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = intOr(formData, "shipmentId");
  if (!id) go("error", "Yêu cầu không hợp lệ.");
  const keys = formData.getAll("keys").map((v) => String(v)).filter((k) => /^u:[\d.]+$/.test(k));
  if (!keys.length) go("error", "Chưa tick dòng nào.", id);
  const items = keys.map((key) => {
    const unitIds = key.slice(2).split(".").map((x) => Number.parseInt(x, 10)).filter(Number.isInteger);
    const q = Number.parseInt(text(formData, `qty_${unitIds[0]}`), 10);
    return { unitIds, qty: Number.isInteger(q) && q >= 0 ? q : null };
  });
  const r = packCandidates(id!, items, await actor());
  revalidatePath("/admin", "layout");
  go(r.ok ? "saved" : "error", r.message, id);
}
