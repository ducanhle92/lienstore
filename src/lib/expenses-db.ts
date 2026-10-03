import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { type Expense, type ExpenseCurrency, type ExpenseFile, type ExpenseKind, isExpenseCurrency, isExpenseKind, toVnd } from "./expenses";
import { getDb } from "./sqlite";

/** Chi phí vận hành (migration 72): one row per bill, files under uploads/expenses/<id>/ (admin-only route). */

interface Row {
  id: number;
  kind: string;
  spent_at: string;
  title: string;
  store: string;
  amount: number;
  currency: string;
  rate: number | null;
  amount_vnd: number;
  note: string;
  files: string;
  created_by: string;
  created_at: string;
}

const parseFiles = (s: string): ExpenseFile[] => {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v.filter((f) => f && typeof f.path === "string") : [];
  } catch {
    return [];
  }
};
const rowToExpense = (r: Row): Expense => ({
  id: r.id,
  kind: isExpenseKind(r.kind) ? r.kind : "other",
  spentAt: r.spent_at,
  title: r.title,
  store: r.store ?? "",
  amount: Number(r.amount),
  currency: isExpenseCurrency(r.currency) ? r.currency : "VND",
  rate: r.rate === null ? null : Number(r.rate),
  amountVnd: Number(r.amount_vnd),
  note: r.note ?? "",
  files: parseFiles(r.files),
  createdBy: r.created_by ?? "",
  createdAt: r.created_at,
});

export function createExpense(input: { kind: ExpenseKind; spentAt: string; title: string; store: string; amount: number; currency: ExpenseCurrency; rate: number | null; note: string; createdBy: string }): Expense {
  const db = getDb();
  const now = new Date().toISOString();
  const r = db
    .prepare("INSERT INTO expenses (kind, spent_at, title, store, amount, currency, rate, amount_vnd, note, files, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)")
    .run(input.kind, input.spentAt, input.title.slice(0, 120), input.store.slice(0, 80), input.amount, input.currency, input.currency === "JPY" ? input.rate : null, toVnd(input.amount, input.currency, input.rate), input.note.slice(0, 300), input.createdBy.slice(0, 80), now, now);
  return getExpense(Number(r.lastInsertRowid))!;
}

export function getExpense(id: number): Expense | null {
  const r = getDb().prepare("SELECT * FROM expenses WHERE id = ?").get(id) as Row | undefined;
  return r ? rowToExpense(r) : null;
}

/** Entries by shop day (inclusive), newest first. */
export function listExpenses(opts: { from?: string; to?: string; kind?: ExpenseKind; limit?: number } = {}, db: DatabaseSync = getDb()): Expense[] {
  const where: string[] = [];
  const args: Array<string | number> = [];
  if (opts.from) {
    where.push("spent_at >= ?");
    args.push(opts.from);
  }
  if (opts.to) {
    where.push("spent_at <= ?");
    args.push(opts.to);
  }
  if (opts.kind) {
    where.push("kind = ?");
    args.push(opts.kind);
  }
  const rows = db.prepare(`SELECT * FROM expenses ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY spent_at DESC, id DESC LIMIT ?`).all(...args, opts.limit ?? 500) as unknown as Row[];
  return rows.map(rowToExpense);
}

export function deleteExpense(id: number): Expense | null {
  const e = getExpense(id);
  if (!e) return null;
  getDb().prepare("DELETE FROM expenses WHERE id = ?").run(id);
  return e;
}

export function addExpenseFiles(id: number, files: ExpenseFile[]): void {
  const e = getExpense(id);
  if (!e) return;
  getDb().prepare("UPDATE expenses SET files = ?, updated_at = ? WHERE id = ?").run(JSON.stringify([...e.files, ...files]), new Date().toISOString(), id);
}

export function removeExpenseFile(id: number, path: string): ExpenseFile | null {
  const e = getExpense(id);
  const f = e?.files.find((x) => x.path === path) ?? null;
  if (!e || !f) return null;
  getDb().prepare("UPDATE expenses SET files = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(e.files.filter((x) => x.path !== path)), new Date().toISOString(), id);
  return f;
}
