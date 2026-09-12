/** Per-order payment code + SePay-style content parsing — pure unit tests:  npm run test:paycode */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractPayCode, isPayCode, makePayCode, normalizePayPrefix, PAY_CODE_ALPHABET } from "../../src/lib/pay-code";

describe("normalizePayPrefix", () => {
  it("uppercases and strips everything but letters", () => assert.equal(normalizePayPrefix(" ls-9 "), "LS"));
  it("falls back to LS", () => assert.equal(normalizePayPrefix(""), "LS"));
  it("caps at 6 letters", () => assert.equal(normalizePayPrefix("lienstorexyz"), "LIENST"));
});

describe("makePayCode", () => {
  it("is prefix + order number + 3 chars from the safe alphabet", () => {
    const code = makePayCode("LS", 1034, () => 0.42);
    assert.match(code, /^LS1034[A-Z2-9]{3}$/);
    assert.ok(isPayCode(code));
  });
  it("only ever contains uppercase letters and digits (no 0/O/1/I)", () => {
    for (let i = 0; i < 500; i++) {
      const code = makePayCode("LS", 1000 + i);
      assert.match(code, /^[A-Z0-9]+$/);
      assert.ok(!/[OI]/.test(code.slice(2 + String(1000 + i).length)));
    }
    assert.ok(!PAY_CODE_ALPHABET.includes("0") && !PAY_CODE_ALPHABET.includes("1") && !PAY_CODE_ALPHABET.includes("O") && !PAY_CODE_ALPHABET.includes("I"));
  });
  it("differs between orders and between draws", () => {
    assert.notEqual(makePayCode("LS", 1034), makePayCode("LS", 1035));
    const set = new Set(Array.from({ length: 50 }, () => makePayCode("LS", 1034)));
    assert.ok(set.size > 1);
  });
});

describe("extractPayCode (bank / SePay transfer content)", () => {
  it("finds the code alone", () => assert.equal(extractPayCode("LS1034K7Q", "LS"), "LS1034K7Q"));
  it("finds the code inside a bank sentence with diacritics stripped by the bank", () => assert.equal(extractPayCode("CT DEN:123456 LS1034K7Q thanh toan don hang", "LS"), "LS1034K7Q"));
  it("is case-insensitive and tolerates punctuation around it", () => assert.equal(extractPayCode("MBVCB.4567.ls1034k7q.CT tu NGUYEN VAN A", "LS"), "LS1034K7Q"));
  it("returns null when there is no code", () => assert.equal(extractPayCode("thanh toan tien hang", "LS"), null));
  it("does not confuse another prefix", () => assert.equal(extractPayCode("ABC1034K7Q", "LS"), null));
  it("honours a custom prefix", () => assert.equal(extractPayCode("LIEN2001ABC ck", "lien"), "LIEN2001ABC"));
});
