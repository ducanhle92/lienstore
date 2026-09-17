/** Sealed secrets in the settings table: round trip, legacy plain text, tamper / wrong-key behaviour. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSealed, maskSecret, openSecret, sealSecret } from "../../src/lib/secret-store";

describe("secret store", () => {
  it("seals and opens a value with a fresh IV each time", () => {
    const a = sealSecret("tok-1234567890", "s1");
    const b = sealSecret("tok-1234567890", "s1");
    assert.ok(isSealed(a) && isSealed(b));
    assert.notEqual(a, b);
    assert.equal(openSecret(a, "s1"), "tok-1234567890");
    assert.equal(openSecret(b, "s1"), "tok-1234567890");
  });
  it("passes legacy plain values through and keeps empty empty", () => {
    assert.equal(openSecret(" plain-token ", "s1"), "plain-token");
    assert.equal(sealSecret("", "s1"), "");
    assert.equal(openSecret("", "s1"), "");
    assert.equal(openSecret(null, "s1"), "");
  });
  it("yields empty when the server secret changed or the row was tampered", () => {
    const sealed = sealSecret("tok-1234567890", "s1");
    assert.equal(openSecret(sealed, "other"), "");
    assert.equal(openSecret(sealed.slice(0, -2) + "zz", "s1"), "");
  });
  it("masks to the last four characters", () => {
    assert.equal(maskSecret("abcdefgh"), "••••efgh");
    assert.equal(maskSecret(""), "");
  });
});
