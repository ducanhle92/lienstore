/**
 * Kiến Express tracking — pure unit tests with fixtures, no network, no DB:  npm run test:kien
 * Covers code validation, the fixed URL, response normalisation (5 known states, unordered / empty / unknown histories,
 * de-duplication, two KEA codes sharing one PU pickup, code mismatch), fetch failures (404, 5xx + Retry-After, timeout,
 * network), the stale guard, and the run-status plan (forward-only, delivered display-only, no stock side effects).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchKienTracking,
  isKienCode,
  KIEN_STATUS_CODES,
  kienResultIsStale,
  kienSearchUrl,
  kienStepIndex,
  kienTrackingPageUrl,
  normalizeKienCode,
  parseKienResponse,
  planKienSync,
  runStatusForKien,
  type KienFetcher,
} from "../../src/lib/carriers/kien-express";

const hist = (statusCode: string, datetime: string, label?: string) => ({ orderPackId: 1, statusCode, datetime, status: { code: statusCode, label: label ?? statusCode } });
/** A full parcel: the five states in the order Kiến sends them (fixture modelled on a real reply, test codes only). */
const full = (code = "KEA260930002", pu = "PU26093001") => ({
  id: 90001,
  orderId: 90002,
  code,
  providerTrackingCode: pu,
  histories: [
    hist("waiting", "2026-09-30T01:34:48.000Z", "Nhận yêu cầu"),
    hist("warehouse_jp", "2026-09-30T04:26:18.000Z", "Kho JP đang xử lý"),
    hist("shipping", "2026-09-30T23:55:46.000Z", "Đang vận chuyển"),
    hist("warehouse_hn", "2026-10-03T14:51:49.000Z", "Kho HN đang xử lý"),
    hist("delivered", "2026-10-04T08:00:00.000Z", "Đã giao hàng xong"),
  ],
});
const okData = (body: unknown, code = "KEA260930002") => {
  const r = parseKienResponse(body, code);
  assert.ok(r.ok, `expected ok, got ${JSON.stringify(r)}`);
  return r.data;
};

describe("KEA code", () => {
  it("normalises case / spaces and rejects anything else", () => {
    assert.equal(normalizeKienCode(" kea260930002 "), "KEA260930002");
    assert.equal(normalizeKienCode("PU26093001"), "");
    assert.equal(normalizeKienCode("KEA"), "");
    assert.equal(normalizeKienCode("https://evil.example/?code=KEA260930002"), "");
    assert.equal(isKienCode("KEA240227004"), true);
    assert.equal(isKienCode(""), false);
  });
  it("builds only the fixed host URL and the public tracking link", () => {
    assert.equal(kienSearchUrl("KEA260930002"), "https://api.kienexpress.jp/orders/search?code=KEA260930002");
    assert.equal(kienTrackingPageUrl("KEA260930002"), "http://kienexpress.jp/tracking/KEA260930002");
  });
});

describe("parseKienResponse", () => {
  it("maps the five statusCodes, keeps id ≠ orderId and the provider code", () => {
    const d = okData(full());
    assert.deepEqual(d.events.map((e) => e.code), KIEN_STATUS_CODES);
    assert.equal(d.kienId, "90001");
    assert.equal(d.kienOrderId, "90002");
    assert.equal(d.providerTrackingCode, "PU26093001");
    assert.equal(d.latest?.code, "delivered");
    assert.equal(d.latest?.at, "2026-10-04T08:00:00.000Z");
    assert.deepEqual(d.unknownCodes, []);
    assert.ok(d.events.every((e) => e.known));
    assert.equal(KIEN_STATUS_CODES.map(kienStepIndex).join(""), "01234");
  });
  it("sorts an unordered history by datetime and takes the newest as latest", () => {
    const body = full();
    body.histories = [body.histories[3], body.histories[0], body.histories[2], body.histories[1]];
    const d = okData(body);
    assert.deepEqual(d.events.map((e) => e.code), ["waiting", "warehouse_jp", "shipping", "warehouse_hn"]);
    assert.equal(d.latest?.code, "warehouse_hn");
  });
  it("handles an empty / missing history", () => {
    const d = okData({ ...full(), histories: [] });
    assert.equal(d.events.length, 0);
    assert.equal(d.latest, null);
    const d2 = okData({ id: 1, orderId: 1, code: "KEA260930002" });
    assert.equal(d2.latest, null);
  });
  it("keeps unknown status codes flagged instead of guessing", () => {
    const body = full();
    body.histories = [hist("waiting", "2026-09-30T01:00:00.000Z"), hist("customs_hold", "2026-10-01T01:00:00.000Z", "Giữ hải quan")];
    const d = okData(body);
    assert.equal(d.latest?.code, "customs_hold");
    assert.equal(d.latest?.known, false);
    assert.deepEqual(d.unknownCodes, ["customs_hold"]);
    assert.equal(kienStepIndex("customs_hold"), -1);
    assert.equal(runStatusForKien("customs_hold"), null);
  });
  it("de-duplicates repeated (status, time) rows and drops rows without a time", () => {
    const body = full();
    body.histories = [hist("waiting", "2026-09-30T01:00:00.000Z"), hist("waiting", "2026-09-30T01:00:00.000Z"), hist("shipping", ""), { orderPackId: 1, statusCode: "shipping", datetime: "not a date", status: { code: "shipping", label: "x" } }];
    const d = okData(body);
    assert.deepEqual(d.events.map((e) => e.code), ["waiting"]);
  });
  it("stores times as UTC ISO whatever the input offset", () => {
    const body = full();
    body.histories = [hist("waiting", "2026-09-30T08:34:48+07:00")];
    assert.equal(okData(body).events[0].at, "2026-09-30T01:34:48.000Z");
  });
  it("two KEA codes sharing one PU pickup stay two separate parcels keyed by their own code", () => {
    const a = okData(full("KEA260930002", "PU26093001"), "KEA260930002");
    const b = okData({ ...full("KEA260930003", "PU26093001"), histories: [hist("waiting", "2026-09-30T01:00:00.000Z")] }, "KEA260930003");
    assert.equal(a.providerTrackingCode, b.providerTrackingCode);
    assert.notEqual(a.code, b.code);
    assert.equal(a.latest?.code, "delivered");
    assert.equal(b.latest?.code, "waiting");
  });
  it("refuses a reply whose code is not the one asked for, or garbage", () => {
    const r = parseKienResponse(full("KEA260930003"), "KEA260930002");
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.kind, "mismatch");
    assert.equal(parseKienResponse("nope", "KEA260930002").ok, false);
    assert.equal(parseKienResponse(full(), "PU26093001").ok, false);
  });
});

const mockFetcher = (steps: Array<{ status: number; body?: unknown; headers?: Record<string, string>; throwError?: Error; hang?: boolean }>, calls: string[] = []): KienFetcher => {
  let i = 0;
  return async (url, init) => {
    calls.push(url);
    const s = steps[Math.min(i++, steps.length - 1)];
    if (s.throwError) throw s.throwError;
    if (s.hang) {
      await new Promise<void>((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    }
    return { status: s.status, headers: { get: (k: string) => s.headers?.[k.toLowerCase()] ?? null }, json: async () => s.body };
  };
};
const noSleep = async () => {};

describe("fetchKienTracking", () => {
  it("calls only the fixed host with the normalised code and parses the body", async () => {
    const calls: string[] = [];
    const r = await fetchKienTracking(" kea260930002", { fetcher: mockFetcher([{ status: 200, body: full() }], calls), sleep: noSleep });
    assert.ok(r.ok);
    assert.deepEqual(calls, ["https://api.kienexpress.jp/orders/search?code=KEA260930002"]);
    assert.equal(r.data.latest?.code, "delivered");
  });
  it("rejects an invalid code without calling the network", async () => {
    const calls: string[] = [];
    const r = await fetchKienTracking("PU26093001", { fetcher: mockFetcher([{ status: 200, body: full() }], calls) });
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.kind, "invalid");
    assert.equal(calls.length, 0);
  });
  it("404 = unknown code, no retry", async () => {
    const calls: string[] = [];
    const r = await fetchKienTracking("KEA000000000", { fetcher: mockFetcher([{ status: 404 }], calls), sleep: noSleep });
    assert.equal(!r.ok && r.kind, "not_found");
    assert.equal(calls.length, 1);
  });
  it("retries 5xx / 429 honouring Retry-After, then succeeds", async () => {
    const waits: number[] = [];
    const calls: string[] = [];
    const r = await fetchKienTracking("KEA260930002", {
      fetcher: mockFetcher([{ status: 503 }, { status: 429, headers: { "retry-after": "2" } }, { status: 200, body: full() }], calls),
      sleep: async (ms) => {
        waits.push(ms);
      },
      retries: 2,
    });
    assert.ok(r.ok);
    assert.equal(calls.length, 3);
    assert.deepEqual(waits, [1000, 2000]);
  });
  it("gives up after the retries with the last HTTP error", async () => {
    const r = await fetchKienTracking("KEA260930002", { fetcher: mockFetcher([{ status: 500 }]), sleep: noSleep, retries: 1 });
    assert.equal(!r.ok && r.kind, "http");
    assert.equal(!r.ok && r.status, 500);
  });
  it("times out a hanging request", async () => {
    const r = await fetchKienTracking("KEA260930002", { fetcher: mockFetcher([{ status: 200, hang: true }]), sleep: noSleep, retries: 0, timeoutMs: 20 });
    assert.equal(!r.ok && r.kind, "timeout");
  });
  it("reports a network error instead of throwing", async () => {
    const r = await fetchKienTracking("KEA260930002", { fetcher: mockFetcher([{ throwError: new Error("ECONNRESET"), status: 0 }]), sleep: noSleep, retries: 0 });
    assert.equal(!r.ok && r.kind, "network");
  });
  it("a mismatching reply is refused even with HTTP 200", async () => {
    const r = await fetchKienTracking("KEA260930002", { fetcher: mockFetcher([{ status: 200, body: full("KEA260930003") }]), sleep: noSleep });
    assert.equal(!r.ok && r.kind, "mismatch");
  });
});

describe("stale guard", () => {
  it("a late reply for a code the run no longer carries is ignored", () => {
    assert.equal(kienResultIsStale("KEA260930002", "KEA260930003"), true);
    assert.equal(kienResultIsStale("KEA260930002", "kea260930002"), false);
    assert.equal(kienResultIsStale("KEA260930002", ""), true);
  });
});

describe("planKienSync (run status rules)", () => {
  const at = (code: string) => {
    const body = full();
    body.histories = body.histories.slice(0, kienStepIndex(code) + 1);
    return okData(body);
  };
  it("moves a handed-over run forward to the state Kiến reports (warehouse_jp → handed, shipping → flying, warehouse_hn → arrived)", () => {
    assert.equal(planKienSync({ status: "packed" }, at("warehouse_jp")).advanceTo, "handed");
    assert.equal(planKienSync({ status: "handed" }, at("shipping")).advanceTo, "flying");
    assert.equal(planKienSync({ status: "handed" }, at("warehouse_hn")).advanceTo, "arrived");
    assert.equal(planKienSync({ status: "flying" }, at("warehouse_hn")).advanceTo, "arrived");
  });
  it("'waiting' changes nothing; same step changes nothing", () => {
    assert.equal(planKienSync({ status: "packed" }, at("waiting")).advanceTo, null);
    assert.equal(planKienSync({ status: "flying" }, at("shipping")).advanceTo, null);
    assert.equal(planKienSync({ status: "flying" }, at("shipping")).behind, false);
  });
  it("never moves a run backwards — Kiến behind the shop is flagged, not applied", () => {
    const p = planKienSync({ status: "arrived" }, at("shipping"));
    assert.equal(p.advanceTo, null);
    assert.equal(p.behind, true);
    assert.equal(p.carrierStatus, "shipping");
  });
  it("'delivered' is display-only: no run completion, no stock movement", () => {
    for (const status of ["handed", "flying", "arrived"] as const) {
      const p = planKienSync({ status }, at("delivered"));
      assert.equal(p.advanceTo, null, `run ${status} must not move`);
      assert.equal(p.delivered, true);
      assert.equal(p.carrierStatus, "delivered");
    }
    // the only thing that moves stock is setShipmentStatus(); delivered never asks for it
    assert.equal(runStatusForKien("delivered"), "done");
    assert.equal(planKienSync({ status: "arrived" }, at("delivered")).advanceTo, null);
  });
  it("a finished run is left alone and an unknown latest state only records itself", () => {
    assert.equal(planKienSync({ status: "done" }, at("warehouse_hn")).advanceTo, null);
    const body = full();
    body.histories = [hist("shipping", "2026-10-01T01:00:00.000Z"), hist("customs_hold", "2026-10-02T01:00:00.000Z", "Giữ hải quan")];
    const p = planKienSync({ status: "handed" }, okData(body));
    assert.equal(p.advanceTo, null);
    assert.equal(p.carrierStatus, "customs_hold");
    assert.equal(p.carrierLabel, "Giữ hải quan");
    assert.deepEqual(p.unknownCodes, ["customs_hold"]);
  });
  it("an empty history records nothing and moves nothing", () => {
    const p = planKienSync({ status: "handed" }, okData({ ...full(), histories: [] }));
    assert.equal(p.carrierStatus, "");
    assert.equal(p.advanceTo, null);
  });
});
