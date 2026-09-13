/** Stock lots (lô hàng) — pure unit tests:  npm run test:lots */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { daysToExpiry, expiryState, fefo, parseExpiry, planConsumption } from "../../src/lib/lots";

const today = new Date("2026-09-14T10:00:00Z");

describe("expiry", () => {
  it("counts days and classifies", () => {
    assert.equal(daysToExpiry("2026-09-14", today), 0);
    assert.equal(daysToExpiry("2026-10-14", today), 30);
    assert.equal(expiryState("2026-09-01", 90, today), "expired");
    assert.equal(expiryState("2026-11-30", 90, today), "soon");
    assert.equal(expiryState("2027-12-31", 90, today), "ok");
    assert.equal(expiryState(null, 90, today), "none");
  });
  it("parses the formats printed on Japanese packs and typed by hand", () => {
    assert.equal(parseExpiry("2027-03-31"), "2027-03-31");
    assert.equal(parseExpiry("31/03/2027"), "2027-03-31");
    assert.equal(parseExpiry("2027-03"), "2027-03-31");
    assert.equal(parseExpiry("03/2027"), "2027-03-31");
    assert.equal(parseExpiry("2027.02"), "2027-02-28");
    assert.equal(parseExpiry("2028年2月"), "2028-02-29");
    assert.equal(parseExpiry("31/02/2027"), null);
    assert.equal(parseExpiry(""), null);
  });
});

describe("FEFO", () => {
  const lots = [
    { id: 1, expiry: null, receivedAt: "2026-01-01", qtyLeft: 5 },
    { id: 2, expiry: "2027-01-01", receivedAt: "2026-05-01", qtyLeft: 2 },
    { id: 3, expiry: "2026-12-01", receivedAt: "2026-06-01", qtyLeft: 1 },
    { id: 4, expiry: "2027-01-01", receivedAt: "2026-04-01", qtyLeft: 3 },
  ];
  it("orders earliest expiry first, no-expiry last, older receipt first on ties", () => assert.deepEqual(fefo(lots).map((l) => l.id), [3, 4, 2, 1]));
  it("plans consumption across lots and reports the shortfall", () => {
    assert.deepEqual(planConsumption(lots, 4), { takes: [[3, 1], [4, 3]], short: 0 });
    assert.deepEqual(planConsumption(lots, 12), { takes: [[3, 1], [4, 3], [2, 2], [1, 5]], short: 1 });
    assert.deepEqual(planConsumption([], 2), { takes: [], short: 2 });
  });
});
