/**
 * Paper invoice pagination (lib/invoice-layout.ts):  npm run test:invoice
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paginateInvoice } from "../../src/lib/invoice-layout";

const items = (n: number, len = 40) => Array.from({ length: n }, (_, i) => ({ name: `Sản phẩm ${i} `.padEnd(len, "x") }));

describe("paginateInvoice", () => {
  it("a short order fits on one page with totals and the payment block", () => {
    assert.deepEqual(paginateInvoice(items(2)), [{ rows: [0, 1], totals: true, payment: true }]);
  });
  it("every item appears exactly once, in order", () => {
    const pages = paginateInvoice(items(23));
    assert.deepEqual(pages.flatMap((p) => p.rows), Array.from({ length: 23 }, (_, i) => i));
  });
  it("a longer order pushes the payment block (QR) to a second page", () => {
    const pages = paginateInvoice(items(4, 70));
    assert.ok(pages.length >= 2, `pages ${pages.length}`);
    assert.equal(pages[pages.length - 1].payment, true);
    assert.equal(pages.filter((p) => p.payment).length, 1);
    assert.equal(pages.filter((p) => p.totals).length, 1);
  });
  it("totals come before (or on the same page as) the payment block", () => {
    for (const n of [1, 3, 5, 8, 12, 30]) {
      const pages = paginateInvoice(items(n, 60));
      const t = pages.findIndex((p) => p.totals);
      const pay = pages.findIndex((p) => p.payment);
      assert.ok(t <= pay && pay === pages.length - 1, `n=${n}`);
    }
  });
  it("a very long address or name never loops", () => {
    const pages = paginateInvoice([{ name: "x".repeat(2000) }], { address: "y".repeat(400) });
    assert.ok(pages.length <= 4);
  });
});
