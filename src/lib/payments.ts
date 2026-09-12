import "server-only";
import { loadBankAccounts, loadPayPrefix } from "./bank-config";
import { getOrderById, setOrderStage } from "./db";
import { extractPayCode } from "./pay-code";
import { stageIndex } from "./shipping";
import { getDb, getSetting } from "./sqlite";
import type { PaymentEvent } from "@/types/shop";

/**
 * Automatic payment confirmation: a bank-transfer notification (SePay webhook, or a manual simulation) is checked against
 * the order's payment code, the amount and the receiving account, then the order becomes "Đã xác nhận thanh toán".
 * Every notification is stored in `payment_events` (idempotent by provider + external id) for reconciliation.
 */
export interface BankTransferPayload {
  id: string | number;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  subAccount?: string;
  code?: string;
  content?: string;
  transferType?: string;
  transferAmount?: number | string;
  accumulated?: number | string;
  referenceCode?: string;
  description?: string;
}

export type PaymentEventStatus = PaymentEvent["status"];

interface Row {
  id: number;
  provider: string;
  external_id: string;
  order_id: string | null;
  order_number: number | null;
  status: string;
  amount: number;
  pay_code: string | null;
  content: string;
  account_number: string;
  gateway: string;
  transaction_date: string | null;
  reference: string;
  created_at: string;
}
const rowToEvent = (r: Row): PaymentEvent => ({
  id: r.id,
  provider: r.provider,
  externalId: r.external_id,
  orderId: r.order_id,
  orderNumber: r.order_number,
  status: r.status as PaymentEventStatus,
  amount: r.amount,
  payCode: r.pay_code ?? "",
  content: r.content,
  accountNumber: r.account_number,
  gateway: r.gateway,
  transactionDate: r.transaction_date,
  reference: r.reference,
  createdAt: r.created_at,
});

const SELECT = "SELECT e.*, o.number AS order_number FROM payment_events e LEFT JOIN orders o ON o.id = e.order_id";

export async function listPaymentEvents(limit = 50): Promise<PaymentEvent[]> {
  return (getDb().prepare(`${SELECT} ORDER BY e.id DESC LIMIT ?`).all(limit) as unknown as Row[]).map(rowToEvent);
}

/** Mark an order paid (stage "paid") unless it already is; returns whether it changed. */
export async function markOrderPaid(orderId: string, note: string): Promise<boolean> {
  const order = await getOrderById(orderId);
  if (!order || order.status === "cancelled") return false;
  if (stageIndex(order.shipStage) >= stageIndex("paid")) return false;
  return setOrderStage(orderId, "paid", note);
}

export async function processBankTransfer(p: BankTransferPayload, provider = "sepay"): Promise<PaymentEvent> {
  const db = getDb();
  const externalId = String(p.id ?? "").trim();
  if (!externalId) throw new Error("Thiếu id giao dịch.");
  const existing = db.prepare(`${SELECT} WHERE e.provider = ? AND e.external_id = ?`).get(provider, externalId) as Row | undefined;
  if (existing) return { ...rowToEvent(existing), status: "duplicate" };
  const amount = Math.round(Number(p.transferAmount) || 0);
  const content = `${p.code ?? ""} ${p.content ?? ""} ${p.description ?? ""}`.trim();
  const prefix = loadPayPrefix(db);
  const payCode = extractPayCode(content, prefix);
  const accounts = loadBankAccounts(db, true);
  const accountOk = !p.accountNumber || accounts.some((a) => a.accountNumber === String(p.accountNumber).replace(/\s+/g, ""));
  let orderId: string | null = null;
  let status: PaymentEventStatus;
  if (p.transferType && p.transferType.toLowerCase() !== "in") status = "ignored";
  else if (!accountOk) status = "unknown_account";
  else if (!payCode) status = "unmatched";
  else {
    const o = db.prepare("SELECT id, total, status FROM orders WHERE upper(pay_code) = ?").get(payCode) as { id: string; total: number; status: string } | undefined;
    if (!o) status = "unmatched";
    else {
      orderId = o.id;
      if (o.status === "cancelled") status = "order_cancelled";
      else if (amount < o.total) status = "amount_mismatch";
      else {
        const changed = await markOrderPaid(o.id, `Thanh toán tự động (${provider}): ${amount.toLocaleString("vi-VN")}đ · ${p.gateway ?? ""} ${p.referenceCode ? `ref ${p.referenceCode}` : ""}`.trim());
        status = changed ? "matched" : "already_paid";
      }
    }
  }
  const now = new Date().toISOString();
  const res = db
    .prepare("INSERT INTO payment_events (provider, external_id, order_id, status, amount, pay_code, content, account_number, gateway, transaction_date, reference, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(provider, externalId, orderId, status, amount, payCode, String(p.content ?? "").slice(0, 500), String(p.accountNumber ?? ""), String(p.gateway ?? ""), p.transactionDate ? String(p.transactionDate) : null, String(p.referenceCode ?? ""), JSON.stringify(p).slice(0, 4000), now);
  const row = db.prepare(`${SELECT} WHERE e.id = ?`).get(Number(res.lastInsertRowid)) as unknown as Row;
  return rowToEvent(row);
}

/** Admin reconciliation: attach an unmatched / mismatched event to an order and mark it paid. */
export async function assignPaymentEvent(eventId: number, orderNumber: number): Promise<PaymentEvent | null> {
  const db = getDb();
  const ev = db.prepare(`${SELECT} WHERE e.id = ?`).get(eventId) as Row | undefined;
  const o = db.prepare("SELECT id FROM orders WHERE number = ?").get(orderNumber) as { id: string } | undefined;
  if (!ev || !o) return null;
  const changed = await markOrderPaid(o.id, `Đối soát tay từ giao dịch ${ev.provider} #${ev.external_id}: ${ev.amount.toLocaleString("vi-VN")}đ`);
  db.prepare("UPDATE payment_events SET order_id = ?, status = ? WHERE id = ?").run(o.id, changed ? "matched_manual" : "already_paid", eventId);
  return rowToEvent(db.prepare(`${SELECT} WHERE e.id = ?`).get(eventId) as unknown as Row);
}

/** SePay webhook API key (Admin › Kế toán › Thanh toán tự động), env as fallback. */
export function sepayApiKey(): string {
  return (getSetting(getDb(), "sepay_api_key") ?? "").trim() || process.env.SEPAY_API_KEY?.trim() || "";
}
