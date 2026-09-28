// Nguồn hàng (1.92): who gets a unit when two orders want it — paid / COD orders before unpaid ones, then oldest;
// a newer order can take a unit an unpaid order holds ("lấy … cho đơn này", also from a packed box).
// Run on a copy of a DB (LIEN_DB_PATH); asserts the rules.
import assert from "node:assert/strict";
import { setOrderCod } from "../../src/lib/db";
import { heldByOthers, listAllocationViews, listSourceOptions, setManualAllocation } from "../../src/lib/allocations-db";
import { createShipment, packProduct } from "../../src/lib/shipments-db";
import { getDb, withTransaction } from "../../src/lib/sqlite";
import { createUnitsSync, listUnits, touchSync } from "../../src/lib/units-db";

const db = getDb();
let seq = 0;
function fakeOrder(productId: number, qty: number): { orderId: string; itemId: number; number: number } {
  const src = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown>;
  const oid = `smk13-${Date.now()}-${seq++}`;
  const number = 980000 + seq;
  const names = Object.keys(src);
  const vals = names.map((k) => (k === "id" ? oid : k === "number" ? number : k === "status" ? "pending" : k === "pay_code" ? `S13${Date.now()}${seq}` : k === "customer_id" ? null : k === "payment_method" ? "bacs" : k === "stock_committed_at" ? null : k === "paid_at" ? null : k === "ship_stage" ? "ordered" : k === "created_at" ? new Date(Date.now() + seq * 1000).toISOString() : src[k]));
  db.prepare(`INSERT INTO orders (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(...(vals as never[]));
  const r = db.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, image, quantity, purchase_status, purchase_note) VALUES (?, ?, 'x', 'x', 1, '', ?, 'not_bought', '')").run(oid, productId, qty);
  withTransaction(db, () => touchSync(db, { orderIds: [oid] }));
  return { orderId: oid, itemId: Number(r.lastInsertRowid), number };
}
const make = (productId: number, qty: number) =>
  withTransaction(db, () => {
    const ids = createUnitsSync(db, { productId, qty, status: "bought", boughtAt: "2026-09-27" });
    touchSync(db, { unitIds: ids });
    return ids;
  });
const held = (itemId: number) => listUnits(db, { itemIds: [itemId], withDelivered: true }).map((u) => u.id);
const needs = (itemId: number) => listAllocationViews(db, [itemId]).find((x) => x.sourceType === "buy")?.qty ?? 0;
const freshProduct = (not: number[] = []) =>
  (db.prepare(`SELECT p.id FROM products p WHERE p.status = 'publish' AND p.id NOT IN (${[0, ...not].join(",")}) AND NOT EXISTS (SELECT 1 FROM stock_units u WHERE u.product_id = p.id) AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status IN ('pending','processing')) ORDER BY p.id DESC LIMIT 1`).get() as { id: number }).id;

async function main() {
  // --- A. one unit, packed while the older unpaid order holds it: the newer order is "Cần mua" and can take it
  const pid = freshProduct();
  const [unit] = make(pid, 1);
  const older = fakeOrder(pid, 1);
  const newer = fakeOrder(pid, 1);
  assert.deepEqual(held(older.itemId), [unit], "the older order holds the only unit");
  const sh = createShipment({ label: "smoke13", plannedAt: null, note: "" });
  assert.equal(packProduct(sh.id, pid, 1).units, 1, "packed it");
  assert.equal(needs(newer.itemId), 1, "the newer order waits as Cần mua");
  assert.deepEqual(heldByOthers(db, pid, newer.itemId).map((u) => u.orderNumber), [older.number], "…because the older order holds it (shown on the order page)");
  const opt = listSourceOptions(db, pid, newer.itemId).find((o) => o.value.startsWith("take:"));
  assert.ok(opt && opt.label.includes(`#${older.number}`), "đổi nguồn offers to take it from the older order");
  const r = await setManualAllocation(newer.itemId, opt.value);
  assert.ok(r.ok, r.message);
  assert.deepEqual(held(newer.itemId), [unit], "the newer order now holds the packed unit");
  assert.equal(needs(older.itemId), 1, "the older order is Cần mua now");
  assert.equal(listUnits(db, { ids: [unit] })[0].shipmentId, sh.id, "the unit stays in its box");

  // --- B. paid / COD first: a newer COD order gets the free unit ahead of an older unpaid one
  const pid2 = freshProduct([pid]);
  const [u2] = make(pid2, 1);
  const unpaid = fakeOrder(pid2, 1);
  const cod = fakeOrder(pid2, 1);
  assert.deepEqual(held(unpaid.itemId), [u2], "before payment the older order holds it");
  await setOrderCod(cod.orderId);
  assert.deepEqual(held(cod.itemId), [u2], "after COD the newer, committed order holds it");
  assert.equal(needs(unpaid.itemId), 1, "the unpaid one goes back to Cần mua");
  assert.equal(heldByOthers(db, pid2, unpaid.itemId).length, 0, "a paid order's units are never offered to take");

  // --- C. a paid order still short takes a unit already packed for an unpaid order
  const pid3 = freshProduct([pid, pid2]);
  const [u3] = make(pid3, 1);
  const first = fakeOrder(pid3, 1);
  const sh3 = createShipment({ label: "smoke13c", plannedAt: null, note: "" });
  assert.equal(packProduct(sh3.id, pid3, 1).units, 1);
  assert.deepEqual(held(first.itemId), [u3], "packed for the first (unpaid) order");
  const payer = fakeOrder(pid3, 1);
  assert.equal(needs(payer.itemId), 1, "unpaid second order does not take a packed unit");
  await setOrderCod(payer.orderId);
  assert.deepEqual(held(payer.itemId), [u3], "once COD it takes the packed unit");
  assert.equal(needs(first.itemId), 1, "the unpaid order goes back to Cần mua");
  console.log("SMOKE13 OK");
}
main().catch((e) => {
  console.error("SMOKE13 FAILED", e);
  process.exit(1);
});
