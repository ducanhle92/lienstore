/** Inline-label description → headed sections — pure unit tests:  npm run test:description */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { structureDescription } from "../../src/lib/description";
import { restructureInlineDescription } from "../../src/lib/description-restructure";

const facts = `<ul><li>Thương hiệu: DHC</li><li>Xuất xứ: Nhật Bản</li><li>Dung tích: 30日分・48.0g（1.6g×30本）</li><li>Mã vạch (JAN): 4511413408247</li></ul>`;
const para =
  `<p>Công dụng: bổ sung vitamin C và vitamin B2 cho chế độ ăn hằng ngày. Thành phần chính: siro maltitol khử, vitamin C, chất tạo ngọt stevia, hương liệu và vitamin B2. ` +
  `Cách dùng: 1 gói mỗi ngày; uống với nước hoặc nước ấm, hoặc cho trực tiếp vào miệng rồi nuốt sau khi tan. ` +
  `Lưu ý: dùng đúng lượng khuyến nghị; ngừng dùng nếu thấy bất thường; người đang dùng thuốc, điều trị bệnh hoặc mang thai nên hỏi bác sĩ; tránh nắng, nóng và ẩm; dùng sớm sau khi mở gói (theo trang hãng).</p>`;

describe("restructureInlineDescription", () => {
  it("splits the OS Drug import paragraph into the four headed sections and keeps the facts list", () => {
    const out = restructureInlineDescription(facts + para)!;
    assert.ok(out.startsWith(facts), "facts <ul> kept first");
    assert.match(out, /<h3>Công dụng<\/h3><p>Bổ sung vitamin C và vitamin B2 cho chế độ ăn hằng ngày\.<\/p>/);
    assert.match(out, /<h3>Thành phần<\/h3><p>Siro maltitol khử, vitamin C, chất tạo ngọt stevia, hương liệu và vitamin B2\.<\/p>/);
    assert.match(out, /<h3>Hướng dẫn sử dụng<\/h3><ul><li>1 gói mỗi ngày<\/li><li>Uống với nước hoặc nước ấm, hoặc cho trực tiếp vào miệng rồi nuốt sau khi tan<\/li><\/ul>/);
    assert.match(out, /<h3>Lưu ý &amp; bảo quản<\/h3><ul><li>Dùng đúng lượng khuyến nghị<\/li>.*<li>Dùng sớm sau khi mở gói<\/li><\/ul>/);
    assert.ok(!/theo trang hãng\)/.test(out), "source parenthetical lifted out of the last bullet");
    assert.match(out, /<p><em>Theo thông tin công bố của hãng\.<\/em><\/p>$/);
  });

  it("is understood by structureDescription: facts + one section per heading, in canonical order", () => {
    const out = restructureInlineDescription(facts + para)!;
    const s = structureDescription(out, "Bột uống bổ sung Vitamin C DHC");
    assert.deepEqual(
      s.facts.map((f) => f.label),
      ["Thương hiệu", "Xuất xứ", "Quy cách"],
    );
    // the trailing source note has no heading of its own, so it stays inside the last (notes) section
    assert.deepEqual(
      s.sections.map((x) => x.key),
      ["benefits", "ingredients", "usage", "notes"],
    );
    assert.match(s.sections[3].html, /Theo thông tin công bố của hãng/);
    assert.ok(s.structured);
  });

  it("leaves anything that is not a single inline-label paragraph alone", () => {
    assert.equal(restructureInlineDescription(`${facts}<h3>Công dụng</h3><p>x</p>`), null, "already structured");
    assert.equal(restructureInlineDescription(`<p>Chỉ có công dụng: một câu thôi.</p>`), null, "fewer than two labels");
    assert.equal(restructureInlineDescription(`<p>Công dụng: a.</p><p>Thành phần: b.</p>`), null, "two paragraphs");
    assert.equal(restructureInlineDescription(""), null);
  });

  it("does not mistake other 'Word: value' pairs for section labels", () => {
    const out = restructureInlineDescription(`<p>Công dụng: hỗ trợ. Vitamin C: 1000mg mỗi viên. Lưu ý: bảo quản nơi khô ráo.</p>`)!;
    assert.match(out, /<h3>Công dụng<\/h3><p>Hỗ trợ\. Vitamin C: 1000mg mỗi viên\.<\/p>/);
    assert.equal((out.match(/<h3>/g) ?? []).length, 2);
  });
});
