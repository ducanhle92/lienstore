"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth";
import { deleteShippingMethod, deleteShippingZone, saveShippingMethod, saveShippingZone, setShippingNotes } from "@/lib/db";
import { parseAmount } from "@/lib/format";

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

function done(msg: string): never {
  revalidatePath("/", "layout");
  redirect(`${BACK}?saved=${encodeURIComponent(msg)}`);
}

export async function saveMethodAction(formData: FormData): Promise<void> {
  await guard();
  const idRaw = text(formData, "id");
  const name = text(formData, "name");
  if (!name) redirect(`${BACK}?error=${encodeURIComponent("Tên phương thức không được để trống.")}`);
  const id = await saveShippingMethod({
    id: idRaw ? Number.parseInt(idRaw, 10) : undefined,
    name,
    description: text(formData, "description"),
    extraLabel: text(formData, "extraLabel"),
    currency: text(formData, "currency") || "đ",
    position: int(formData, "position", 0),
    active: formData.get("active") === "on",
  });
  done(idRaw ? `Đã lưu phương thức #${id}.` : `Đã thêm phương thức #${id}.`);
}

export async function deleteMethodAction(formData: FormData): Promise<void> {
  await guard();
  const id = int(formData, "id", 0);
  if (id) await deleteShippingMethod(id);
  done("Đã xoá phương thức vận chuyển.");
}

export async function saveZoneAction(formData: FormData): Promise<void> {
  await guard();
  const idRaw = text(formData, "id");
  const methodId = int(formData, "methodId", 0);
  const name = text(formData, "name");
  if (!methodId || !name) redirect(`${BACK}?error=${encodeURIComponent("Tên khu vực không được để trống.")}`);
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
  done(idRaw ? `Đã lưu khu vực "${name}".` : `Đã thêm khu vực "${name}".`);
}

export async function deleteZoneAction(formData: FormData): Promise<void> {
  await guard();
  const id = int(formData, "id", 0);
  if (id) await deleteShippingZone(id);
  done("Đã xoá khu vực.");
}

export async function saveNotesAction(formData: FormData): Promise<void> {
  await guard();
  const lines = String(formData.get("notes") ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  await setShippingNotes(lines);
  done("Đã lưu lưu ý vận chuyển.");
}
