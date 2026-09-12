"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { deleteBankAccount, saveBankAccount, setDefaultBankAccount, setPayPrefix } from "@/lib/bank-config";

const PAGE = "/admin/accounting/banks/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (key: "saved" | "error", msg: string): never => redirect(`${PAGE}?${key}=${encodeURIComponent(msg)}`);

export async function saveBankAccountAction(formData: FormData): Promise<void> {
  await requireAdmin("accounting");
  const idRaw = Number.parseInt(text(formData, "id"), 10);
  try {
    const a = await saveBankAccount({ id: Number.isInteger(idRaw) && idRaw > 0 ? idRaw : undefined, bank: text(formData, "bank"), accountNumber: text(formData, "accountNumber"), accountName: text(formData, "accountName"), branch: text(formData, "branch"), active: formData.get("active") !== "0" });
    revalidatePath("/", "layout");
    back("saved", `Đã lưu tài khoản ${a.bank} ${a.accountNumber} (${a.accountName}).`);
  } catch (e) {
    if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
    back("error", e instanceof Error ? e.message : "Không lưu được tài khoản.");
  }
}

export async function setDefaultBankAccountAction(formData: FormData): Promise<void> {
  await requireAdmin("accounting");
  const id = Number.parseInt(text(formData, "id"), 10);
  const ok = Number.isInteger(id) && (await setDefaultBankAccount(id));
  revalidatePath("/", "layout");
  if (!ok) back("error", "Không đặt được tài khoản mặc định (tài khoản phải đang bật).");
  back("saved", "Đã đổi tài khoản mặc định — đơn mới sẽ nhận tiền vào tài khoản này; đơn cũ giữ tài khoản lúc đặt.");
}

export async function deleteBankAccountAction(formData: FormData): Promise<void> {
  await requireAdmin("accounting");
  const id = Number.parseInt(text(formData, "id"), 10);
  const ok = Number.isInteger(id) && (await deleteBankAccount(id));
  revalidatePath("/", "layout");
  if (!ok) back("error", "Không xoá được: tài khoản mặc định không thể xoá (đặt tài khoản khác làm mặc định trước).");
  back("saved", "Đã xoá tài khoản.");
}

export async function savePayPrefixAction(formData: FormData): Promise<void> {
  await requireAdmin("accounting");
  const v = text(formData, "prefix");
  if (!/^[A-Za-z]{1,6}$/.test(v)) back("error", "Tiền tố mã thanh toán chỉ gồm 1–6 chữ cái (A–Z).");
  await setPayPrefix(v);
  revalidatePath("/", "layout");
  back("saved", `Đã đặt tiền tố mã thanh toán "${v.toUpperCase()}" — áp cho đơn mới; đơn cũ giữ mã đã cấp.`);
}
