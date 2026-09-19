/** Header search suggestions: query normalisation, brand guessing from product names, merge order. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveBrands, isLoggableQuery, mergeTerms, normalizeQuery } from "../../src/lib/search-suggest-pure";

describe("search suggestions", () => {
  it("normalises queries (case, diacritics, spaces)", () => {
    assert.equal(normalizeQuery("  Kem Chống Nắng  Skin AQUA "), "kem chong nang skin aqua");
    assert.equal(normalizeQuery("Đồ uống"), "do uong");
    assert.ok(isLoggableQuery("dhc"));
    assert.ok(!isLoggableQuery("a"));
    assert.ok(!isLoggableQuery("   "));
  });
  it("guesses brands from capitalised Latin words that recur, skipping generic words", () => {
    const names = ["DHC Vitamin C 60 ngày", "DHC Collagen 60 viên", "Sữa tắm dầu ngựa Kumano Yushi Horse Oil", "Dầu gội Kumano Yushi", "Set dầu gội Dove Nhật Bản", "Sữa tắm Dove Premium", "Kem Hấp và Ủ Tóc Fino ShiSeiDo", "Fino Premium Touch mask", "Bình sữa Pigeon", "Viên uống Orihiro Glucosamine", "Orihiro Collagen jelly"];
    const b = deriveBrands(names, 20, 2);
    assert.deepEqual(b.slice(0, 5), ["DHC", "Dove", "Fino", "Kumano", "Orihiro"]);
    assert.ok(!b.includes("Set") && !b.includes("Premium") && !b.includes("Sữa") && !b.includes("Pigeon"));
  });
  it("merges pinned first, dedupes by normalised form and hides blocked terms", () => {
    const out = mergeTerms([["Kem chống nắng"], ["kem chong nang", "Sữa rửa mặt", "Toner"], ["Toner", "Dầu gội"]], 3, new Set(["toner"]));
    assert.deepEqual(out, ["Kem chống nắng", "Sữa rửa mặt", "Dầu gội"]);
  });
});
