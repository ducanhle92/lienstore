"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { parseExpiry } from "@/lib/lots";
import { isShipmentStatus, shipmentEditable, type ShipmentStatus } from "@/lib/shipments";
import { createShipment, deleteShipment, packCandidates, packProduct, setShipmentStatus, unpackLot, updateShipment } from "@/lib/shipments-db";

const PAGE = "/admin/inventory/shipments/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
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
  updateShipment(id!, { label: text(formData, "label"), plannedAt: plannedAt ?? null, shippedAt: shippedAt ?? null, tracking: text(formData, "tracking"), note: text(formData, "note") });
  revalidatePath("/admin", "layout");
  go("saved", "Đã lưu thông tin chuyến.", id);
}

export async function setShipmentStatusAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = intOr(formData, "shipmentId");
  const status = text(formData, "status");
  if (!id || !isShipmentStatus(status)) go("error", "Yêu cầu không hợp lệ.", id);
  const r = await setShipmentStatus(id!, status as ShipmentStatus);
  revalidatePath("/admin", "layout");
  // the run now lives on ④ Vận chuyển once it left the shop (and back on ③ when moved back)
  const moved = r.ok && !shipmentEditable(status as ShipmentStatus);
  go(r.ok ? "saved" : "error", r.ok ? `Đã cập nhật chuyến${r.lots ? ` — ${r.lots} lô đổi theo` : ""}.${status === "done" ? " Hàng đã vào ⑤ Tồn kho VN." : ""}` : (r.message ?? "Không cập nhật được."), id, moved || (!r.ok && text(formData, "view") === "transit"));
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
  const r = packProduct(id!, productId!, qty!);
  revalidatePath("/admin", "layout");
  go(r.ok ? "saved" : "error", r.message, id);
}

export async function unpackLotAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = intOr(formData, "shipmentId");
  const lotId = intOr(formData, "lotId");
  if (!lotId) go("error", "Yêu cầu không hợp lệ.", id);
  const r = unpackLot(lotId!);
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

/** "Thêm vào chuyến (đã tick)": candidate keys (lot:<id> / line:<itemId>) with optional qty_<key>. */
export async function packCandidatesAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = intOr(formData, "shipmentId");
  if (!id) go("error", "Yêu cầu không hợp lệ.");
  const keys = formData.getAll("keys").map((v) => String(v)).filter((k) => /^(lot|line):\d+$/.test(k));
  if (!keys.length) go("error", "Chưa tick dòng nào.", id);
  const items = keys.map((key) => {
    const q = Number.parseInt(text(formData, `qty_${key.replace(":", "_")}`), 10);
    return { key, qty: Number.isInteger(q) && q >= 0 ? q : null };
  });
  const r = packCandidates(id!, items);
  revalidatePath("/admin", "layout");
  go(r.ok ? "saved" : "error", r.message, id);
}
