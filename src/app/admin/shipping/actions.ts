"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth";
import { deleteShippingCarrier, deleteShippingMethod, deleteShippingZone, saveShippingCarrier, saveShippingMethod, saveShippingZone, setPickupAddress, setShippingNotes, setJpyRate, setShippingPricingMode } from "@/lib/db";
import { parseAmount } from "@/lib/format";
import { isShippingLeg } from "@/lib/shipping";

const BACK = "/admin/shipping/";

async function guard() {
  if (!(await can("shipping"))) redirect("/admin/login/");
}

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const int = (fd: FormData, key: string, fallback = 0) => {
  const raw = text(fd, key);
  if (raw === "") return fallback;
  const n = Number.parseInt(raw.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : fallback;
};
/** Empty → null; otherwise a non-negative VND amount (accepts "1.000.000" / "1000000"). */
const amountOrNull = (fd: FormData, key: string): number | null => {
  const raw = text(fd, key);
  if (raw === "") return null;
  return Math.max(0, parseAmount(raw));
};

function done(msg: string, anchor = "", tab = ""): never {
  revalidatePath("/", "layout");
  redirect(`${BACK}?${tab ? `leg=${encodeURIComponent(tab)}&` : ""}saved=${encodeURIComponent(msg)}${anchor}`);
}
function fail(msg: string): never {
  redirect(`${BACK}?error=${encodeURIComponent(msg)}`);
}

export async function saveMethodAction(formData: FormData): Promise<void> {
  await guard();
  const idRaw = text(formData, "id");
  const name = text(formData, "name");
  if (!name) fail("Tên phương thức không được để trống.");
  const legRaw = formData.get("leg");
  const leg = isShippingLeg(legRaw) ? legRaw : "jp_vn";
  // carrier: existing id, or a new one typed inline
  let carrierId: number | null = int(formData, "carrierId", 0) || null;
  const newCarrier = text(formData, "newCarrier");
  if (newCarrier) carrierId = await saveShippingCarrier({ name: newCarrier, legs: [leg] });
  const id = await saveShippingMethod({
    id: idRaw ? Number.parseInt(idRaw, 10) : undefined,
    name,
    description: text(formData, "description"),
    extraLabel: text(formData, "extraLabel"),
    currency: text(formData, "currency") || "đ",
    position: int(formData, "position", 0),
    active: formData.get("active") === "on",
    leg,
    carrierId,
    includesBothEnds: formData.get("includesBothEnds") === "on",
    warehouse: text(formData, "warehouse"),
    homeDelivery: formData.get("homeDelivery") === "on",
    notes: text(formData, "notes"),
  });
  done(idRaw ? `Đã lưu phương thức "${name}".` : `Đã thêm phương thức "${name}".`, `#method-${id}`, text(formData, "backTab") || leg);
}

export async function deleteMethodAction(formData: FormData): Promise<void> {
  await guard();
  const id = int(formData, "id", 0);
  if (id) await deleteShippingMethod(id);
  done("Đã xoá phương thức vận chuyển.", "", text(formData, "backTab"));
}

export async function saveZoneAction(formData: FormData): Promise<void> {
  await guard();
  const idRaw = text(formData, "id");
  const methodId = int(formData, "methodId", 0);
  const name = text(formData, "name");
  if (!methodId || !name) fail("Tên cột / khu vực không được để trống.");
  await saveShippingZone({
    id: idRaw ? Number.parseInt(idRaw, 10) : undefined,
    methodId,
    name,
    fee: Math.max(0, parseAmount(text(formData, "fee") || "0")),
    unit: text(formData, "unit"),
    freeOver: amountOrNull(formData, "freeOver"),
    extraFee: amountOrNull(formData, "extraFee"),
    extraFreeOver: amountOrNull(formData, "extraFreeOver"),
    areas: text(formData, "areas"),
    eta: text(formData, "eta"),
    position: int(formData, "position", 0),
    active: formData.get("active") === "on",
  });
  done(idRaw ? `Đã lưu cột "${name}".` : `Đã thêm cột "${name}".`, `#method-${methodId}`, text(formData, "backTab"));
}

export async function deleteZoneAction(formData: FormData): Promise<void> {
  await guard();
  const id = int(formData, "id", 0);
  if (id) await deleteShippingZone(id);
  done("Đã xoá cột.", "", text(formData, "backTab"));
}

export async function saveCarrierAction(formData: FormData): Promise<void> {
  await guard();
  const idRaw = text(formData, "id");
  const name = text(formData, "name");
  if (!name) fail("Tên đơn vị vận chuyển không được để trống.");
  const legs = formData.getAll("legs").map(String).filter(isShippingLeg);
  const backTab = text(formData, "backTab");
  await saveShippingCarrier({
    id: idRaw ? Number.parseInt(idRaw, 10) : undefined,
    name,
    phone: text(formData, "phone"),
    website: text(formData, "website"),
    note: text(formData, "note"),
    ...(legs.length ? { legs } : {}),
  });
  revalidatePath("/", "layout");
  redirect(`${BACK}?${backTab ? `leg=${encodeURIComponent(backTab)}&` : ""}saved=${encodeURIComponent(idRaw ? `Đã lưu đơn vị "${name}".` : `Đã thêm đơn vị vận chuyển "${name}".`)}#carriers`);
}

export async function deleteCarrierAction(formData: FormData): Promise<void> {
  await guard();
  const id = int(formData, "id", 0);
  if (id) await deleteShippingCarrier(id);
  const backTab = text(formData, "backTab");
  revalidatePath("/", "layout");
  redirect(`${BACK}?${backTab ? `leg=${encodeURIComponent(backTab)}&` : ""}saved=${encodeURIComponent("Đã xoá đơn vị vận chuyển (các phương thức đang dùng chuyển về “chưa chọn”).")}#carriers`);
}

export async function savePickupAction(formData: FormData): Promise<void> {
  await guard();
  await setPickupAddress(text(formData, "pickupAddress"));
  done("Đã lưu địa chỉ nhận tại kho.", "#pickup", "vn_domestic");
}

export async function savePricingAction(formData: FormData): Promise<void> {
  await guard();
  const mode = String(formData.get("mode")) === "included" ? "included" : "per_order";
  const rate = Number.parseFloat(String(formData.get("jpyRate") ?? "").replace(",", "."));
  await setShippingPricingMode(mode);
  if (Number.isFinite(rate) && rate > 0) await setJpyRate(rate);
  done("Đã lưu cách tính phí vận chuyển ở trang thanh toán.", "#pricing", "display");
}

export async function saveNotesAction(formData: FormData): Promise<void> {
  await guard();
  const lines = String(formData.get("notes") ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  await setShippingNotes(lines);
  done("Đã lưu lưu ý vận chuyển.", "#notes", "display");
}
