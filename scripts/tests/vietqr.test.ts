/** VietQR payload — pure unit tests:  npm run test:vietqr */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bankBin, crc16, parseTlv, sanitizeMemo, vietQrPayload } from "../../src/lib/vietqr";

describe("crc16 (CCITT-FALSE)", () => {
  it("matches the reference vector", () => assert.equal(crc16("123456789"), "29B1"));
  it("is stable for an EMV payload prefix", () => assert.equal(crc16("00020101021138580010A000000727").length, 4));
});

describe("vietQrPayload", () => {
  const p = vietQrPayload({ bank: "BIDV", accountNumber: "26010000748323", amount: 974850, memo: "LIENSTORE 1032" });
  const f = parseTlv(p);
  it("has the EMVCo skeleton (dynamic, VND, VN, NAPAS IBFT to account)", () => {
    assert.equal(f["00"], "01");
    assert.equal(f["01"], "12");
    assert.equal(f["53"], "704");
    assert.equal(f["58"], "VN");
    const m = parseTlv(f["38"]);
    assert.equal(m["00"], "A000000727");
    assert.equal(m["02"], "QRIBFTTA");
    const acc = parseTlv(m["01"]);
    assert.equal(acc["00"], "970418");
    assert.equal(acc["01"], "26010000748323");
  });
  it("carries amount and memo, and a valid trailing CRC", () => {
    assert.equal(f["54"], "974850");
    assert.equal(parseTlv(f["62"])["08"], "LIENSTORE 1032");
    assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
    assert.ok(p.slice(0, -4).endsWith("6304"));
  });
  it("static code without amount uses point-of-initiation 11 and no field 54", () => {
    const s = parseTlv(vietQrPayload({ bank: "970436", accountNumber: "0011001234567" }));
    assert.equal(s["01"], "11");
    assert.equal(s["54"], undefined);
  });
  it("rejects unknown banks and resolves short codes / BINs", () => {
    assert.throws(() => vietQrPayload({ bank: "NOBANK", accountNumber: "1" }));
    assert.equal(bankBin("vietcombank"), "970436");
    assert.equal(bankBin("970422"), "970422");
    assert.equal(bankBin("xyz"), null);
  });
  it("memo is ASCII, single-spaced, ≤ 25 chars", () => {
    assert.equal(sanitizeMemo("Đơn hàng  #1032 — LiênStore"), "Don hang 1032 LienStore");
    assert.ok(sanitizeMemo("x".repeat(60)).length === 25);
  });
});
