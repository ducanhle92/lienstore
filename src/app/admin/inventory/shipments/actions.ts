"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession, requireAdmin } from "@/lib/auth";
import { parseExpiry } from "@/lib/lots";
import { isShipmentStatus, shipmentEditable, type ShipmentStatus } from "@/lib/shipments";
import { createShipment, deleteShipment, getShipment, packCandidates, packProduct, setShipmentStatus, unpackUnits, updateShipment } from "@/lib/shipments-db";
import { normalizeKienCode } from "@/lib/carriers/kien-express";
import { syncShipmentKien } from "@/lib/kien-sync";
import { parseVnd } from "@/lib/shipment-fee";
import { addShopFeeFiles, clearShopFee, removeShopFeeFile, saveShopFee, type ShopFeeFile } from "@/lib/shipment-fee-db";
import { deleteUpload, extForMime, MAX_UPLOAD_BYTES, RECEIPT_MIMES, saveUpload, slugifyFileName, uniqueName } from "@/lib/uploads";

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
/** Today on the shop's clock (Asia/Ho_Chi_Minh), YYYY-MM-DD. */
const todayVn = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
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
  const transit = text(formData, "transit") === "1";
  const before = getShipment(id!);
  updateShipment(id!, { label: opt("label"), plannedAt: plannedAt ?? null, shippedAt: shippedAt ?? null, tracking: opt("tracking"), trackingDomestic: opt("trackingDomestic"), note: opt("note") });
  revalidatePath("/admin", "layout");
  // a KEA code that was just entered / changed is checked with Kiến once right away (the hourly job keeps it fresh)
  const code = opt("tracking") === undefined ? "" : normalizeKienCode(opt("tracking"));
  if (code && code !== (before?.carrierCode ?? "")) {
    const r = await syncShipmentKien(id!, { actor: await actor() });
    revalidatePath("/admin", "layout");
    go(r.ok ? "saved" : "error", r.ok ? `Đã lưu thông tin chuyến. ${r.message}` : `Đã lưu thông tin chuyến, nhưng chưa đối chiếu được với Kiến: ${r.message}`, id, transit);
  }
  // back to the view the form was on (⑤ Vận chuyển JP-VN keeps its own list)
  go("saved", "Đã lưu thông tin chuyến.", id, transit);
}

/** "Đồng bộ từ Kiến": fetch the run's KEA code from Kiến Express and store the state / history (lib/kien-sync.ts). */
export async function syncKienAction(formData: FormData): Promise<void> {
  await requireAdmin("inventory");
  const id = intOr(formData, "shipmentId");
  if (!id) go("error", "Yêu cầu không hợp lệ.");
  const r = await syncShipmentKien(id!, { actor: await actor() });
  revalidatePath("/admin", "layout");
  go(r.ok ? "saved" : "error", r.message, id, text(formData, "transit") === "1");
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

// ---------------------------------------------------------------------------------------------------------------------
// ⑤ "Phí ship ĐVVC → shop VN" of a run: amount + day paid + note + transfer receipt; split over the run's orders by
// weight (lib/shipment-fee-db.ts) so ① Đơn hàng and Kế toán use the real ③ fee.

const backTo = (fd: FormData, key: "saved" | "error", msg: string, shipmentId?: number | null): never =>
  redirect(`${PAGE}?stage=transit&${text(fd, "at") === "to_shop" ? "at=to_shop&" : ""}${key}=${encodeURIComponent(msg)}${shipmentId ? `#shipment-${shipmentId}` : ""}`);

export async function saveShopFeeAction(formData: FormData): Promise<void> {
  const session = await requireAdmin("transit");
  const id = intOr(formData, "shipmentId");
  if (!id) backTo(formData, "error", "Yêu cầu không hợp lệ.");
  const fee = parseVnd(text(formData, "fee"));
  if (fee === null || fee <= 0) backTo(formData, "error", "Nhập số tiền phí ship đã trả (VD 244.000).", id);
  const paidAt = text(formData, "paidAt") ? parseExpiry(text(formData, "paidAt")) : todayVn();
  if (!paidAt) backTo(formData, "error", "Ngày trả không hợp lệ (VD 2026-10-08).", id);
  const saved = saveShopFee(id!, { fee: fee!, paidAt: paidAt!, note: text(formData, "note"), by: session.label ?? "" });
  if (!saved) backTo(formData, "error", "Không tìm thấy chuyến.");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const stored: ShopFeeFile[] = [];
  let skipped = 0;
  for (const file of files) {
    if (!RECEIPT_MIMES.has(file.type) || file.size > MAX_UPLOAD_BYTES) {
      skipped++;
      continue;
    }
    const s = await saveUpload(`shipments/${id}`, uniqueName(slugifyFileName(file.name), extForMime(file.type) || ".bin"), Buffer.from(await file.arrayBuffer()));
    stored.push({ path: s.rel, url: s.url, name: file.name, mime: file.type });
  }
  if (stored.length) addShopFeeFiles(id!, stored);
  const orders = saved!.shares.filter((x) => x.orderId);
  const stock = saved!.shares.find((x) => !x.orderId);
  revalidatePath("/admin", "layout");
  backTo(
    formData,
    "saved",
    `Đã lưu phí ship ĐVVC → shop ${fee!.toLocaleString("vi-VN")}đ cho chuyến ${getShipment(id!)?.code ?? ""}: chia theo cân nặng cho ${orders.length} đơn${stock?.fee ? ` + hàng lưu kho ${stock.fee.toLocaleString("vi-VN")}đ` : ""}. Lãi/lỗ ở ① Đơn hàng và Kế toán đã dùng phí thực này.${stored.length ? ` · ${stored.length} ảnh bill` : ""}${skipped ? ` · bỏ qua ${skipped} tệp (chỉ nhận ảnh / PDF dưới 10 MB)` : ""}`,
    id,
  );
}

export async function clearShopFeeAction(formData: FormData): Promise<void> {
  await requireAdmin("transit");
  const id = intOr(formData, "shipmentId");
  const files = id ? clearShopFee(id) : null;
  if (!files) backTo(formData, "error", "Không tìm thấy chuyến.");
  for (const f of files!) await deleteUpload(f.path);
  revalidatePath("/admin", "layout");
  backTo(formData, "saved", "Đã xoá phí ship ĐVVC → shop của chuyến — lãi/lỗ các đơn quay về phí ③ ước tính.", id);
}

export async function deleteShopFeeFileAction(formData: FormData): Promise<void> {
  await requireAdmin("transit");
  const id = intOr(formData, "shipmentId");
  const removed = id ? removeShopFeeFile(id, text(formData, "path")) : null;
  if (!removed) backTo(formData, "error", "Không tìm thấy tệp.", id);
  await deleteUpload(removed!.path);
  revalidatePath("/admin", "layout");
  backTo(formData, "saved", "Đã gỡ ảnh bill.", id);
}
