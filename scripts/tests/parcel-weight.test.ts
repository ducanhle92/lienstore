/**
 * Estimated parcel weight for the Vietnam delivery (lib/shipping.ts):  npx tsx --test scripts/tests/parcel-weight.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_ITEM_WEIGHT_G, parcelWeightEstimate } from "../../src/lib/shipping";

describe("parcelWeightEstimate", () => {
  it("goods + 10 % packaging (min 50 g), rounded up to 50 g", () => {
    assert.deepEqual(parcelWeightEstimate([{ weightG: 30, quantity: 1 }]), { goodsG: 30, packagingG: 50, totalG: 100, missing: 0 });
    assert.deepEqual(parcelWeightEstimate([{ weightG: 450, quantity: 2 }, { weightG: 120, quantity: 1 }]), { goodsG: 1020, packagingG: 102, totalG: 1150, missing: 0 });
  });
  it("a product with no weight counts as the default and is reported", () => {
    const r = parcelWeightEstimate([{ weightG: null, quantity: 1 }, { weightG: 0, quantity: 2 }]);
    assert.equal(r.goodsG, DEFAULT_ITEM_WEIGHT_G * 3);
    assert.equal(r.missing, 2);
  });
  it("an empty order weighs nothing", () => {
    assert.deepEqual(parcelWeightEstimate([]), { goodsG: 0, packagingG: 0, totalG: 0, missing: 0 });
  });
});
