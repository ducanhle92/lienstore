/** Purchase-source registry helpers — pure unit tests:  npm run test:sources */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUILTIN_SOURCES, matchSourceByUrl, purchaseSourceDetail, resolvePurchaseSourceKey, sourceKeyFromName, UNKNOWN_SOURCE } from "../../src/lib/purchase-sources";

const reg = [...BUILTIN_SOURCES, { key: "don-quijote-shibuya", name: "Don Quijote Shibuya", kind: "store" as const, url: "https://www.donki.com/" }, { key: "yahoo-auction", name: "Yahoo Auction", kind: "auction" as const, url: "https://auctions.yahoo.co.jp/" }];

describe("sourceKeyFromName", () => {
  it("slugs Vietnamese / Japanese-store names", () => {
    assert.equal(sourceKeyFromName("Don Quijote Shibuya"), "don-quijote-shibuya");
    assert.equal(sourceKeyFromName("Cửa hàng Matsumoto Kiyoshi – Ueno"), "cua-hang-matsumoto-kiyoshi-ueno");
  });
});

describe("matchSourceByUrl", () => {
  it("prefers the most specific host", () => assert.equal(matchSourceByUrl("https://auctions.yahoo.co.jp/jp/auction/x123", reg)?.key, "yahoo-auction"));
  it("matches Amazon product links", () => assert.equal(matchSourceByUrl("https://www.amazon.co.jp/dp/B07G7BK9VMM", reg)?.key, "amazon"));
  it("matches an owner-added store site", () => assert.equal(matchSourceByUrl("https://www.donki.com/product/123", reg)?.key, "don-quijote-shibuya"));
  it("returns null for unknown hosts / garbage", () => {
    assert.equal(matchSourceByUrl("https://example.org/x", reg), null);
    assert.equal(matchSourceByUrl("not a url", reg), null);
  });
});

describe("resolvePurchaseSourceKey (CSV 'Nguồn giá')", () => {
  it("accepts key, display name (any case) and the unknown wording", () => {
    assert.equal(resolvePurchaseSourceKey("amazon", reg), "amazon");
    assert.equal(resolvePurchaseSourceKey("Don Quijote Shibuya", reg), "don-quijote-shibuya");
    assert.equal(resolvePurchaseSourceKey("YAHOO AUCTION", reg), "yahoo-auction");
    assert.equal(resolvePurchaseSourceKey("Chưa xác định", reg), UNKNOWN_SOURCE);
    assert.equal(resolvePurchaseSourceKey("cửa hàng lạ", reg), null);
    assert.equal(resolvePurchaseSourceKey("", reg), null);
  });
});

describe("purchaseSourceDetail", () => {
  it("lists kind, branch, address and host", () => assert.equal(purchaseSourceDetail({ kind: "store", url: "https://www.donki.com/", address: "28-6 Udagawacho", branch: "Shibuya" }), "Cửa hàng · Shibuya · 28-6 Udagawacho · donki.com"));
});
