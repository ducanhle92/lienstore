/** Fanpage caption generator + auto-post slots — pure unit tests:  npm run test:fanpage */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { graphUrl } from "../../src/lib/fanpage";
import { composeFanpagePost, dueSlots, parseTimes, toHashtag } from "../../src/lib/fanpage-compose";

const product = {
  name: "Sữa rửa mặt trà xanh Rohto",
  shortDescription: "<p>Sữa rửa mặt tạo bọt chiết xuất trà xanh, làm sạch sâu mà không khô da.</p>",
  description: "<p><strong>Công dụng</strong></p><ul><li>Lấy sạch bụi bẩn, bã nhờn, dầu thừa</li><li>Cân bằng độ pH, chống lão hoá</li><li>Siêu lành tính, da nhạy cảm dùng được</li></ul><p><strong>Hướng dẫn sử dụng</strong></p><p>Lấy một lượng bằng hạt đậu, tạo bọt rồi massage nhẹ và rửa sạch.</p>",
  price: 175000,
  regularPrice: 210000,
  tags: ["srm", "sữa rửa mặt trà xanh", "sua rua mat", "洗顔", "sữa rửa mặt"],
  categories: ["sua-rua-mat"],
};

describe("composeFanpagePost", () => {
  const msg = composeFanpagePost(product, { link: "https://linconnn.io.vn/product/srm-tra-xanh/", shopName: "Store Lienanh", hotline: "0964 839 769", hashtags: ["#taphoalienanh"], variant: 0 });
  it("has the hook, benefits, usage, price with discount, link, hotline and hashtags", () => {
    assert.match(msg, /SỮA RỬA MẶT TRÀ XANH ROHTO/);
    assert.match(msg, /👉 Lấy sạch bụi bẩn/);
    assert.match(msg, /🧴 Cách dùng: Lấy một lượng/);
    assert.match(msg, /💰 Giá: 175\.000đ \(giá gốc 210\.000đ — giảm 17%\)/);
    assert.match(msg, /🛒 Đặt hàng: https:\/\/linconnn\.io\.vn\/product\/srm-tra-xanh\//);
    assert.match(msg, /📞 Zalo\/Hotline: 0964 839 769/);
    assert.match(msg, /#storelienanh/);
    assert.match(msg, /#taphoalienanh/);
    assert.match(msg, /#suaruamattraxanh/);
    assert.doesNotMatch(msg, /洗顔/);
  });
  it("changes wording by variant and falls back to the short description without sections", () => {
    const v1 = composeFanpagePost(product, { link: "x", shopName: "S", hotline: "1", variant: 1 });
    assert.notEqual(v1.split("\n")[0], msg.split("\n")[0]);
    const plain = composeFanpagePost({ ...product, description: "", regularPrice: null }, { link: "x", shopName: "S", hotline: "1" });
    assert.match(plain, /Sữa rửa mặt tạo bọt chiết xuất trà xanh/);
    assert.match(plain, /💰 Giá: 175\.000đ$/m);
  });
  it("hashtags strip accents and spaces", () => {
    assert.equal(toHashtag("Sữa rửa mặt"), "#suaruamat");
    assert.equal(toHashtag("   "), "");
  });
});

describe("auto-post slots", () => {
  it("parses times", () => {
    assert.deepEqual(parseTimes("20:00, 9:00 ; 9h30 bad 25:00"), ["09:00", "09:30", "20:00"]);
  });
  it("returns slots that are due, not yet planned and not too late", () => {
    assert.deepEqual(dueSlots(["09:00", "20:00"], "09:05", []), ["09:00"]);
    assert.deepEqual(dueSlots(["09:00", "20:00"], "09:05", ["09:00"]), []);
    assert.deepEqual(dueSlots(["09:00", "20:00"], "12:00", []), []); // 3 h late → skipped
    assert.deepEqual(dueSlots(["09:00", "20:00"], "20:00", []), ["20:00"]);
  });
});

describe("Graph URL", () => {
  it("appends access_token with & when the path already has a query (was ?fields=name,link?access_token=…)", () => {
    assert.equal(graphUrl("v23.0", "123?fields=name,link", { access_token: "T" }), "https://graph.facebook.com/v23.0/123?fields=name%2Clink&access_token=T");
    assert.equal(graphUrl("v23.0", "/123/feed"), "https://graph.facebook.com/v23.0/123/feed");
  });
});
