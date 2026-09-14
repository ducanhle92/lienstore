/** Selling-price formula — pure unit tests:  npm run test:pricing */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PRICING, effectiveMarginPct, quoteImportLegsProRata, suggestPrice } from "../../src/lib/pricing";
import type { ShippingQuoteConfig } from "../../src/lib/shipping";

/**
 * Kiến Express tới nhà lấy hàng (chặng ①): flat pickup fee per lot, not per kg — a QuoteMethod with a zone whose
 * `unit` is empty prices flat regardless of weight; quoteImportLegsProRata shares that flat lot fee per gram of the
 * product, same mechanism as a /kg tariff.
 */
const jpDomesticFlatPickup = { id: 1, name: "Kiến Express tới nhà lấy hàng", carrierName: "Kiến Express", currency: "¥", zones: [{ id: 1, name: "Lấy tại nhà", fee: 2000, unit: "", baseG: null, stepG: null, stepFee: null, freeOver: null, capKg: null }] };
const jpVnPerKg = { id: 2, name: "Kiến Express Nhật → Việt Nam", carrierName: "Kiến Express", currency: "đ", zones: [{ id: 2, name: "Đường bay", fee: 200000, unit: "/kg", baseG: null, stepG: null, stepFee: null, freeOver: null, capKg: null }] };
const vnTransferPerKg = { id: 3, name: "Kho ĐVVC → kho shop", carrierName: null, currency: "đ", zones: [{ id: 3, name: "Chuẩn", fee: 5000, unit: "/kg", baseG: null, stepG: null, stepFee: null, freeOver: null, capKg: null }] };

const quote: ShippingQuoteConfig = { mode: "included", jpyRate: 170, jpDomestic: jpDomesticFlatPickup, jpVn: jpVnPerKg, vnTransfer: vnTransferPerKg };
const pricing = { ...DEFAULT_PRICING, marginPct: 20, roundTo: 1000, lotWeightG: 10000 };

describe("quoteImportLegsProRata — flat lot fee shared per gram", () => {
  it("prices a flat fee (unit \"\") the same way as a /kg tariff: proportional to the product's share of the lot", () => {
    const legs = quoteImportLegsProRata(quote, 2400, 10000); // 2.4 kg of a 10 kg lot → 24% share
    const jpDomesticLeg = legs.find((l) => l.leg === "jp_domestic")!;
    const jpVnLeg = legs.find((l) => l.leg === "jp_vn")!;
    const vnTransferLeg = legs.find((l) => l.leg === "vn_transfer")!;
    // full-lot pickup fee = 2000¥ × 170 = 340,000đ; this product's share = 24% → 81,600đ
    assert.equal(jpDomesticLeg.fee, 81600);
    // full-lot JP→VN = 200,000đ/kg × 10 kg = 2,000,000đ; 24% share = 480,000đ
    assert.equal(jpVnLeg.fee, 480000);
    // full-lot VN transfer = 5,000đ/kg × 10 kg = 50,000đ; 24% share = 12,000đ
    assert.equal(vnTransferLeg.fee, 12000);
  });
  it("a heavier product in the same lot pays a proportionally larger share", () => {
    const legs = quoteImportLegsProRata(quote, 5000, 10000); // 50% of the lot
    assert.equal(legs.find((l) => l.leg === "jp_vn")!.fee, 1000000);
  });
});

describe("suggestPrice — margin marks up only the cost at Japan, shipping is added at cost", () => {
  it("matches the formula: (giá vốn tại Nhật × (1 + lãi%)) + phí ship 3 chặng, rounded up", () => {
    const s = suggestPrice({ costPrice: 100000, weightG: 2000, dimsCm: null, dimsConfidence: "high", marginPct: null, categories: [] }, quote, pricing);
    assert.ok(s);
    // billable weight = 2000 g × 1.2 (safety factor, "high") = 2400 g
    assert.equal(s!.weightG, 2400);
    // shipping = 81,600 + 480,000 + 12,000 = 573,600
    assert.equal(s!.shipping, 573600);
    // giá vốn về tới VN (landed, for reporting — no markup) = 100,000 + 573,600 = 673,600
    assert.equal(s!.landed, 673600);
    // raw = 100,000 × 1.2 + 573,600 = 693,600 → rounded up to the nearest 1,000 = 694,000
    assert.equal(s!.raw, 693600);
    assert.equal(s!.suggested, 694000);
    // lợi nhuận kỳ vọng = giá bán − giá vốn về tới VN = 694,000 − 673,600 = 20,400
    assert.equal(s!.margin, 20400);
  });
  it("is strictly cheaper than the old formula (margin on landed cost) whenever shipping is a real cost", () => {
    const s = suggestPrice({ costPrice: 100000, weightG: 2000, dimsCm: null, dimsConfidence: "high", marginPct: null, categories: [] }, quote, pricing)!;
    const oldFormulaRaw = s.landed * (1 + s.marginPct / 100);
    assert.ok(s.raw < oldFormulaRaw, "margin must no longer be charged on the shipping portion");
  });
  it("returns null without a cost price, and never suggests a price below the landed cost", () => {
    assert.equal(suggestPrice({ costPrice: null, weightG: 2000, dimsCm: null, dimsConfidence: "high" }, quote, pricing), null);
    const zeroMargin = suggestPrice({ costPrice: 100000, weightG: 2000, dimsCm: null, dimsConfidence: "high", marginPct: 0, categories: [] }, quote, pricing)!;
    assert.ok(zeroMargin.suggested >= zeroMargin.landed);
  });
});

describe("effectiveMarginPct — override chain", () => {
  const cfg = { ...DEFAULT_PRICING, marginPct: 25, marginByCategory: { "suc-khoe": 30, "duong-da-mat": 22 }, categoryParent: { "sua-rua-mat": "suc-khoe" } };
  it("product override wins over everything", () => assert.equal(effectiveMarginPct(cfg, 15, ["duong-da-mat"]), 15));
  it("falls back to the product's own category", () => assert.equal(effectiveMarginPct(cfg, null, ["duong-da-mat"]), 22));
  it("falls back to the category's parent when the category itself has no override", () => assert.equal(effectiveMarginPct(cfg, null, ["sua-rua-mat"]), 30));
  it("falls back to the shop default", () => assert.equal(effectiveMarginPct(cfg, null, ["mom-and-baby"]), 25));
});
