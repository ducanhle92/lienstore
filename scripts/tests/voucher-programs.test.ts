/** Voucher programs: home-page grouping and colour palette lookups. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupVouchersByProgram, isVoucherColor, voucherPalette } from "../../src/lib/voucher-programs";

describe("voucher programs", () => {
  const programs = [
    { id: 2, position: 1, active: true },
    { id: 1, position: 0, active: true },
    { id: 3, position: 2, active: false },
  ];
  it("groups vouchers per active program in position order; orphans join the first strip", () => {
    const g = groupVouchersByProgram(programs, [
      { code: "A", programId: 2 },
      { code: "B", programId: 1 },
      { code: "C", programId: null },
      { code: "D", programId: 3 },
      { code: "E", programId: 99 },
    ]);
    assert.deepEqual(g.map((x) => x.program.id), [1, 2]);
    assert.deepEqual(g[0].vouchers.map((v) => v.code), ["B", "C", "D", "E"]);
    assert.deepEqual(g[1].vouchers.map((v) => v.code), ["A"]);
  });
  it("drops programs without vouchers and returns nothing when no program is active", () => {
    assert.deepEqual(groupVouchersByProgram(programs, [{ code: "A", programId: 2 }]).map((x) => x.program.id), [2]);
    assert.deepEqual(groupVouchersByProgram([{ id: 1, position: 0, active: false }], [{ code: "A", programId: 1 }]), []);
  });
  it("falls back to the brand red palette for unknown colours", () => {
    assert.ok(isVoucherColor("blue"));
    assert.ok(!isVoucherColor("magenta"));
    assert.equal(voucherPalette("magenta").label, "Đỏ thương hiệu");
    assert.equal(voucherPalette("blue").label, "Xanh nước biển");
  });
});
