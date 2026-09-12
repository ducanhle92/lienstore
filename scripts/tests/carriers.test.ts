/**
 * Carrier adapters — pure unit tests (no network):  npm run test:shipping
 * Sample parcel = Casio LTP-1177A-4A1JH, 1.080.000đ, 46 g, 14,7 × 5,6 × 2,4 cm (spec §11).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clearQuoteCache, quoteAllCarriers, quoteCacheKey } from "../../src/lib/carriers";
import { ghnVolumetricWeightG } from "../../src/lib/carriers/ghn-adapter";
import { quoteSPX, SPX_RATE_CARD, spxBillableWeightG, spxHighValueFee, spxRoutes, spxWeightFee } from "../../src/lib/carriers/spx";
import { formatQuoteFee, sortQuotes, usableForCheckoutTotal, type AddressInput, type CarrierQuoteAdapter, type ShippingQuote, type ShippingQuoteRequest, unavailableQuote } from "../../src/lib/carriers/types";
import { viettelAdapter, viettelRowToQuote } from "../../src/lib/carriers/viettel";
import { goshipCarrierCode, goshipRateToQuote, matchGoshipAddress, matchGoshipCities } from "../../src/lib/carriers/goship-pure";
import { classifyVNPostRoute, quoteVNPost, vnpostBaseFee, vnpostFactor, vnpostZone } from "../../src/lib/carriers/vnpost";
import { findProvince, findProvinceByName, findWardByName, isMergedProvince, legacyCode, legacyProvincesOf, VN_PROVINCES, wardsOf } from "../../src/lib/vn-address";

const P = (name: string) => {
  const p = findProvinceByName(name);
  if (!p) throw new Error(`no province ${name}`);
  return p;
};
const addr = (province: string, ward?: string, legacy?: string): AddressInput => {
  const p = P(province);
  const w = ward ? findWardByName(p.code, ward) : wardsOf(p.code)[0];
  return { provinceCode: p.code, provinceName: p.name, wardCode: w?.code ?? "", wardName: w?.name ?? "", fullAddress: `1 Test, ${w?.name}, ${p.name}`, legacyProvinceCode: legacy ? legacyCode(legacy) : undefined };
};
const THANH_HOA = addr("Thanh Hóa", "Hoằng Hóa", "Thanh Hóa");
const casio = (dest: AddressInput, over: Partial<ShippingQuoteRequest["parcel"]> = {}, pay: "cod" | "bank_transfer" = "bank_transfer"): ShippingQuoteRequest => ({
  originWarehouseId: "thanh-hoa-hoang-hoa",
  origin: THANH_HOA,
  destination: dest,
  parcel: { actualWeightG: 46, lengthCm: 14.7, widthCm: 5.6, heightCm: 2.4, orderValueVnd: 1_080_000, declaredValueVnd: 1_080_000, codAmountVnd: pay === "cod" ? 1_080_000 : 0, quantity: 1, ...over },
  paymentMethod: pay,
});

describe("address catalogue (34 provinces)", () => {
  it("has exactly 34 provinces and no legacy names", () => {
    assert.equal(VN_PROVINCES.length, 34);
    for (const old of ["Nam Định", "Bình Dương", "Long An", "Quảng Bình", "Quảng Nam", "Hà Giang"]) assert.equal(findProvinceByName(old), undefined, old);
  });
  it("finds provinces by prefixed / unaccented names and wards by name", () => {
    assert.equal(P("Tỉnh Thanh Hóa").code, "38");
    assert.equal(findProvinceByName("thanh hoa")?.name, "Thanh Hóa");
    assert.equal(findProvinceByName("TP Hồ Chí Minh")?.name, "Hồ Chí Minh");
    assert.ok(findWardByName("38", "Hoằng Hóa"), "Hoằng Hóa ward exists in Thanh Hóa");
    assert.ok(wardsOf("38").length > 100);
  });
  it("knows which provinces were merged and their legacy provinces", () => {
    assert.equal(isMergedProvince(P("Thanh Hóa").code), false);
    assert.equal(isMergedProvince(P("Ninh Bình").code), true);
    assert.deepEqual(legacyProvincesOf(P("Ninh Bình").code), ["Ninh Bình", "Hà Nam", "Nam Định"]);
    assert.deepEqual(legacyProvincesOf(P("Hà Nội").code), ["Hà Nội"]);
    // every current province is either unmerged or listed with ≥2 legacy provinces; 63 legacy provinces in total
    const legacy = new Set(VN_PROVINCES.flatMap((p) => legacyProvincesOf(p.code)));
    assert.equal(legacy.size, 63);
  });
});

describe("VNPost — zones and routes", () => {
  it("maps every current province to exactly one zone", () => {
    const counts = { 1: 0, 2: 0, 3: 0 };
    for (const p of VN_PROVINCES) {
      const z = vnpostZone(p.code);
      assert.ok(z, `${p.name} has a zone`);
      counts[z!]++;
    }
    assert.deepEqual(counts, { 1: 18, 2: 10, 3: 6 });
  });
  it("classifies Thanh Hóa → Thanh Hóa as Nội tỉnh 1 (unmerged province)", () => assert.equal(classifyVNPostRoute(THANH_HOA, addr("Thanh Hóa", "Hạc Thành")), "NOI_TINH_1"));
  it("same new province, different legacy province → Nội tỉnh 2; same legacy → Nội tỉnh 1", () => {
    const from = addr("Ninh Bình", undefined, "Nam Định");
    assert.equal(classifyVNPostRoute(from, addr("Ninh Bình", undefined, "Hà Nam")), "NOI_TINH_2");
    assert.equal(classifyVNPostRoute(from, addr("Ninh Bình", undefined, "Nam Định")), "NOI_TINH_1");
    assert.equal(classifyVNPostRoute(from, addr("Ninh Bình")), "NOI_TINH_2", "unknown legacy inside a merged province is not assumed to be the same");
  });
  it("Thanh Hóa → Hà Nội = Nội vùng, → Đà Nẵng = Cận vùng, → Hồ Chí Minh = Cách vùng", () => {
    assert.equal(classifyVNPostRoute(THANH_HOA, addr("Hà Nội")), "NOI_VUNG");
    assert.equal(classifyVNPostRoute(THANH_HOA, addr("Đà Nẵng")), "CAN_VUNG");
    assert.equal(classifyVNPostRoute(THANH_HOA, addr("Hồ Chí Minh")), "CACH_VUNG");
    assert.equal(classifyVNPostRoute(addr("Hồ Chí Minh"), addr("Huế")), "CAN_VUNG");
  });
});

describe("VNPost — tiers", () => {
  it("46 g sample: 6.500 / 6.500 / 7.500 / 8.000 by route", () => {
    assert.equal(vnpostBaseFee(46, "NOI_TINH_1"), 6500);
    assert.equal(vnpostBaseFee(46, "NOI_VUNG"), 6500);
    assert.equal(vnpostBaseFee(46, "CAN_VUNG"), 7500);
    assert.equal(vnpostBaseFee(46, "CACH_VUNG"), 8000);
  });
  it("boundaries 50/100/250/500/1000/1500/2000 g are inclusive, +1 g moves up a tier", () => {
    const nt1 = [
      [50, 6500, 7000],
      [100, 7000, 9000],
      [250, 9000, 11000],
      [500, 11000, 14800],
      [1000, 14800, 20200],
      [1500, 20200, 21400],
    ] as const;
    for (const [g, at, above] of nt1) {
      assert.equal(vnpostBaseFee(g, "NOI_TINH_1"), at, `${g} g`);
      assert.equal(vnpostBaseFee(g + 1, "NOI_TINH_1"), above, `${g + 1} g`);
    }
    assert.equal(vnpostBaseFee(2000, "NOI_TINH_1"), 21400);
    assert.equal(vnpostBaseFee(2000, "CACH_VUNG"), 33500);
  });
  it("above 2 kg every started kg is added (no 500 g steps)", () => {
    assert.equal(vnpostBaseFee(2001, "NOI_TINH_1"), 21400 + 2900);
    assert.equal(vnpostBaseFee(2500, "NOI_TINH_1"), 21400 + 2900);
    assert.equal(vnpostBaseFee(3000, "NOI_TINH_1"), 21400 + 2900);
    assert.equal(vnpostBaseFee(3001, "CACH_VUNG"), 33500 + 2 * 6000);
    assert.equal(vnpostBaseFee(17_000, "NOI_VUNG"), 31800 + 15 * 3600);
    // 31 kg: 28 kg at the 2–30 bracket + 1 kg at the 30–100 bracket
    assert.equal(vnpostBaseFee(31_000, "NOI_TINH_1"), 21400 + 28 * 2900 + 2600);
  });
  it("applies only the highest factor", () => {
    assert.deepEqual(vnpostFactor({ fragile: true, bulky: true, heavy: true }), { factor: 1.5, label: "hàng nặng" });
    assert.deepEqual(vnpostFactor({ islandRoute: true, heavy: true }), { factor: 2, label: "hải đảo" });
    assert.equal(vnpostFactor(undefined).factor, 1);
    const q = quoteVNPost(casio(addr("Hà Nội"), { flags: { fragile: true, bulky: true } }));
    assert.equal(q.baseFeeVnd, 6500);
    assert.equal(q.totalFeeVnd, Math.round(6500 * 1.3));
  });
  it("quotes are 'Từ …' while VAT / fuel are unknown and never usable as the checkout total", () => {
    const q = quoteVNPost(casio(addr("Hồ Chí Minh")));
    assert.equal(q.accuracy, "from_price");
    assert.equal(q.totalFeeVnd, 8000);
    assert.equal(formatQuoteFee(q), "Từ 8.000đ");
    assert.equal(usableForCheckoutTotal(q), false);
    assert.ok(q.warnings.some((w) => /VAT/.test(w)));
    assert.ok(q.feeParts.some((p) => p.code === "vat" && p.amountVnd === null));
    assert.equal(q.rateCardVersion, "2026-09-12");
  });
});

describe("SPX — weight, limits, tiers", () => {
  it("volumetric /6000 and billable = max(actual, volumetric): sample uses 46 g", () => {
    const { billableWeightG, volumetricWeightG } = spxBillableWeightG({ actualWeightG: 46, lengthCm: 14.7, widthCm: 5.6, heightCm: 2.4 });
    assert.equal(volumetricWeightG, 33);
    assert.equal(billableWeightG, 46);
    assert.equal(spxBillableWeightG({ actualWeightG: 500, lengthCm: 30, widthCm: 30, heightCm: 30 }).billableWeightG, 4500);
  });
  it("first kg flat, then every started 0,5 kg", () => {
    const t = SPX_RATE_CARD.tiers.LIEN_MIEN;
    assert.equal(spxWeightFee(t, 46), 22000);
    assert.equal(spxWeightFee(t, 1000), 22000);
    assert.equal(spxWeightFee(t, 1001), 27000);
    assert.equal(spxWeightFee(t, 1500), 27000);
    assert.equal(spxWeightFee(t, 1501), 32000);
    assert.equal(spxWeightFee(t, 2000), 32000);
    assert.equal(spxWeightFee(SPX_RATE_CARD.tiers.NOI_TINH, 2000), 18000 + 2 * 2500);
    assert.equal(spxWeightFee(t, 17_000), 22000 + 32 * 5000);
  });
  it("rejects parcels over 17 kg or with a side over 60 cm", () => {
    assert.equal(quoteSPX(casio(addr("Hà Nội"), { actualWeightG: 17_000 })).available, true);
    assert.equal(quoteSPX(casio(addr("Hà Nội"), { actualWeightG: 17_001 })).available, false);
    assert.equal(quoteSPX(casio(addr("Hà Nội"), { lengthCm: 61 })).status, "unsupported");
  });
  it("sample: 18.000 in-province, 22.000 elsewhere, no high-value fee under 3.000.000", () => {
    assert.equal(quoteSPX(casio(addr("Thanh Hóa", "Hạc Thành"))).totalFeeVnd, 18000);
    for (const dest of ["Hà Nội", "Đà Nẵng", "Hồ Chí Minh"]) {
      const q = quoteSPX(casio(addr(dest)));
      assert.equal(q.totalFeeVnd, 22000, dest);
      assert.equal(q.feeParts.find((p) => p.code === "high_value")?.amountVnd, 0);
      assert.deepEqual(q.includes, ["VAT", "COD"]);
    }
  });
  it("adds 25.000 only when max(COD, declared) ≥ 3.000.000", () => {
    assert.equal(spxHighValueFee(0, 2_999_999), 0);
    assert.equal(spxHighValueFee(0, 3_000_000), 25000);
    assert.equal(spxHighValueFee(3_000_000, 0), 25000);
    assert.equal(quoteSPX(casio(addr("Hà Nội"), { declaredValueVnd: 3_500_000 })).totalFeeVnd, 47000);
  });
  it("does not guess the Thanh Hóa zone: >1 kg to the north/centre is 'Từ …', to the south is estimated, ≤1 kg is estimated", () => {
    assert.deepEqual(spxRoutes(THANH_HOA.provinceCode, addr("Hồ Chí Minh").provinceCode), ["LIEN_MIEN"]);
    assert.ok(spxRoutes(THANH_HOA.provinceCode, addr("Hà Nội").provinceCode).length === 2);
    const light = quoteSPX(casio(addr("Hà Nội")));
    assert.equal(light.accuracy, "estimated");
    const heavyNorth = quoteSPX(casio(addr("Hà Nội"), { actualWeightG: 2000 }));
    assert.equal(heavyNorth.accuracy, "from_price");
    assert.equal(heavyNorth.totalFeeVnd, 22000 + 2 * 2500);
    assert.ok(!heavyNorth.warnings.join(" ").includes("miền Trung"), "no claim about which region SPX puts Thanh Hóa in");
    const heavySouth = quoteSPX(casio(addr("Cần Thơ"), { actualWeightG: 2000 }));
    assert.equal(heavySouth.accuracy, "estimated");
    assert.equal(heavySouth.totalFeeVnd, 22000 + 2 * 5000);
  });
});

describe("GHN explanation weight", () => {
  it("rounds each side up before /5000: sample → 54 g", () => assert.equal(ghnVolumetricWeightG(14.7, 5.6, 2.4), 54));
});

describe("Viettel Post", () => {
  it("is not selectable without a token and never falls back to a static table", async () => {
    delete process.env.VTP_TOKEN;
    const [q] = await viettelAdapter.quote(casio(addr("Hà Nội")));
    assert.equal(q.available, false);
    assert.equal(q.status, "not_configured");
    assert.equal(q.totalFeeVnd, null);
  });
  it("maps a live row to an exact quote", () => {
    const q = viettelRowToQuote({ MA_DV_CHINH: "VCN", TEN_DICHVU: "Chuyển phát nhanh", GIA_CUOC: 31000, THOI_GIAN: "2 ngày", EXCHANGE_WEIGHT: 500 }, casio(addr("Hà Nội")));
    assert.ok(q);
    assert.equal(q!.accuracy, "exact_now");
    assert.equal(q!.totalFeeVnd, 31000);
    assert.equal(q!.billableWeightG, 500);
    assert.equal(q!.etaText, "2 ngày");
  });
});

describe("Goship (aggregator)", () => {
  const cities = [
    { id: "100000", name: "Hà Nội" },
    { id: "380000", name: "Thanh Hóa" },
    { id: "420000", name: "Nam Định" },
    { id: "430000", name: "Ninh Bình" },
    { id: "740000", name: "Bà Rịa - Vũng Tàu" },
  ];
  const districts: Record<string, Array<{ id: string; name: string; city_id: string }>> = {
    "380000": [
      { id: "380100", name: "Thành phố Thanh Hóa", city_id: "380000" },
      { id: "381200", name: "Huyện Hoằng Hóa", city_id: "380000" },
    ],
    "100000": [{ id: "100300", name: "Quận Hai Bà Trưng", city_id: "100000" }, { id: "100100", name: "Quận Ba Đình", city_id: "100000" }],
    "420000": [{ id: "420100", name: "Thành phố Nam Định", city_id: "420000" }],
    "430000": [{ id: "430100", name: "Thành phố Ninh Bình", city_id: "430000" }],
  };
  const wards: Record<string, Array<{ id: number; name: string; district_id: string }>> = {
    "381200": [{ id: 1, name: "Thị trấn Bút Sơn", district_id: "381200" }],
    "380100": [{ id: 2, name: "Phường Hạc Thành", district_id: "380100" }],
    "100300": [{ id: 3, name: "Phường Quỳnh Lôi", district_id: "100300" }],
    "100100": [{ id: 4, name: "Phường Ba Đình", district_id: "100100" }],
    "420100": [{ id: 5, name: "Phường Vị Xuyên", district_id: "420100" }],
    "430100": [{ id: 6, name: "Phường Tân Thành", district_id: "430100" }],
  };
  const dOf = async (c: string) => districts[c] ?? [];
  const wOf = async (d: string) => wards[d] ?? [];
  it("maps carrier short names", () => {
    assert.equal(goshipCarrierCode("vnp"), "VNPOST");
    assert.equal(goshipCarrierCode("ems"), "EMS");
    assert.equal(goshipCarrierCode("ghnv3"), "GHN");
    assert.equal(goshipCarrierCode("shopee"), "SPX");
    assert.equal(goshipCarrierCode("vtp"), "VIETTEL_POST");
    assert.equal(goshipCarrierCode("weird"), "OTHER");
  });
  it("matches legacy provinces to Goship cities (merged provinces → several cities)", () => {
    assert.deepEqual(matchGoshipCities(cities, ["Ninh Bình", "Hà Nam", "Nam Định"]).map((c) => c.id), ["420000", "430000"]);
    assert.deepEqual(matchGoshipCities(cities, ["Bà Rịa - Vũng Tàu"]).map((c) => c.id), ["740000"]);
  });
  it("resolves a new ward by name, by old-district name, or the province's first district", async () => {
    const byWard = await matchGoshipAddress(cities, dOf, wOf, ["Hà Nội"], "Phường Ba Đình");
    assert.equal(byWard?.district.id, "100100"); assert.equal(byWard?.how, "ward");
    const byDistrict = await matchGoshipAddress(cities, dOf, wOf, ["Thanh Hóa"], "Xã Hoằng Hóa");
    assert.equal(byDistrict?.district.id, "381200"); assert.equal(byDistrict?.how, "district");
    const merged = await matchGoshipAddress(cities, dOf, wOf, ["Ninh Bình", "Hà Nam", "Nam Định"], "Phường Vị Xuyên");
    assert.equal(merged?.city.id, "420000");
    const first = await matchGoshipAddress(cities, dOf, wOf, ["Thanh Hóa"], "Xã Mới Lạ");
    assert.equal(first?.how, "first_district");
    assert.equal((await matchGoshipAddress(cities, dOf, wOf, ["Hà Nội"], "Xã Không Có"))?.how, "first_district", "single-city province with an unknown ward → its first district");
    assert.equal(await matchGoshipAddress(cities, dOf, wOf, ["Ninh Bình", "Hà Nam", "Nam Định"], "Xã Không Có"), null, "merged province: several candidate cities and no name match → no guess");
    assert.equal(await matchGoshipAddress(cities, dOf, wOf, ["Tỉnh Không Tồn Tại"], "Xã X"), null);
  });
  it("turns a rate row into an exact live quote with fee parts and ETA", () => {
    const q = goshipRateToQuote(
      { id: "MTFf", rate: "MTFf", carrier_name: "Viettel Post", carrier_short_name: "vtp", service: "Nhanh", expected: "Dự kiến giao 2 ngày", service_fee: 0, cod_fee: 0, insurance_fee: 5000, location_fee: 25000, oil_fee: 2500, total_fee: 32500, return_fee: 9000, report: { success_percent: 97.1, avg_time_delivery_format: "40H" } },
      casio(addr("Hà Nội")),
    );
    assert.equal(q.carrier, "VIETTEL_POST"); assert.equal(q.accuracy, "exact_now"); assert.equal(q.source, "live_api");
    assert.equal(q.totalFeeVnd, 32500); assert.equal(q.serviceCode, "MTFf"); assert.equal(q.providerReference, "MTFf");
    assert.ok(q.etaText?.includes("2 ngày") && q.etaText.includes("40H"));
    assert.equal(q.feeParts.find((p) => p.code === "insurance_fee")?.amountVnd, 5000);
    assert.equal(usableForCheckoutTotal(q), true);
  });
});

describe("orchestrator", () => {
  const fake = (carrier: ShippingQuote["carrier"], fee: number | null, extra: Partial<ShippingQuote> = {}): CarrierQuoteAdapter => ({
    carrier,
    configured: () => true,
    async quote() {
      if (fee === null) throw new Error("boom");
      return [{ ...unavailableQuote(carrier, "available", "ok"), available: true, totalFeeVnd: fee, serviceCode: "S", accuracy: "estimated", ...extra }];
    },
  });
  it("runs adapters in parallel, keeps failing carriers as their own card and sorts by fee", async () => {
    clearQuoteCache();
    const req = casio(addr("Hà Nội"));
    const r = await quoteAllCarriers(req, { adapters: [fake("SPX", 22000), fake("VNPOST", 8000), fake("GHN", null)], fresh: true });
    assert.deepEqual(r.quotes.map((q) => q.carrier), ["VNPOST", "SPX", "GHN"]);
    assert.equal(r.quotes[2].status, "error");
    assert.equal(r.quotes[2].available, false);
  });
  it("cache key changes with address, weight, size, value and COD; identical input is served from cache ≤10 min", async () => {
    clearQuoteCache();
    const base = casio(addr("Hà Nội"));
    const k = quoteCacheKey(base, ["SPX"]);
    assert.notEqual(quoteCacheKey(casio(addr("Hồ Chí Minh")), ["SPX"]), k);
    assert.notEqual(quoteCacheKey(casio(addr("Hà Nội"), { actualWeightG: 47 }), ["SPX"]), k);
    assert.notEqual(quoteCacheKey(casio(addr("Hà Nội"), { heightCm: 3 }), ["SPX"]), k);
    assert.notEqual(quoteCacheKey(casio(addr("Hà Nội"), { declaredValueVnd: 3_000_000 }), ["SPX"]), k);
    assert.notEqual(quoteCacheKey(casio(addr("Hà Nội"), {}, "cod"), ["SPX"]), k);
    assert.equal(quoteCacheKey(casio(addr("Hà Nội")), ["SPX"]), k);
    const a = await quoteAllCarriers(base, { adapters: [fake("SPX", 22000)] });
    const b = await quoteAllCarriers(base, { adapters: [fake("SPX", 99999)] });
    assert.equal(a.fromCache, false);
    assert.equal(b.fromCache, true);
    assert.equal(b.quotes[0].totalFeeVnd, 22000);
    assert.ok(new Date(a.expiresAt).getTime() - new Date(a.quotedAt).getTime() <= 10 * 60 * 1000);
    const c = await quoteAllCarriers(base, { adapters: [fake("SPX", 99999)], fresh: true });
    assert.equal(c.quotes[0].totalFeeVnd, 99999);
  });
  it("exact quotes rank before estimates of the same service; unavailable last", () => {
    const est = { ...unavailableQuote("GHN", "available", ""), available: true, totalFeeVnd: 30000, serviceCode: "2", accuracy: "estimated" as const };
    const exact = { ...est, totalFeeVnd: 31000, accuracy: "exact_now" as const };
    const off = unavailableQuote("VIETTEL_POST", "not_configured", "");
    assert.deepEqual(sortQuotes([off, est, exact]).map((q) => q.accuracy), ["exact_now", "estimated", "estimated"]);
    assert.equal(sortQuotes([off, est, exact])[2].carrier, "VIETTEL_POST");
  });
});
