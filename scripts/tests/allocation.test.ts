import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type AllocCandidate, candidateTier, combineStatuses, planAllocation, sortCandidates, statusFromSource } from "../../src/lib/allocation";
import { isRegularBy, normalizePhone } from "../../src/lib/regular-customers";

const lot = (id: number, warehouse: "vn" | "carrier" | "jp_carrier" | "jp", available: number, expiry: string | null): AllocCandidate => ({ type: "lot", id, available, expiry, warehouse, status: null, batchId: null });
const slip = (id: number, status: AllocCandidate["status"], available: number, expiry: string | null, batchId: number | null = null): AllocCandidate => ({ type: "stock_purchase", id, available, expiry, warehouse: null, status, batchId });

describe("planAllocation", () => {
  it("serves the whole line from the VN warehouse when it has enough", () => {
    const r = planAllocation(2, [lot(1, "vn", 3, "2027-06-30"), slip(9, "not_bought", 5, null, 4)]);
    assert.deepEqual(r, { takes: [{ type: "lot", id: 1, qty: 2 }], short: 0 });
  });
  it("place first: a VN lot beats a Japan lot even when the Japan lot expires sooner", () => {
    const r = planAllocation(1, [lot(1, "vn", 3, "2027-06-30"), lot(2, "jp", 3, "2027-01-31")]);
    assert.deepEqual(r.takes, [{ type: "lot", id: 1, qty: 1 }]);
  });
  it("same place → FEFO, then the earlier bill", () => {
    const sorted = sortCandidates([{ ...lot(1, "jp", 1, "2027-06-30"), boughtAt: "2026-09-27" }, { ...lot(2, "jp", 1, "2027-06-30"), boughtAt: "2026-09-26" }, lot(3, "jp", 1, "2027-01-31")]);
    assert.deepEqual(sorted.map((c) => c.id), [3, 2, 1]);
  });
  it("a lot on the move ranks between the two places (đang về kho shop before kho ĐVVC VN, đang bay before kho ĐVVC Nhật)", () => {
    const sorted = sortCandidates([lot(1, "jp", 1, null), { ...lot(2, "jp_carrier", 1, null), inTransit: true }, lot(3, "jp_carrier", 1, null), { ...lot(4, "carrier", 1, null), inTransit: true }, lot(5, "carrier", 1, null), lot(6, "vn", 1, null)]);
    assert.deepEqual(sorted.map((c) => c.id), [6, 4, 5, 2, 3, 1]);
  });
  it("same expiry → closest to Vietnam first (VN → ĐVVC → Nhật → slip)", () => {
    const sorted = sortCandidates([slip(7, "bought", 1, "2027-03-31"), lot(3, "jp", 1, "2027-03-31"), lot(2, "carrier", 1, "2027-03-31"), lot(1, "vn", 1, "2027-03-31")]);
    assert.deepEqual(
      sorted.map((c) => `${c.type}:${c.id}`),
      ["lot:1", "lot:2", "lot:3", "stock_purchase:7"],
    );
  });
  it("bought slips closer to Vietnam come before those still in Japan; unknown expiry goes last within the tier", () => {
    const sorted = sortCandidates([slip(1, "bought", 1, null), slip(2, "at_carrier_vn", 1, null), lot(5, "jp", 1, null), lot(6, "vn", 1, "2028-01-01")]);
    assert.deepEqual(
      sorted.map((c) => `${c.type}:${c.id}`),
      ["lot:6", "lot:5", "stock_purchase:2", "stock_purchase:1"],
    );
  });
  it("VN short by one → the rest comes from the gathering batch, then 'buy'", () => {
    const r = planAllocation(3, [lot(1, "vn", 1, "2027-06-30"), slip(9, "not_bought", 1, null, 4)]);
    assert.deepEqual(r, {
      takes: [
        { type: "lot", id: 1, qty: 1 },
        { type: "stock_purchase", id: 9, qty: 1 },
      ],
      short: 1,
    });
  });
  it("never takes more than what is available (a second order only gets the remainder)", () => {
    const first = planAllocation(2, [lot(1, "vn", 3, null)]);
    const second = planAllocation(2, [lot(1, "vn", 3 - first.takes[0].qty, null)]);
    assert.deepEqual(second, { takes: [{ type: "lot", id: 1, qty: 1 }], short: 1 });
  });
  it("tiers: bought < in a batch < loose not-bought slip", () => {
    assert.equal(candidateTier(lot(1, "jp", 1, null)), 0);
    assert.equal(candidateTier(slip(1, "bought", 1, null)), 0);
    assert.equal(candidateTier(slip(1, "not_bought", 1, null, 3)), 1);
    assert.equal(candidateTier(slip(1, "not_bought", 1, null)), 2);
  });
});

describe("statusFromSource / combineStatuses", () => {
  it("maps a source to the line status", () => {
    assert.equal(statusFromSource({ type: "lot", warehouse: "vn" }), "at_shop");
    assert.equal(statusFromSource({ type: "lot", warehouse: "carrier" }), "at_carrier_vn");
    assert.equal(statusFromSource({ type: "lot", warehouse: "jp" }), "bought");
    assert.equal(statusFromSource({ type: "lot", warehouse: "jp_carrier" }), "to_carrier_jp");
    assert.equal(statusFromSource({ type: "lot", warehouse: "jp_carrier", inTransit: true }), "shipped_jp_vn");
    assert.equal(statusFromSource({ type: "lot", warehouse: "carrier", inTransit: true }), "to_shop");
    assert.equal(statusFromSource({ type: "lot", warehouse: null, consumed: true }), "at_shop");
    assert.equal(statusFromSource({ type: "stock_purchase", status: "shipped_jp_vn" }), "shipped_jp_vn");
    assert.equal(statusFromSource({ type: "buy" }), "not_bought");
  });
  it("a split line shows the least advanced part", () => {
    assert.equal(combineStatuses(["at_shop", "bought"]), "bought");
    assert.equal(combineStatuses(["at_shop", "not_bought"]), "not_bought");
    assert.equal(combineStatuses([]), "not_bought");
  });
});

describe("regular customers", () => {
  it("normalises phone numbers so +84 and 0 spellings match", () => {
    assert.equal(normalizePhone("+84 964 839 769"), "0964839769");
    assert.equal(normalizePhone("0964.839.769"), "0964839769");
    assert.equal(normalizePhone(""), "");
  });
  it("is regular by account flag or remembered phone", () => {
    const phones = new Set(["0964839769"]);
    assert.equal(isRegularBy({ accountRegular: true, phone: "", regularPhones: phones }), true);
    assert.equal(isRegularBy({ accountRegular: false, phone: "+84964839769", regularPhones: phones }), true);
    assert.equal(isRegularBy({ accountRegular: false, phone: "0900000000", regularPhones: phones }), false);
  });
});
