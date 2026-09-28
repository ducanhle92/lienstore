import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { availabilityOf, readyStock } from "../../src/lib/availability";

describe("availabilityOf (storefront “Có sẵn”)", () => {
  it("Có sẵn only when free units sit at Kho VN (shop)", () => {
    assert.equal(availabilityOf({ stockStatus: "instock", stock: 5, stockVn: 2, fulfillment: "stock" }), "available");
  });
  it("goods in Japan / on the way / all reserved are Hàng order", () => {
    assert.equal(availabilityOf({ stockStatus: "instock", stock: 5, stockVn: 0, fulfillment: "stock" }), "order_temp");
    assert.equal(availabilityOf({ stockStatus: "instock", stock: 5, stockVn: 0, fulfillment: "order" }), "order");
  });
  it("untracked products and discontinued ones keep their meaning", () => {
    assert.equal(availabilityOf({ stockStatus: "instock", stock: null, stockVn: null, fulfillment: "order" }), "order");
    assert.equal(availabilityOf({ stockStatus: "discontinued", stock: 3, stockVn: 3 }), "discontinued");
  });
  it("older data without stockVn falls back to stock", () => {
    assert.equal(readyStock({ stock: 4 }), 4);
    assert.equal(availabilityOf({ stockStatus: "instock", stock: 4 }), "available");
  });
});
