/**
 * Sản phẩm › filter "Mã JAN" (lib/product-filter.ts):  npx tsx --test scripts/tests/product-filter-jan.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { filterProducts } from "../../src/lib/product-filter";
import type { CatalogProduct } from "../../src/types/shop";

const p = (id: number) => ({ id, name: `SP ${id}`, nameJa: "", slug: `sp-${id}`, sku: null, status: "publish", categories: [], stockStatus: "instock", fulfillment: "order", costSource: "", price: 1000, updatedAt: "2026-10-16" }) as unknown as CatalogProduct;
const all = [p(1), p(2), p(3)];
const jan = new Set([2]);

test("jan=yes keeps only products with an active barcode, jan=no the others", () => {
  assert.deepEqual(filterProducts(all, { jan: "yes" }, jan).map((x) => x.id), [2]);
  assert.deepEqual(filterProducts(all, { jan: "no" }, jan).map((x) => x.id).sort(), [1, 3]);
});
test("no jan filter (or no barcode set given) keeps everything", () => {
  assert.equal(filterProducts(all, {}, jan).length, 3);
  assert.equal(filterProducts(all, { jan: "yes" }).length, 3);
});
