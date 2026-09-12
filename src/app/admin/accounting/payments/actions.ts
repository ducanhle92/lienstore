"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getDefaultBankAccount } from "@/lib/bank-config";
import { assignPaymentEvent, processBankTransfer } from "@/lib/payments";
import { getDb, setSetting } from "@/lib/sqlite";

const PAGE = "/admin/accounting/payments/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (key: "saved" | "error", msg: string): never => redirect(`${PAGE}?${key}=${encodeURIComponent(msg)}`);

/** SePay webhook API key (kept server-side only). */
export async function saveSepayKeyAction(formData: FormData): Promise<void> {
  await requireAdmin("accounting");
  if (formData.get("clear") === "1") {
    setSetting(getDb(), "sepay_api_key", "");
    back("saved", "Đã gỡ API key SePay — webhook sẽ từ chối mọi request cho tới khi đặt key mới.");
  }
  const key = text(formData, "apiKey");
  if (key.length < 8) back("error", "API key quá ngắn — dán đúng chuỗi trong SePay › Webhooks › Chứng thực API Key.");
  setSetting(getDb(), "sepay_api_key", key);
  revalidatePath("/admin", "layout");
  back("saved", "Đã lưu API key. Dán URL webhook vào SePay và chọn chứng thực API Key với cùng chuỗi này.");
}

/** Manual reconciliation of an unmatched / mismatched notification. */
export async function assignPaymentAction(formData: FormData): Promise<void> {
  await requireAdmin("accounting");
  const eventId = Number.parseInt(text(formData, "eventId"), 10);
  const number = Number.parseInt(text(formData, "orderNumber").replace(/^#/, ""), 10);
  if (!Number.isInteger(eventId) || !Number.isInteger(number)) back("error", "Nhập số đơn (ví dụ 1034).");
  const ev = await assignPaymentEvent(eventId, number);
  revalidatePath("/admin", "layout");
  if (!ev) return back("error", `Không tìm thấy đơn #${number} hoặc giao dịch.`);
  back("saved", ev.status === "matched_manual" ? `Đã gán giao dịch #${ev.externalId} vào đơn #${number} và xác nhận thanh toán.` : `Đã gán vào đơn #${number} (đơn này đã ở trạng thái thanh toán trước đó).`);
}

/** Dry run of the whole chain without SePay: fabricate a "money in" notification for an order. */
export async function simulatePaymentAction(formData: FormData): Promise<void> {
  await requireAdmin("accounting");
  const number = Number.parseInt(text(formData, "orderNumber").replace(/^#/, ""), 10);
  const o = Number.isInteger(number) ? (getDb().prepare("SELECT pay_code, total FROM orders WHERE number = ?").get(number) as { pay_code: string | null; total: number } | undefined) : undefined;
  if (!o) return back("error", `Không tìm thấy đơn #${number}.`);
  const amountRaw = text(formData, "amount").replace(/\D/g, "");
  const amount = amountRaw ? Number.parseInt(amountRaw, 10) : o.total;
  const acc = await getDefaultBankAccount();
  const ev = await processBankTransfer(
    { id: `SIM-${Date.now()}`, gateway: acc.bank, transactionDate: new Date().toISOString().slice(0, 19).replace("T", " "), accountNumber: acc.accountNumber, code: o.pay_code ?? "", content: `${o.pay_code ?? ""} thanh toan don hang`, transferType: "in", transferAmount: amount, referenceCode: "SIMULATED", description: "Giả lập từ admin" },
    "simulate",
  );
  revalidatePath("/admin", "layout");
  back("saved", `Giả lập xong: giao dịch ${ev.externalId} → ${ev.status}${ev.orderNumber ? ` (đơn #${ev.orderNumber})` : ""}.`);
}
