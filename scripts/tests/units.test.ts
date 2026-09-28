import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { billLineKey, dammDigit, groupCodeFromName, normalizeGroupCode, parseUnitCode, slowestStatus, sortUnits, stageFromUnits, unitCode, unitExpired, unitIdOf } from "../../src/lib/units";

describe("unit codes (H + 6 digits + Damm check digit)", () => {
  it("known Damm vector", () => {
    assert.equal(dammDigit("572"), 4);
  });
  it("builds and reads back", () => {
    const c = unitCode(123);
    assert.match(c, /^H000123\d$/);
    assert.equal(parseUnitCode(c), c);
    assert.equal(unitIdOf(c), 123);
    assert.equal(parseUnitCode(` ${c.toLowerCase()} `), c, "lower case / spaces");
    assert.equal(parseUnitCode(`${c.slice(0, 4)}-${c.slice(4)}`), c, "a dash is ignored");
  });
  it("rejects every single-digit typo and every neighbour swap", () => {
    const c = unitCode(40721);
    const digits = c.slice(1);
    for (let i = 0; i < digits.length; i++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === digits[i]) continue;
        const wrong = `H${digits.slice(0, i)}${d}${digits.slice(i + 1)}`;
        assert.equal(parseUnitCode(wrong), null, wrong);
      }
      if (i < digits.length - 1 && digits[i] !== digits[i + 1]) {
        const swapped = `H${digits.slice(0, i)}${digits[i + 1]}${digits[i]}${digits.slice(i + 2)}`;
        assert.equal(parseUnitCode(swapped), null, swapped);
      }
    }
  });
  it("grows past a million", () => {
    assert.equal(unitCode(1234567).length, 9);
    assert.equal(unitIdOf(unitCode(1234567)), 1234567);
  });
});

describe("which unit serves first", () => {
  const u = (id: number, status: Parameters<typeof sortUnits>[0][number]["status"], expiry: string | null, boughtAt: string | null = null) => ({ id, status, expiry, boughtAt });
  it("place before expiry, then FEFO, then earlier bill, then oldest code", () => {
    const order = sortUnits([u(1, "bought", "2026-12-31"), u(2, "at_shop", "2029-01-31"), u(3, "at_shop", "2027-06"), u(4, "shipped_jp_vn", null), u(5, "at_shop", "2027-06", "2026-09-01"), u(6, "ordered", "2026-11-30")]).map((x) => x.id);
    assert.deepEqual(order, [5, 3, 2, 4, 1, 6]);
  });
  it("expiry by month means the end of that month", () => {
    assert.equal(unitExpired("2026-09", "2026-09-28"), false);
    assert.equal(unitExpired("2026-08", "2026-09-28"), true);
    assert.equal(unitExpired(null), false);
  });
});

describe("order stage from its units", () => {
  it("maps the slowest unit", () => {
    assert.equal(stageFromUnits("bought", false), "ordered");
    assert.equal(stageFromUnits("bought", true), "sent");
    assert.equal(stageFromUnits("to_carrier_jp", false), "in_transit");
    assert.equal(stageFromUnits("to_shop", false), "in_transit");
    assert.equal(stageFromUnits("at_shop", false), "vn_warehouse");
    assert.equal(stageFromUnits("shipped_to_customer", false), "delivering");
    assert.equal(stageFromUnits("delivered", false), "delivered");
    assert.equal(slowestStatus(["at_shop", "shipped_jp_vn", "delivered"]), "shipped_jp_vn");
  });
});

describe("bill line and group codes", () => {
  it("same bill / price / expiry = one line", () => {
    const a = { productId: 1, receiptId: 9, sourceKey: "amazon", store: "", boughtAt: "2026-09-27", expiry: null, unitCostJpy: 500, batchId: 3 };
    assert.equal(billLineKey(a), billLineKey({ ...a }));
    assert.notEqual(billLineKey(a), billLineKey({ ...a, unitCostJpy: 510 }));
  });
  it("variant group code from the name", () => {
    assert.equal(groupCodeFromName("Sữa tắm Hatomugi"), "SUA-TAM-HATOMUGI");
    assert.equal(groupCodeFromName("Viên uống tiền mãn kinh Kobayashi Inochi no Haha").length <= 24, true);
    assert.equal(normalizeGroupCode(" hatomugi sữa tắm! "), "HATOMUGI-SUA-TAM");
  });
});
