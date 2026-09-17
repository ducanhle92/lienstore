/** Three-price display rule + change diff — pure unit tests:  npm run test:prices */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffProductChanges, expectedPriceOf, priceView, promoPriceOf, storedPrices } from "../../src/lib/price-display";

describe("priceView", () => {
  it("no references → plain price", () => {
    assert.deepEqual(priceView({ price: 100000, regularPrice: null, marketPrice: null }), { current: 100000, strike: null, pct: null, kind: null });
  });
  it("cheaper than the market → market price crossed out", () => {
    assert.deepEqual(priceView({ price: 152000, regularPrice: null, marketPrice: 200000 }), { current: 152000, strike: 200000, pct: 24, kind: "market" });
    assert.equal(priceView({ price: 152000, regularPrice: null, marketPrice: 150000 }).strike, null);
  });
  it("promotion → expected price crossed out, market ignored", () => {
    assert.deepEqual(priceView({ price: 152000, regularPrice: 275000, marketPrice: 300000 }), { current: 152000, strike: 275000, pct: 45, kind: "promo" });
  });
  it("expected / promo helpers and the stored mapping", () => {
    assert.equal(expectedPriceOf({ price: 152000, regularPrice: 275000 }), 275000);
    assert.equal(promoPriceOf({ price: 152000, regularPrice: 275000 }), 152000);
    assert.equal(promoPriceOf({ price: 275000, regularPrice: null }), null);
    assert.deepEqual(storedPrices(275000, 152000), { price: 152000, regularPrice: 275000 });
    assert.deepEqual(storedPrices(275000, null), { price: 275000, regularPrice: null });
    assert.deepEqual(storedPrices(275000, 300000), { price: 275000, regularPrice: null }); // not lower → ignored
  });
});

describe("diffProductChanges", () => {
  it("lists only the watched fields that actually changed", () => {
    const d = diffProductChanges({ price: 100, costPrice: 50, stock: null, name: "A" }, { price: 120, costPrice: 50, stock: 3, name: "A", marketPrice: 200 });
    assert.deepEqual(d, [
      { field: "price", old: "100", new: "120" },
      { field: "marketPrice", old: "", new: "200" },
      { field: "stock", old: "", new: "3" },
    ]);
  });
});
