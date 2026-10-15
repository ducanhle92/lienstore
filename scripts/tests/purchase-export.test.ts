import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { getCurrentPurchaseNeeds, purchaseCsv } from "../../src/lib/purchase-export";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE orders (id TEXT, number INTEGER, status TEXT);
    CREATE TABLE order_items (id INTEGER, order_id TEXT, product_id INTEGER, quantity INTEGER);
    CREATE TABLE stock_units (product_id INTEGER, order_item_id INTEGER, status TEXT, removed TEXT);
    INSERT INTO orders VALUES ('old', 1, 'processing'), ('new', 2, 'pending');`);
  return db;
}

test("past purchases at every stage cover the old order, even if still processing", () => {
  const db = fixture();
  try {
    const statuses = ['ordered', 'bought', 'to_carrier_jp', 'shipped_jp_vn', 'at_carrier_vn', 'to_shop', 'at_shop', 'shipped_to_customer', 'delivered'];
    db.prepare("INSERT INTO order_items VALUES (1, 'old', 10, ?)").run(statuses.length);
    for (const status of statuses) db.prepare("INSERT INTO stock_units VALUES (10, 1, ?, NULL)").run(status);
    assert.deepEqual(getCurrentPurchaseNeeds(db), []);
    db.exec("INSERT INTO order_items VALUES (2, 'new', 10, 2)");
    assert.deepEqual(getCurrentPurchaseNeeds(db), [{ productId: 10, orderQuantity: 2, stockQuantity: 0, quantity: 2, orders: ['#2x2'] }]);
  } finally { db.close(); }
});

test("partial purchase, removed units and planned stock are counted exactly once", () => {
  const db = fixture();
  try {
    db.exec(`INSERT INTO order_items VALUES (1, 'new', 10, 5);
      INSERT INTO stock_units VALUES (10, 1, 'bought', NULL), (10, 1, 'at_shop', NULL),
        (10, 1, 'not_bought', NULL), (10, 1, 'bought', 'removed'),
        (10, NULL, 'not_bought', NULL), (10, NULL, 'not_bought', NULL),
        (10, NULL, 'not_bought', 'removed'), (10, NULL, 'bought', NULL);`);
    assert.deepEqual(getCurrentPurchaseNeeds(db), [{ productId: 10, orderQuantity: 3, stockQuantity: 2, quantity: 5, orders: ['#2x3'] }]);
  } finally { db.close(); }
});

test("cancelled/completed orders excluded, planned-only purchases retained", () => {
  const db = fixture();
  try {
    db.exec(`INSERT INTO orders VALUES ('cancel', 3, 'cancelled'), ('done', 4, 'completed');
      INSERT INTO order_items VALUES (3, 'cancel', 20, 5), (4, 'done', 30, 5);
      INSERT INTO stock_units VALUES (20, 3, 'not_bought', NULL), (40, NULL, 'not_bought', NULL);`);
    assert.deepEqual(getCurrentPurchaseNeeds(db), [{ productId: 40, orderQuantity: 0, stockQuantity: 1, quantity: 1, orders: [] }]);
  } finally { db.close(); }
});

test("empty need list and CSV quoting for Vietnamese/Excel", () => {
  const db = fixture();
  try { assert.deepEqual(getCurrentPurchaseNeeds(db), []); } finally { db.close(); }
  assert.equal(purchaseCsv([["Tên", "SL"], ['Dầu "xả", Nhật', 2]]), '\uFEFF"Tên","SL"\r\n"Dầu ""xả"", Nhật","2"');
});

test("CSV columns: cần mua theo đơn, cần mua lưu kho, còn thiếu = tổng; barcode SKU stays text in Excel", async () => {
  const { PURCHASE_CSV_HEADER, purchaseCsvRows } = await import("../../src/lib/purchase-export");
  assert.deepEqual(PURCHASE_CSV_HEADER.slice(3, 6), ["Cần mua theo đơn", "Cần mua lưu kho", "Còn thiếu"]);
  const rows = purchaseCsvRows([{ productId: 7, orderQuantity: 3, stockQuantity: 2, quantity: 5, orders: ["#2x3"] }], () => ({ name: "Dầu gội", sku: "4987050000000", costPrice: 10000, supplierUrl: "" }));
  assert.deepEqual(rows[0].slice(2, 6), ['="4987050000000"', 3, 2, 5]);
  assert.equal(rows[0][8], 50000);
  assert.ok(purchaseCsv(rows).includes('"=""4987050000000"""'));
  const plain = purchaseCsvRows([{ productId: 8, orderQuantity: 1, stockQuantity: 0, quantity: 1, orders: [] }], () => ({ name: "x", sku: "EBISU-ADULT-SOFT", costPrice: null, supplierUrl: "" }));
  assert.equal(plain[0][2], "EBISU-ADULT-SOFT");
});
