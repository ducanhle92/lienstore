/** Per-leg shipment status → where the goods are — pure unit tests:  npm run test:legs */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { goodsWhere, LEG_ORDER_STAGE, LEG_PURCHASE, stageRank } from "../../src/lib/leg-status";

describe("goodsWhere", () => {
  it("nothing moved → still in Japan", () => {
    assert.equal(goodsWhere([]), "jp_home");
    assert.equal(goodsWhere([{ leg: "jp_domestic", status: "pending" }]), "jp_home");
  });
  it("follows the furthest leg that moved", () => {
    assert.equal(goodsWhere([{ leg: "jp_domestic", status: "sent" }]), "jp_to_carrier");
    assert.equal(goodsWhere([{ leg: "jp_domestic", status: "arrived" }]), "jp_carrier");
    assert.equal(goodsWhere([{ leg: "jp_domestic", status: "arrived" }, { leg: "jp_vn", status: "sent" }]), "transit");
    assert.equal(goodsWhere([{ leg: "jp_vn", status: "arrived" }]), "vn_carrier");
    assert.equal(goodsWhere([{ leg: "vn_transfer", status: "arrived" }, { leg: "vn_domestic", status: "pending" }]), "shop");
    assert.equal(goodsWhere([{ leg: "vn_domestic", status: "sent" }]), "to_customer");
    assert.equal(goodsWhere([{ leg: "vn_domestic", status: "arrived" }]), "customer");
  });
  it("a later leg wins even when an earlier one was never marked", () => {
    assert.equal(goodsWhere([{ leg: "jp_domestic", status: "pending" }, { leg: "vn_transfer", status: "sent" }]), "to_shop");
  });
});

describe("leg → purchase status / order stage", () => {
  it("maps each leg to the purchase chain and the customer stage", () => {
    assert.equal(LEG_PURCHASE.jp_vn.sent, "shipped_jp_vn");
    assert.equal(LEG_PURCHASE.jp_vn.arrived, "at_carrier_vn");
    assert.equal(LEG_PURCHASE.vn_transfer.arrived, "at_shop");
    assert.equal(LEG_PURCHASE.vn_domestic.arrived, "delivered");
    assert.equal(LEG_ORDER_STAGE.jp_vn.sent, "in_transit");
    assert.equal(LEG_ORDER_STAGE.vn_transfer.arrived, "vn_warehouse");
    assert.equal(LEG_ORDER_STAGE.vn_domestic.arrived, "delivered");
    assert.equal(LEG_ORDER_STAGE.jp_domestic.sent, null);
  });
  it("stage ranks are monotonic so a leg never lowers the order stage", () => {
    assert.ok(stageRank("in_transit") < stageRank("vn_warehouse"));
    assert.ok(stageRank("vn_warehouse") < stageRank("delivering"));
    assert.ok(stageRank("delivering") < stageRank("delivered"));
  });
});
