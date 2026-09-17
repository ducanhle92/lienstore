/** Restock-planning formula (Kho hàng › Tồn kho) — pure unit tests:  npm run test:inventory */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeToBuy, pipelineStageOf, stockStateOf } from "../../src/lib/inventory";
import type { CatalogProduct } from "../../src/types/shop";

describe("computeToBuy — nguyên tắc 1: ưu tiên lấy từ kho / hàng đang về trước khi mua thêm", () => {
  it("a big inbound restock purchase must not be ignored by the minStock top-up (the reported bug)", () => {
    // stock 100, minStock 200, no open-order demand, but 1000 units are already bought and on the way —
    // buying another 100 for the reorder point would be wrong: 100 + 1000 already covers the buffer many times over.
    assert.equal(computeToBuy(100, 200, 0, 1000), 0);
  });
  it("still tops up to minStock when nothing is inbound", () => {
    assert.equal(computeToBuy(100, 200, 0, 0), 100);
  });
  it("tops up only the remainder when a smaller inbound purchase does not fully cover minStock", () => {
    assert.equal(computeToBuy(100, 200, 0, 50), 50); // 100 + 50 = 150, still 50 short of 200
  });

  it("covers open-order demand from stock + pipeline before topping up the buffer", () => {
    // demand 1500, pipeline 1000 (already bought), stock 100 → supply 1100, shortfall 400; after covering demand,
    // 0 is left for the buffer, so also top up the full 200 minStock.
    assert.equal(computeToBuy(100, 200, 1500, 1000), 600);
  });
  it("nguyên tắc 2: demand already fully covered by pipeline needs no purchase, even below minStock", () => {
    // demand 500, pipeline 1000 already covers it and then some; leftover 500 ≥ minStock 200 → no top-up either.
    assert.equal(computeToBuy(0, 200, 500, 1000), 0);
  });
  it("demand only partially covered by supply", () => {
    assert.equal(computeToBuy(20, 0, 50, 10), 20); // supply 30, shortfall 20, no buffer required
  });

  it("untracked stock (stock === null): every unit not already bought must be sourced, no buffer concept", () => {
    assert.equal(computeToBuy(null, 200, 30, 10), 20);
    assert.equal(computeToBuy(null, 200, 5, 10), 0);
  });
});

describe("pipelineStageOf — Trạng thái theo dõi (đang lưu kho / đang về / chưa mua)", () => {
  it("some stock on hand → 'in_stock', even when more is also incoming", () => {
    assert.equal(pipelineStageOf(5, 100, 0), "in_stock");
  });
  it("no stock but a warehouse-lot purchase is on the way → 'incoming'", () => {
    assert.equal(pipelineStageOf(0, 20, 0), "incoming");
    assert.equal(pipelineStageOf(null, 20, 0), "incoming");
  });
  it("nothing on hand, nothing incoming, but a purchase is needed → 'unbought'", () => {
    assert.equal(pipelineStageOf(0, 0, 10), "unbought");
    assert.equal(pipelineStageOf(null, 0, 10), "unbought");
  });
  it("nothing on hand, nothing incoming, nothing needed → null (no pipeline status to show)", () => {
    assert.equal(pipelineStageOf(0, 0, 0), null);
    assert.equal(pipelineStageOf(null, 0, 0), null);
  });
});

describe("stockStateOf", () => {
  const base: CatalogProduct = {
    id: 1, slug: "x", name: "X", price: 1000, regularPrice: null, marketPrice: null, costPrice: null, costJpy: null, costSource: "", costUrl: "",
    costCheckedAt: null, marginPct: null, supplierUrl: null, minStock: null, weightG: null, dimsConfidence: null, dimsSource: "",
    nameJa: "", shortDescriptionJa: "", descriptionJa: "", dimsCm: null, currency: "VNĐ", sku: null, stock: null, stockStatus: "instock",
    fulfillment: "order", categories: [], tags: [], images: [], thumb: "", shortDescription: "", description: "", related: [], rating: null,
    reviewCount: 0, status: "publish", createdAt: "", updatedAt: "", groupId: null, variantAttrs: {}, variantPosition: 0,
  };
  it("untracked (stock null) is 'untracked' unless discontinued", () => {
    assert.equal(stockStateOf(base, 10), "untracked");
    assert.equal(stockStateOf({ ...base, stockStatus: "discontinued" }, 10), "out");
  });
  it("tracked stock classifies out / low / ok against minStock", () => {
    assert.equal(stockStateOf({ ...base, stock: 0 }, 10), "out");
    assert.equal(stockStateOf({ ...base, stock: 5 }, 10), "low");
    assert.equal(stockStateOf({ ...base, stock: 10 }, 10), "low");
    assert.equal(stockStateOf({ ...base, stock: 11 }, 10), "ok");
  });
});
