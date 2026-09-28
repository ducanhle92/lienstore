// New rule check: VN stock serves a new order even when a Japan lot expires sooner; same place → FEFO; a line on a JP lot
// keeps it until "ghép lại" moves it to the VN stock that arrived later.
import assert from "node:assert/strict";
import { allocateOrderSync, listAllocationViews, reallocateOpenOrders } from "../../src/lib/allocations-db";
import { addStockLot, deleteStockLot, listStockLots } from "../../src/lib/db";
import { getDb, withTransaction } from "../../src/lib/sqlite";

const db = getDb();
let seq = 0;
function fakeOrder(productId: number, qty: number): number {
  const src = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown>;
  const oid = `chk-${Date.now()}-${seq++}`;
  const names = Object.keys(src);
  const vals = names.map((k) => (k === "id" ? oid : k === "number" ? 940000 + seq : k === "status" ? "pending" : k === "pay_code" ? `CK${Date.now()}${seq}` : k === "customer_id" ? null : k === "payment_method" ? "bacs" : k === "stock_committed_at" ? null : k === "ship_stage" ? "ordered" : k === "created_at" ? new Date(Date.now() + seq * 1000).toISOString() : src[k]));
  db.prepare(`INSERT INTO orders (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(...(vals as never[]));
  const r = db.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, image, quantity, purchase_status, purchase_note) VALUES (?, ?, 'x', 'x', 1, '', ?, 'not_bought', '')").run(oid, productId, qty);
  withTransaction(db, () => allocateOrderSync(db, oid));
  return Number(r.lastInsertRowid);
}
const clear = async (pid: number) => {
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id LIKE 'chk-%'").run();
  for (const l of await listStockLots(pid, true)) await deleteStockLot(l.id);
};
async function main() {
  const pid = (db.prepare("SELECT p.id FROM products p WHERE p.status = 'publish' AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status IN ('pending','processing')) ORDER BY p.id DESC LIMIT 1").get() as { id: number }).id;
  await clear(pid);
  const vn = await addStockLot({ productId: pid, qty: 5, expiry: "2028-06-30", warehouse: "vn" });
  await addStockLot({ productId: pid, qty: 5, expiry: "2027-06-30", warehouse: "jp" });
  const a = listAllocationViews(db, [fakeOrder(pid, 1)])[0];
  assert.equal(a.sourceId, vn.id, "case 1: VN first even with a later expiry");
  console.log("case 1 — VN lot HSD 2028 vs JP lot HSD 2027 → VN lot ✔", a.label);

  await clear(pid);
  await addStockLot({ productId: pid, qty: 5, expiry: "2028-01-31", warehouse: "jp" });
  const jpSoon = await addStockLot({ productId: pid, qty: 5, expiry: "2027-01-31", warehouse: "jp" });
  const b = listAllocationViews(db, [fakeOrder(pid, 1)])[0];
  assert.equal(b.sourceId, jpSoon.id, "case 2: same place → FEFO");
  console.log("case 2 — both in Japan → nearer expiry first ✔");

  await clear(pid);
  const jp = await addStockLot({ productId: pid, qty: 5, expiry: null, warehouse: "jp" });
  const item = fakeOrder(pid, 1);
  assert.equal(listAllocationViews(db, [item])[0].sourceId, jp.id);
  const vnLate = await addStockLot({ productId: pid, qty: 5, expiry: null, warehouse: "vn" });
  assert.equal(listAllocationViews(db, [item])[0].sourceId, jp.id, "case 3a: stays on the JP lot when VN stock arrives");
  const r = await reallocateOpenOrders();
  assert.equal(listAllocationViews(db, [item])[0].sourceId, vnLate.id, "case 3b: 'ghép lại' moves it to the VN lot");
  console.log(`case 3 — stays on JP lot until “Ghép lại” (${r.orders} orders re-served) → VN lot ✔`);
  await clear(pid);
  console.log("CHECK-VN OK");
}
main().catch((e) => {
  console.error("CHECK-VN FAILED", e);
  process.exit(1);
});
