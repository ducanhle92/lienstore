import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { BANK, transferContent } from "./payment";
import { getDb, getSetting, setSetting } from "./sqlite";
import { bankBin, vietQrPayload } from "./vietqr";

/** Receiving account for bank transfers (Admin › Tổng quan › Giao diện & Logo › Tài khoản nhận tiền); falls back to lib/payment defaults. */
export interface BankConfig {
  bank: string;
  bin: string;
  accountNumber: string;
  accountName: string;
  branch: string;
  /** Prefix of the transfer note, e.g. "LIENSTORE" → "LIENSTORE 1032". */
  memoPrefix: string;
}

export const BANK_KEYS = { bank: "bank_code", accountNumber: "bank_account", accountName: "bank_account_name", branch: "bank_branch", memoPrefix: "bank_memo_prefix" } as const;

export function loadBankConfig(db: DatabaseSync = getDb()): BankConfig {
  const bank = getSetting(db, BANK_KEYS.bank) || BANK.code;
  return {
    bank,
    bin: bankBin(bank) ?? bankBin(BANK.code) ?? "970418",
    accountNumber: getSetting(db, BANK_KEYS.accountNumber) || BANK.accountNumber,
    accountName: getSetting(db, BANK_KEYS.accountName) || BANK.accountName,
    branch: getSetting(db, BANK_KEYS.branch) || BANK.branch,
    memoPrefix: getSetting(db, BANK_KEYS.memoPrefix) || "LIENSTORE",
  };
}
export async function getBankConfig(): Promise<BankConfig> {
  return loadBankConfig();
}
export async function setBankConfig(c: Partial<Omit<BankConfig, "bin">>): Promise<void> {
  const db = getDb();
  if (c.bank !== undefined) setSetting(db, BANK_KEYS.bank, c.bank);
  if (c.accountNumber !== undefined) setSetting(db, BANK_KEYS.accountNumber, c.accountNumber);
  if (c.accountName !== undefined) setSetting(db, BANK_KEYS.accountName, c.accountName);
  if (c.branch !== undefined) setSetting(db, BANK_KEYS.branch, c.branch);
  if (c.memoPrefix !== undefined) setSetting(db, BANK_KEYS.memoPrefix, c.memoPrefix);
}

/** Transfer note for an order with the configured prefix. */
export function orderMemo(cfg: BankConfig, orderNumber: number): string {
  return cfg.memoPrefix === "LIENSTORE" ? transferContent(orderNumber) : `${cfg.memoPrefix} ${orderNumber}`;
}

/** EMVCo/NAPAS payload for one order (amount + note pre-filled). */
export function orderQrPayload(cfg: BankConfig, amount: number, orderNumber: number): string {
  return vietQrPayload({ bank: cfg.bin, accountNumber: cfg.accountNumber, amount, memo: orderMemo(cfg, orderNumber) });
}
