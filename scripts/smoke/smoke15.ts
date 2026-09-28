// Sửa sản phẩm của đơn (1.98): quantity / price / remove / add; totals follow, units go back or get held.
// Run on a copy of a DB (LIEN_DB_PATH).
import assert from "node:assert/strict";
import { getOrderById, updateOrderItems } from "../../src/lib/db";
import { getDb, withTransaction } from "../../src/lib/sqlite";
import { createUnitsSync, listUnits, touchSync } from "../../src/lib/units-db";

const db = getDb();
const fresh = (not: number[]) =>
  (db.prepare(`SELECT p.id FROM products p WHERE p.status = 'publish' AND p.price > 0 AND p.id NOT IN (${[0, ...not].join(",")}) AND NOT EXISTS (SELECT 1 FROM stock_units u WHERE u.product_id = p.id) AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status IN ('pending','processing')) ORDER BY p.id DESC LIMIT 1`).get() as { id: number }).id;
const make = (productId: number, qty: number) =>
  withTransaction(db, () => {
    const ids = createUnitsSync(db, { productId, qty, status: "at_shop", boughtAt: "2026-09-27" });
    touchSync(db, { unitIds: ids });
    return ids;
  });
const free = (pid: number) => listUnits(db, { productId: pid, free: true }).length;

async function main() {
  const p1 = fresh([]);
  const p2 = fresh([p1]);
  make(p1, 3);
  make(p2, 1);
  const src = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown>;
  const oid = `smk15-${Date.now()}`;
  const names = Object.keys(src);
  const vals = names.map((k) => (k === "id" ? oid : k === "number" ? 960001 : k === "status" ? "pending" : k === "pay_code" ? `S15${Date.now()}` : k === "customer_id" ? null : k === "stock_committed_at" ? null : k === "paid_at" ? null : k === "ship_stage" ? "ordered" : k === "subtotal" ? 200000 : k === "discount" ? 20000 : k === "total" ? 210000 : k === "created_at" ? new Date().toISOString() : src[k]));
  db.prepare(`INSERT INTO orders (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(...(vals as never[]));
  const item = Number(db.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, image, quantity, purchase_status, purchase_note) VALUES (?, ?, 'x', 'x', 100000, '', 2, 'not_bought', '')").run(oid, p1).lastInsertRowid);
  withTransaction(db, () => touchSync(db, { orderIds: [oid] }));
  assert.equal(free(p1), 1, "2 of 3 held");
  // total = 200.000 − 20.000 + 30.000 shipping → the 30.000 must stay through every edit

  let r = await updateOrderItems(oid, { lines: [{ itemId: item, quantity: 1, price: 90000, remove: false }], add: [] });
  assert.ok(r.ok, r.message);
  let o = (await getOrderById(oid))!;
  assert.equal(free(p1), 2, "one unit went back to stock");
  assert.equal(o.subtotal, 90000);
  assert.equal(o.total, 90000 - 20000 + 30000, "discount kept, shipping kept");

  r = await updateOrderItems(oid, { lines: [], add: [{ productId: p2, quantity: 1, price: null }] });
  assert.ok(r.ok, r.message);
  o = (await getOrderById(oid))!;
  const added = o.items.find((it) => it.productId === p2)!;
  assert.ok(added, "line added");
  assert.equal(free(p2), 0, "the new line holds the unit at Kho VN");
  const p2price = (db.prepare("SELECT price FROM products WHERE id = ?").get(p2) as { price: number }).price;
  assert.equal(o.subtotal, 90000 + p2price, "web price used when none typed");

  r = await updateOrderItems(oid, { lines: [{ itemId: item, quantity: 1, price: 90000, remove: true }], add: [] });
  assert.ok(r.ok, r.message);
  o = (await getOrderById(oid))!;
  assert.equal(o.items.length, 1);
  assert.equal(free(p1), 3, "removed line gave its unit back");

  r = await updateOrderItems(oid, { lines: [{ itemId: added.itemId!, quantity: 1, price: p2price, remove: true }], add: [] });
  assert.equal(r.ok, false, "the last line cannot be removed");

  db.prepare("UPDATE orders SET ship_stage = 'delivering' WHERE id = ?").run(oid);
  r = await updateOrderItems(oid, { lines: [{ itemId: added.itemId!, quantity: 2, price: p2price, remove: false }], add: [] });
  assert.equal(r.ok, false, "out for delivery: no edits");
  console.log("SMOKE15 OK");
}
main().catch((e) => {
  console.error("SMOKE15 FAILED", e);
  process.exit(1);
});
