/**
 * Chi phí vận hành (operating expenses) — pure helpers shared by the DB layer, the admin page and the tests.
 * First kind: `supplies` = đồ tiêu hao để đóng hàng (băng keo, xốp, thùng…) bought in Japan or Vietnam. The amount is
 * stored as entered (¥ or đ) plus its VND value at the ¥→đ rate of the day it was entered, so Kế toán can subtract it.
 */
export type ExpenseKind = "supplies" | "other";
export type ExpenseCurrency = "JPY" | "VND";

export const EXPENSE_KINDS: Array<{ key: ExpenseKind; label: string; hint: string }> = [
  { key: "supplies", label: "Đồ tiêu hao đóng hàng", hint: "Băng keo, xốp, thùng, túi… dùng để đóng kiện gửi ĐVVC" },
  { key: "other", label: "Chi phí khác", hint: "Chi phí vận hành khác không gắn với sản phẩm" },
];
export const isExpenseKind = (v: unknown): v is ExpenseKind => EXPENSE_KINDS.some((k) => k.key === v);
export const isExpenseCurrency = (v: unknown): v is ExpenseCurrency => v === "JPY" || v === "VND";

export interface Expense {
  id: number;
  kind: ExpenseKind;
  /** Shop day the money was spent (YYYY-MM-DD). */
  spentAt: string;
  title: string;
  store: string;
  amount: number;
  currency: ExpenseCurrency;
  /** ¥→đ rate used for the VND value (null for VND entries). */
  rate: number | null;
  amountVnd: number;
  note: string;
  files: ExpenseFile[];
  createdBy: string;
  createdAt: string;
}
export interface ExpenseFile {
  path: string;
  url: string;
  name: string;
  mime: string;
}

/** "1 234,5", "1.234", "¥1,234" → 1234.5; anything else → null. */
export function parseAmount(raw: string): number | null {
  const s = String(raw ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  // "1.234.567" / "1,234,567" are thousand separators; a single trailing ",5" or ".5" is a decimal
  const lastSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  const digitsAfter = lastSep >= 0 ? s.length - lastSep - 1 : 0;
  const normalized = lastSep >= 0 && digitsAfter > 0 && digitsAfter <= 2 && (s.match(/[.,]/g) ?? []).length === 1 ? s.slice(0, lastSep).replace(/[.,]/g, "") + "." + s.slice(lastSep + 1) : s.replace(/[.,]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** VND value of an entry: ¥ × rate rounded to the đồng; VND as entered. */
export function toVnd(amount: number, currency: ExpenseCurrency, rate: number | null): number {
  if (currency === "VND") return Math.round(amount);
  return Math.round(amount * (rate && rate > 0 ? rate : 0));
}

export const expenseMonth = (spentAt: string): string => spentAt.slice(0, 7);

/** VND total per month (YYYY-MM) and overall for a list of entries. */
export function sumExpenses(list: Array<Pick<Expense, "spentAt" | "amountVnd">>): { total: number; byMonth: Map<string, number> } {
  const byMonth = new Map<string, number>();
  let total = 0;
  for (const e of list) {
    total += e.amountVnd;
    const m = expenseMonth(e.spentAt);
    byMonth.set(m, (byMonth.get(m) ?? 0) + e.amountVnd);
  }
  return { total, byMonth };
}
