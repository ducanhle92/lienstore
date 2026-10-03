/**
 * Chi phí vận hành (đồ tiêu hao) — pure helpers:  npm run test:expenses
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expenseMonth, isExpenseCurrency, isExpenseKind, parseAmount, sumExpenses, toVnd } from "../../src/lib/expenses";

describe("parseAmount", () => {
  it("reads plain, thousand-separated and decimal amounts", () => {
    assert.equal(parseAmount("1980"), 1980);
    assert.equal(parseAmount("¥1,980"), 1980);
    assert.equal(parseAmount("1.234.567"), 1234567);
    assert.equal(parseAmount("1,234,567đ"), 1234567);
    assert.equal(parseAmount("12,5"), 12.5);
    assert.equal(parseAmount("12.50"), 12.5);
    assert.equal(parseAmount(" 300 "), 300);
  });
  it("rejects garbage and negatives", () => {
    assert.equal(parseAmount(""), null);
    assert.equal(parseAmount("abc"), null);
    assert.equal(parseAmount("-5"), null);
  });
});

describe("toVnd", () => {
  it("converts yen at the given rate, rounded to the đồng", () => {
    assert.equal(toVnd(1980, "JPY", 170), 336600);
    assert.equal(toVnd(12.5, "JPY", 170.4), 2130);
  });
  it("keeps VND as entered and treats a missing rate as 0", () => {
    assert.equal(toVnd(45000, "VND", null), 45000);
    assert.equal(toVnd(100, "JPY", null), 0);
  });
});

describe("sumExpenses", () => {
  it("totals per month and overall", () => {
    const r = sumExpenses([
      { spentAt: "2026-10-01", amountVnd: 100 },
      { spentAt: "2026-10-20", amountVnd: 250 },
      { spentAt: "2026-09-30", amountVnd: 40 },
    ]);
    assert.equal(r.total, 390);
    assert.equal(r.byMonth.get("2026-10"), 350);
    assert.equal(r.byMonth.get("2026-09"), 40);
    assert.equal(expenseMonth("2026-10-03"), "2026-10");
  });
});

describe("guards", () => {
  it("accept only known kinds and currencies", () => {
    assert.equal(isExpenseKind("supplies"), true);
    assert.equal(isExpenseKind("salary"), false);
    assert.equal(isExpenseCurrency("JPY"), true);
    assert.equal(isExpenseCurrency("USD"), false);
  });
});
