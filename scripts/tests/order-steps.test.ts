import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderSteps } from "../../src/lib/shipping";

const keys = (o: Parameters<typeof orderSteps>[0], admin = false) => orderSteps(o, admin).steps.map((s) => s.key);

describe("order progress steps", () => {
  it("prepaid: payment right after the order", () => {
    assert.deepEqual(keys({ shipStage: "ordered", paymentMethod: "bacs", paidAt: null }), ["ordered", "paid", "sent", "in_transit", "vn_warehouse", "delivered"]);
  });
  it("COD: payment is the last step", () => {
    const r = orderSteps({ shipStage: "delivered", paymentMethod: "cod", paidAt: null });
    assert.deepEqual(r.steps.map((s) => s.key), ["ordered", "sent", "in_transit", "vn_warehouse", "delivered", "paid"]);
    assert.equal(r.steps.at(-1)!.label, "Hoàn tất thanh toán");
    assert.equal(r.current, 4, "delivered, not collected yet");
  });
  it("admin sees Đang giao hàng; the customer sees it folded into Đã về kho VN", () => {
    assert.ok(keys({ shipStage: "delivering", paymentMethod: "bacs", paidAt: "x" }, true).includes("delivering"));
    const c = orderSteps({ shipStage: "delivering", paymentMethod: "bacs", paidAt: "x" });
    assert.ok(!c.steps.some((s) => s.key === "delivering"));
    assert.equal(c.steps[c.current].key, "vn_warehouse");
    assert.match(c.steps[c.current].hint, /đang giao/);
  });
  it("paid prepaid order sits on Đã thanh toán until the goods leave", () => {
    const r = orderSteps({ shipStage: "ordered", paymentMethod: "bacs", paidAt: "2026-09-28T00:00:00Z" });
    assert.equal(r.steps[r.current].key, "paid");
  });
});
