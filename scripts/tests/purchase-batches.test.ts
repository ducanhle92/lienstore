import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BATCH_DONE, BATCH_STAGES, batchCode, batchTotals, groupBatchByProduct, isBatchStatus, planLineCover, planSurplusTake } from "../../src/lib/purchase-batches";

describe("batchCode", () => {
  it("is DG-YYMMDD-NN", () => {
    assert.equal(batchCode("2026-09-27", 1), "DG-260927-01");
    assert.equal(batchCode("2026-09-27", 12), "DG-260927-12");
  });
  it("falls back to today for a bad date", () => {
    assert.match(batchCode("nope", 3), /^DG-\d{6}-03$/);
  });
});

describe("BATCH_STAGES", () => {
  it("runs from gathering to the shop and no further", () => {
    assert.equal(BATCH_STAGES[0].key, "not_bought");
    assert.equal(BATCH_STAGES[0].short, "Đang gom");
    assert.equal(BATCH_STAGES.at(-1)?.key, BATCH_DONE);
    assert.ok(isBatchStatus("shipped_jp_vn"));
    assert.ok(!isBatchStatus("delivered"));
    assert.ok(!isBatchStatus("bogus"));
  });
});

describe("planSurplusTake", () => {
  const surplus = [
    { id: 1, qty: 2, expiry: "2027-06-30" },
    { id: 2, qty: 3, expiry: "2027-01-31" },
    { id: 3, qty: 1, expiry: null },
  ];
  it("serves the nearest expiry first", () => {
    assert.deepEqual(planSurplusTake(surplus, 4), { takes: [[2, 3], [1, 1]], short: 0 });
  });
  it("reports the shortfall when the surplus cannot cover the line", () => {
    assert.deepEqual(planSurplusTake(surplus, 10), { takes: [[2, 3], [1, 2], [3, 1]], short: 4 });
  });
  it("takes nothing for a zero need and skips empty rows", () => {
    assert.deepEqual(planSurplusTake([{ id: 9, qty: 0, expiry: null }], 0), { takes: [], short: 0 });
    assert.deepEqual(planSurplusTake([{ id: 9, qty: 0, expiry: null }], 1), { takes: [], short: 1 });
  });
});

describe("batchTotals / groupBatchByProduct", () => {
  const lines = [
    { productId: 7, productName: "B", productSku: null, productThumb: "", quantity: 2, costJpy: 500 },
    { productId: 5, productName: "A", productSku: "A1", productThumb: "", quantity: 1, costJpy: null },
  ];
  const stock = [{ productId: 7, productName: "B", productSku: null, productThumb: "", qty: 4, unitCostJpy: 450 }];
  it("sums units and only the known ¥", () => {
    assert.deepEqual(batchTotals(lines, stock), { orderUnits: 3, stockUnits: 4, units: 7, jpy: 500 * 2 + 450 * 4 });
    assert.equal(batchTotals([lines[1]], []).jpy, null);
  });
  it("groups per product, sorted by name", () => {
    const rows = groupBatchByProduct(lines, stock);
    assert.deepEqual(
      rows.map((r) => [r.productId, r.orderUnits, r.stockUnits]),
      [
        [5, 1, 0],
        [7, 2, 4],
      ],
    );
    assert.equal(rows[1].lines.length, 1);
    assert.equal(rows[1].stock.length, 1);
  });
});

describe("planLineCover", () => {
  const lines = [
    { itemId: 1, quantity: 2 },
    { itemId: 2, quantity: 3 },
    { itemId: 3, quantity: 1 },
  ];
  it("covers whole lines oldest first and keeps the rest for stock", () => {
    assert.deepEqual(planLineCover(lines, 4), { cover: [lines[0], lines[2]], left: 1 });
    assert.deepEqual(planLineCover(lines, 6), { cover: lines, left: 0 });
    assert.deepEqual(planLineCover(lines, 1), { cover: [lines[2]], left: 0 });
    assert.deepEqual(planLineCover([], 5), { cover: [], left: 5 });
  });
});
