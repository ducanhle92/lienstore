/** Variant families (nhóm biến thể) — pure unit tests:  npm run test:variants */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attrValues, collapseVariants, distinctParts, groupSlug, normalizeAttrLabels, parseVariantAttrs, sortVariants, variantLabel } from "../../src/lib/variants";
import type { CatalogProduct } from "../../src/types/shop";

const base = (over: Partial<CatalogProduct>): CatalogProduct =>
  ({
    id: 1, slug: "p", name: "P", price: 100, regularPrice: null, marketPrice: null, costPrice: null, costJpy: null, costSource: "", costUrl: "", costCheckedAt: null, marginPct: null, supplierUrl: null, minStock: null, weightG: null, dimsConfidence: null, dimsSource: "", nameJa: "", shortDescriptionJa: "", descriptionJa: "", dimsCm: null, currency: "VNĐ", sku: null, stock: null, stockStatus: "instock", fulfillment: "order", categories: [], tags: [], images: [], thumb: "", shortDescription: "", description: "", related: [], rating: null, reviewCount: 0, status: "publish", createdAt: "", updatedAt: "", groupId: null, variantAttrs: {}, variantPosition: 0,
    ...over,
  }) as CatalogProduct;

describe("normalizeAttrLabels / parseVariantAttrs", () => {
  it("splits, trims, dedupes and caps at 4", () => assert.deepEqual(normalizeAttrLabels(" Vị, khối lượng ,vị, Hương, Size, Màu "), ["Vị", "khối lượng", "Hương", "Size"]));
  it("parses only string values", () => assert.deepEqual(parseVariantAttrs('{"Vị":"Dâu","x":1,"y":" "}'), { Vị: "Dâu" }));
  it("tolerates garbage", () => assert.deepEqual(parseVariantAttrs("nope"), {}));
});

describe("collapseVariants", () => {
  const a = base({ id: 1, slug: "a", name: "Nama Socola Matcha", price: 363000, groupId: 7, variantPosition: 1 });
  const b = base({ id: 2, slug: "b", name: "Nama Socola Au Lait", price: 401000, groupId: 7, variantPosition: 0 });
  const c = base({ id: 3, slug: "c", name: "Khác", price: 50000 });
  it("keeps one card per family at the family's first position, with the price range", () => {
    const out = collapseVariants([a, c, b]);
    assert.equal(out.length, 2);
    assert.equal(out[0].id, 2, "representative = lowest variantPosition");
    assert.deepEqual(out[0].variantSummary, { count: 2, minPrice: 363000, maxPrice: 401000, variants: [{ id: 2, slug: "b", thumb: "", name: "Nama Socola Au Lait" }, { id: 1, slug: "a", thumb: "", name: "Nama Socola Matcha" }] });
    assert.equal(collapseVariants([a, b], new Map([[7, "Nama Socola"]]))[0].variantSummary?.groupName, "Nama Socola");
    assert.equal(out[1].id, 3);
    assert.equal(out[1].variantSummary, undefined);
  });
  it("leaves ungrouped lists untouched", () => assert.deepEqual(collapseVariants([c]).map((p) => p.id), [3]));
  it("ignores 'Liên hệ' (price 0) variants for the 'Từ …' price, and reports 0 only when none has a price", () => {
    const z = base({ id: 4, slug: "z", name: "Nama Socola Khác", price: 0, groupId: 7, variantPosition: 2 });
    const s = collapseVariants([a, b, z])[0].variantSummary!;
    assert.equal(s.minPrice, 363000);
    assert.equal(s.count, 3, "the unpriced variant is still one of the choices");
    assert.equal(collapseVariants([z, base({ ...z, id: 5, slug: "z2" })])[0].variantSummary?.minPrice, 0);
  });
});

describe("picker helpers", () => {
  const list = [base({ id: 1, name: "SAVAS Dâu 980g", variantAttrs: { Vị: "Dâu", "Khối lượng": "980g" }, variantPosition: 2 }), base({ id: 2, name: "SAVAS Cacao 980g", variantAttrs: { Vị: "Cacao", "Khối lượng": "980g" }, variantPosition: 1 }), base({ id: 3, name: "SAVAS Dâu 2.5kg", variantAttrs: { Vị: "Dâu", "Khối lượng": "2.5kg" }, variantPosition: 3 })];
  it("attrValues keeps order and uniqueness", () => assert.deepEqual(attrValues(sortVariants(list), "Vị"), ["Cacao", "Dâu"]));
  it("variantLabel joins attribute values in label order", () => assert.equal(variantLabel(list[0], ["Vị", "Khối lượng"]), "Dâu · 980g"));
  it("variantLabel falls back to the name minus the family name", () => assert.equal(variantLabel(base({ name: "Nama Socola Matcha Nhật Bản", variantAttrs: {} }), [], "Nama Socola"), "Matcha Nhật Bản"));
  it("distinctParts drops the shared head and tail words", () => {
    assert.deepEqual(distinctParts(["Nama Socola Matcha Nhật Bản", "Nama Socola Au Lait Nhật Bản"]), ["Matcha", "Au Lait"]);
    assert.deepEqual(distinctParts(["Viên uống tiền mãn kinh Kobayashi Inochi no Haha A 420 viên", "Viên uống tiền mãn kinh Kobayashi 840 viên"]), ["Inochi no Haha A 420 viên", "840 viên"], "unit word kept when the rest is a bare number");
    assert.deepEqual(distinctParts(["Cùng tên", "Cùng tên"]), ["tên", "tên"], "never returns an empty chip");
  });
  it("variantLabel prefers the differing words when siblings are known", () => assert.equal(variantLabel(base({ name: "Nama Socola Matcha Nhật Bản" }), [], "Nama Socola", ["Nama Socola Matcha Nhật Bản", "Nama Socola Au Lait Nhật Bản"]), "Matcha"));
  it("groupSlug", () => assert.equal(groupSlug("Viên uống tiền mãn kinh Kobayashi"), "vien-uong-tien-man-kinh-kobayashi"));
});
