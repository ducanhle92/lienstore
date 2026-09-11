/**
 * Unit tests for the pure parts of the GHN client (no network):  npm run test:ghn
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GhnApiError, normalizeFee, packageDims, pickService, rateLimited, validateQuoteInput } from "../../src/lib/ghn";

const services = [
  { service_id: 53320, short_name: "Hàng nhẹ", service_type_id: 2 },
  { service_id: 100039, short_name: "Hàng nặng", service_type_id: 5 },
];

describe("pickService", () => {
  it("chooses light goods under 20 kg", () => assert.equal(pickService(services, 500)?.service_type_id, 2));
  it("chooses heavy goods from 20 kg", () => assert.equal(pickService(services, 20_000)?.service_type_id, 5));
  it("falls back to the other type when only one exists", () => assert.equal(pickService([services[1]], 500)?.service_type_id, 5));
  it("returns null when the route has nothing", () => assert.equal(pickService([], 500), null));
});

describe("normalizeFee", () => {
  it("maps every GHN field and tolerates missing ones", () => {
    const f = normalizeFee({ total: 29001, service_fee: 29001 });
    assert.deepEqual(f, { total: 29001, shipping: 29001, insurance: 0, cod: 0, pickupRemoteArea: 0, deliveryRemoteArea: 0, coupon: 0 });
  });
  it("keeps remote-area and cod fees", () => {
    const f = normalizeFee({ total: 40000, service_fee: 29000, cod_fee: 5500, deliver_remote_areas_fee: 5500 });
    assert.equal(f.cod, 5500);
    assert.equal(f.deliveryRemoteArea, 5500);
  });
});

describe("validateQuoteInput", () => {
  const ok = { toDistrictId: 1444, toWardCode: "20308", weight: 500, length: 10, width: 10, height: 10 };
  it("accepts the reference case", () => assert.doesNotThrow(() => validateQuoteInput(ok)));
  it("rejects a non-positive weight", () => assert.throws(() => validateQuoteInput({ ...ok, weight: 0 }), (e: unknown) => e instanceof GhnApiError && e.code === "INVALID_QUOTE_INPUT"));
  it("rejects an empty ward code", () => assert.throws(() => validateQuoteInput({ ...ok, toWardCode: " " })));
  it("keeps leading zeros of ward codes (string)", () => assert.doesNotThrow(() => validateQuoteInput({ ...ok, toWardCode: "00123" })));
  it("rejects negative cod", () => assert.throws(() => validateQuoteInput({ ...ok, codValue: -1 })));
});

describe("packageDims", () => {
  it("stacks items on their thinnest side and keeps the largest footprint", () => {
    assert.deepEqual(packageDims([{ dims: "21.7x13.2x3.3", quantity: 2 }, { dims: "8x8x24", quantity: 1 }]), { length: 24, width: 14, height: 15 });
  });
  it("uses a conservative box for unknown items and never goes below 10 cm", () => {
    assert.deepEqual(packageDims([{ dims: null, quantity: 1 }]), { length: 15, width: 10, height: 10 });
  });
});

describe("rateLimited", () => {
  it("allows the first calls and blocks after the limit", () => {
    const ip = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) assert.equal(rateLimited(ip, 3, 60_000), false);
    assert.equal(rateLimited(ip, 3, 60_000), true);
  });
});
