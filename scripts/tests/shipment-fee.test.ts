/**
 * ⑤ Phí ship ĐVVC → shop VN — split by weight (lib/shipment-fee.ts):  npx tsx --test scripts/tests/shipment-fee.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseVnd, splitByWeight } from "../../src/lib/shipment-fee";

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe("splitByWeight", () => {
  it("shares by weight and adds up to the exact amount", () => {
    const m = splitByWeight(244000, [
      { key: "A", grams: 1000 },
      { key: "B", grams: 500 },
      { key: "", grams: 500 },
    ]);
    assert.deepEqual([...m.entries()], [["A", 122000], ["B", 61000], ["", 61000]]);
  });
  it("rounding never loses or invents a đồng", () => {
    for (const total of [1, 7, 100, 244000, 999999]) {
      const m = splitByWeight(total, [{ key: "a", grams: 333 }, { key: "b", grams: 333 }, { key: "c", grams: 334 }]);
      assert.equal(sum(m), total, `total ${total}`);
    }
  });
  it("no weights at all → equal shares", () => {
    const m = splitByWeight(100, [{ key: "a", grams: 0 }, { key: "b", grams: 0 }, { key: "c", grams: 0 }]);
    assert.equal(sum(m), 100);
    assert.ok([...m.values()].every((v) => v === 33 || v === 34));
  });
  it("nothing to share → empty", () => {
    assert.equal(splitByWeight(5000, []).size, 0);
  });
});

describe("parseVnd", () => {
  it("reads the ways people type money", () => {
    assert.equal(parseVnd("244.000"), 244000);
    assert.equal(parseVnd("244,000"), 244000);
    assert.equal(parseVnd("244000đ"), 244000);
    assert.equal(parseVnd("244 000 VND"), 244000);
  });
  it("rejects garbage", () => {
    assert.equal(parseVnd(""), null);
    assert.equal(parseVnd("abc"), null);
    assert.equal(parseVnd("-5"), null);
  });
});
