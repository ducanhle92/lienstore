/** Warehouses, per-source surcharge, plain-text descriptions, stock advice, customer-facing tags — pure unit tests:  npm run test:warehouses */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cheapestQuote, costPriceFromJpy } from "../../src/lib/cost-sources";
import { htmlToPlain, isSimpleHtml, plainToHtml } from "../../src/lib/plain-html";
import { suggestStandardStock } from "../../src/lib/stock-advice";
import { parseStocktakeCsv } from "../../src/lib/stocktake-csv";
import { displayTags } from "../../src/lib/tags";
import { describeByWarehouse, parseWarehouse, transitWhereOf } from "../../src/lib/warehouses";

describe("warehouses", () => {
  it("recognises keys, labels and short forms", () => {
    assert.equal(parseWarehouse("jp"), "jp");
    assert.equal(parseWarehouse("Kho Nhật"), "jp");
    assert.equal(parseWarehouse("Kho ĐVVC"), "carrier");
    assert.equal(parseWarehouse("Kho Việt Nam"), "vn");
    assert.equal(parseWarehouse("VN"), "vn");
    assert.equal(parseWarehouse("xyz"), null);
  });
  it("places bought goods on the route by purchase status", () => {
    assert.equal(transitWhereOf("bought"), "jp");
    assert.equal(transitWhereOf("to_carrier_jp"), "jp");
    assert.equal(transitWhereOf("shipped_jp_vn"), "transit");
    assert.equal(transitWhereOf("at_carrier_vn"), "carrier");
    assert.equal(transitWhereOf("to_shop"), "carrier");
    assert.equal(transitWhereOf("at_shop"), null);
    assert.equal(transitWhereOf("not_bought"), null);
  });
  it("describes stock by warehouse, biggest first", () => {
    assert.equal(describeByWarehouse({ jp: 2, carrier: 0, vn: 5 }), "Kho Việt Nam 5 · Kho Nhật 2");
  });
  it("stocktake CSV carries the warehouse of a per-warehouse sheet", () => {
    const csv = '"ID","Kho kiểm kê","Kiểm đếm thực tế"\n"1","Kho Nhật","4"\n"2","","7"\n"3","Kho lạ","1"';
    const r = parseStocktakeCsv(csv);
    assert.deepEqual(r.rows, [
      { id: 1, count: 4, warehouse: "jp" },
      { id: 2, count: 7, warehouse: null },
    ]);
    assert.match(r.errors[0], /kho "Kho lạ"/);
  });
});

describe("purchase-source surcharge", () => {
  const fees = { iherb: 300 };
  it("is part of the landed cost", () => {
    assert.equal(costPriceFromJpy(1000, "iherb", 170, fees), (1000 + 300) * 170);
    assert.equal(costPriceFromJpy(1000, "amazon", 170, fees), 170000);
  });
  it("decides the cheapest source on landed ¥, not the sticker price", () => {
    const rows = [
      { source: "iherb", priceJpy: 900, url: "" },
      { source: "amazon", priceJpy: 1000, url: "" },
    ];
    assert.equal(cheapestQuote(rows, "amazon")?.source, "iherb");
    assert.equal(cheapestQuote(rows, "amazon", fees)?.source, "amazon");
  });
});

describe("plain text ⇄ simple HTML", () => {
  it("round-trips paragraphs and line breaks", () => {
    const html = plainToHtml("Đoạn một\ndòng hai\n\nĐoạn hai");
    assert.equal(html, "<p>Đoạn một<br>dòng hai</p><p>Đoạn hai</p>");
    assert.equal(htmlToPlain(html), "Đoạn một\ndòng hai\n\nĐoạn hai");
  });
  it("leaves richer HTML alone in both directions", () => {
    const rich = '<p>Xem <a href="/x">đây</a></p>';
    assert.equal(isSimpleHtml(rich), false);
    assert.equal(htmlToPlain(rich), rich);
    assert.equal(plainToHtml(rich), rich);
  });
  it("escapes text typed with angle brackets", () => {
    assert.equal(plainToHtml("a < b & c"), "<p>a &lt; b &amp; c</p>");
    assert.equal(plainToHtml(""), "");
  });
});

describe("stock advice (Hàng order → Lưu kho)", () => {
  const m = (units: number[]) => units.map((u, i) => ({ month: `2026-0${i + 1}`, units: u }));
  it("suggests ~1.5 months of cover when the product sells steadily", () => {
    const a = suggestStandardStock(m([4, 6, 5, 3, 6, 6]));
    assert.equal(a.avgPerMonth, 5);
    assert.equal(a.suggested, 8);
  });
  it("keeps buying to order for slow or one-off sellers", () => {
    assert.equal(suggestStandardStock(m([0, 0, 1, 0, 0, 1])).suggested, 0);
    assert.equal(suggestStandardStock(m([0, 0, 0, 0, 0, 30])).suggested, 0); // one spike is not a trend
    assert.equal(suggestStandardStock([]).suggested, 0);
  });
});

describe("customer-facing tags", () => {
  it("keeps Vietnamese keywords only", () => {
    const tags = ["reihaku", "hatomugi", "麗白", "ハトムギ", "sua tam", "sữa tắm", "duong am", "dưỡng ẩm", "600ml"];
    assert.deepEqual(displayTags(tags, "Sữa tắm Reihaku Hatomugi High Moisture 600ml"), ["sữa tắm", "dưỡng ẩm"]);
  });
  it("drops one-word fragments of the name but keeps real phrases", () => {
    const tags = ["sữa", "rửa", "mặt", "hạt ý dĩ", "kem chong nang", "chống nắng", "SPF50", "PA+++"];
    assert.deepEqual(displayTags(tags, "Sữa rửa mặt Hatomugi"), ["hạt ý dĩ", "kem chong nang", "chống nắng"]);
  });
});
