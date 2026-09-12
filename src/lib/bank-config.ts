import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_PAY_PREFIX, normalizePayPrefix } from "./pay-code";
import { BANK } from "./payment";
import { getDb, getSetting, setSetting } from "./sqlite";
import { bankBin, vietQrPayload } from "./vietqr";
import type { BankAccount, Order } from "@/types/shop";

/**
 * Receiving bank accounts (Admin › Kế toán › Tài khoản ngân hàng). Several accounts may be kept; one is the default
 * and gets stamped on every new order (`orders.pay_account_id`) so an order's QR never changes after it was placed.
 */
interface Row {
  id: number;
  bank_code: string;
  bin: string;
  account_number: string;
  account_name: string;
  branch: string;
  is_default: number;
  active: number;
  created_at: string;
}
const rowToAccount = (r: Row): BankAccount => ({
  id: r.id,
  bank: r.bank_code,
  bin: bankBin(r.bank_code) ?? r.bin,
  accountNumber: r.account_number,
  accountName: r.account_name,
  branch: r.branch ?? "",
  isDefault: r.is_default === 1,
  active: r.active === 1,
  createdAt: r.created_at,
});

/** Built-in fallback when the table is empty (first boot before migration seeding). */
const FALLBACK: BankAccount = { id: 0, bank: BANK.code, bin: bankBin(BANK.code) ?? "970418", accountNumber: BANK.accountNumber, accountName: BANK.accountName, branch: BANK.branch, isDefault: true, active: true, createdAt: "" };

export function loadBankAccounts(db: DatabaseSync = getDb(), includeInactive = false): BankAccount[] {
  const rows = db.prepare(`SELECT * FROM bank_accounts ${includeInactive ? "" : "WHERE active = 1"} ORDER BY is_default DESC, id`).all() as unknown as Row[];
  return rows.map(rowToAccount);
}
export async function listBankAccounts(includeInactive = false): Promise<BankAccount[]> {
  return loadBankAccounts(getDb(), includeInactive);
}
export function loadDefaultBankAccount(db: DatabaseSync = getDb()): BankAccount {
  const list = loadBankAccounts(db);
  return list.find((a) => a.isDefault) ?? list[0] ?? FALLBACK;
}
export async function getDefaultBankAccount(): Promise<BankAccount> {
  return loadDefaultBankAccount();
}
/** Compatibility alias used by the checkout page (bank name in the payment note). */
export async function getBankConfig(): Promise<BankAccount> {
  return loadDefaultBankAccount();
}
export async function getBankAccountById(id: number): Promise<BankAccount | null> {
  const r = getDb().prepare("SELECT * FROM bank_accounts WHERE id = ?").get(id) as Row | undefined;
  return r ? rowToAccount(r) : null;
}
/** The account an order's QR must show: the one stamped on the order, else the current default. */
export async function accountForOrder(order: Pick<Order, "payAccountId">): Promise<BankAccount> {
  if (order.payAccountId) {
    const a = await getBankAccountById(order.payAccountId);
    if (a) return a;
  }
  return loadDefaultBankAccount();
}

export async function saveBankAccount(input: { id?: number; bank: string; accountNumber: string; accountName: string; branch: string; active?: boolean }): Promise<BankAccount> {
  const db = getDb();
  const bin = bankBin(input.bank);
  if (!bin) throw new Error(`Ngân hàng "${input.bank}" chưa có mã BIN — chọn trong danh sách.`);
  const account = input.accountNumber.replace(/\s+/g, "");
  if (!/^\d{6,20}$/.test(account)) throw new Error("Số tài khoản chỉ gồm 6–20 chữ số.");
  const name = input.accountName.trim().toUpperCase().slice(0, 50);
  if (!name) throw new Error("Nhập tên chủ tài khoản.");
  const now = new Date().toISOString();
  const bank = input.bank.trim().toUpperCase();
  if (input.id) {
    db.prepare("UPDATE bank_accounts SET bank_code = ?, bin = ?, account_number = ?, account_name = ?, branch = ?, active = ? WHERE id = ?").run(bank, bin, account, name, input.branch.trim().slice(0, 60), input.active === false ? 0 : 1, input.id);
    return (await getBankAccountById(input.id))!;
  }
  const first = (db.prepare("SELECT COUNT(*) AS n FROM bank_accounts").get() as { n: number }).n === 0;
  const res = db.prepare("INSERT INTO bank_accounts (bank_code, bin, account_number, account_name, branch, is_default, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)").run(bank, bin, account, name, input.branch.trim().slice(0, 60), first ? 1 : 0, now);
  return (await getBankAccountById(Number(res.lastInsertRowid)))!;
}
export async function setDefaultBankAccount(id: number): Promise<boolean> {
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM bank_accounts WHERE id = ? AND active = 1").get(id);
  if (!exists) return false;
  db.prepare("UPDATE bank_accounts SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END").run(id);
  return true;
}
export async function deleteBankAccount(id: number): Promise<boolean> {
  const db = getDb();
  const r = db.prepare("SELECT is_default FROM bank_accounts WHERE id = ?").get(id) as { is_default: number } | undefined;
  if (!r || r.is_default === 1) return false;
  db.prepare("DELETE FROM bank_accounts WHERE id = ?").run(id);
  return true;
}

/** Prefix of the per-order payment code ("LS" → LS1034K7Q). */
export function loadPayPrefix(db: DatabaseSync = getDb()): string {
  return normalizePayPrefix(getSetting(db, "pay_code_prefix") || DEFAULT_PAY_PREFIX);
}
export async function getPayPrefix(): Promise<string> {
  return loadPayPrefix();
}
export async function setPayPrefix(v: string): Promise<void> {
  setSetting(getDb(), "pay_code_prefix", normalizePayPrefix(v));
}

/** EMVCo/NAPAS payload for one order: amount + the order's unique payment code as the transfer note. */
export function orderQrPayload(account: BankAccount, amount: number, payCode: string): string {
  return vietQrPayload({ bank: account.bin, accountNumber: account.accountNumber, amount, memo: payCode });
}
