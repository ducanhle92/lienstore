/** Purchase receipts: code, bill parsing, product matching — pure unit tests:  npm run test:receipts */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchBillItem, parseBillText, receiptCode } from "../../src/lib/receipts";

describe("receiptCode", () => {
  it("PM-YYMMDD-NN", () => {
    assert.equal(receiptCode("2026-09-17", 1), "PM-260917-01");
    assert.equal(receiptCode("2026-09-17", 12), "PM-260917-12");
  });
});

describe("parseBillText", () => {
  it("reads an Amazon.co.jp order mail: order number, date, titles, quantities, ASIN, price", () => {
    const mail = `ご注文の確認
注文番号: 249-1234567-8901234
注文日: 2026/09/15
ロート製薬 メンソレータム アクネス ニキビ治療薬 14g
https://www.amazon.co.jp/dp/B004312MSK
数量: 2  ¥1,320
DHC ビタミンC 60日分
数量: 1  ¥583
小計: ¥3,223
合計: ¥3,223`;
    const b = parseBillText(mail);
    assert.equal(b.orderRef, "249-1234567-8901234");
    assert.equal(b.boughtAt, "2026-09-15");
    assert.equal(b.items.length, 2);
    assert.equal(b.items[0].name, "ロート製薬 メンソレータム アクネス ニキビ治療薬 14g");
    assert.equal(b.items[0].qty, 2);
    assert.equal(b.items[0].asin, "B004312MSK");
    assert.equal(b.items[0].unitJpy, 660);
    assert.equal(b.items[1].qty, 1);
    assert.equal(b.items[1].unitJpy, 583);
  });
  it("reads a hand-typed list", () => {
    const b = parseBillText("Mua 17/09/2026 tại Don Quijote\n3 x Sữa rửa mặt Hatomugi 800ml 690円\nDHC Vitamin C 60 ngày x2 ¥1,166");
    assert.equal(b.boughtAt, "2026-09-17");
    assert.deepEqual(b.items.map((i) => [i.name, i.qty, i.unitJpy]), [
      ["Sữa rửa mặt Hatomugi 800ml", 3, 230],
      ["DHC Vitamin C 60 ngày", 2, 583],
    ]);
  });
  it("ignores totals and empty text", () => {
    assert.deepEqual(parseBillText("合計 ¥3,000\n送料 x1").items, []);
  });
});

describe("matchBillItem", () => {
  const cands = [
    { id: 193, name: "BB Chocola Trị Mụn 170 Viên", nameJa: "エーザイ チョコラBBピュア 170錠", urls: ["https://www.amazon.co.jp/dp/B004312MSK"] },
    { id: 1274, name: "Vitamin C DHC 60 Ngày", nameJa: "DHC ビタミンC 60日分", urls: [] },
    { id: 2083, name: "Sữa tắm Hatomugi chiết xuất hạt ý dĩ 800ml", nameJa: "", urls: [] },
  ];
  it("ASIN wins", () => {
    assert.deepEqual(matchBillItem({ name: "whatever", qty: 1, unitJpy: null, asin: "B004312MSK" }, cands), { id: 193, score: 1 });
  });
  it("Japanese title matches nameJa; Vietnamese words match the name; nothing matches noise", () => {
    assert.equal(matchBillItem({ name: "DHC ビタミンC 60日分", qty: 1, unitJpy: null, asin: null }, cands)?.id, 1274);
    assert.equal(matchBillItem({ name: "Sữa tắm Hatomugi 800ml", qty: 1, unitJpy: null, asin: null }, cands)?.id, 2083);
    assert.equal(matchBillItem({ name: "Ổ cắm điện Panasonic", qty: 1, unitJpy: null, asin: null }, cands), null);
  });
});
