// Cancelled orders leave their purchase batch; the batch counts match the lots; flow step counts add up (copy of the local DB).
import assert from "node:assert/strict";
import { allocateOrderSync, cleanupOrphanLotRefs } from "../../src/lib/allocations-db";
import { addStockLot, updateOrderStatus } from "../../src/lib/db";
import { flowCounts } from "../../src/lib/flow-db";
import { listLotViews } from "../../src/lib/lots-db";
import { createPurchaseBatch, getPurchaseBatch } from "../../src/lib/purchase-batches-db";
import { getDb, withTransaction } from "../../src/lib/sqlite";

const db = getDb();
let seq = 0;
function fakeOrder(productId: number, qty: number, batchId: number): { orderId: string; itemId: number } {
  const src = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown>;
  const oid = `smk10-${Date.now()}-${seq++}`;
  const names = Object.keys(src);
  const vals = names.map((k) => (k === "id" ? oid : k === "number" ? 960000 + seq : k === "status" ? "pending" : k === "pay_code" ? `S10${Date.now()}${seq}` : k === "customer_id" ? null : k === "payment_method" ? "bacs" : k === "stock_committed_at" ? null : k === "ship_stage" ? "ordered" : src[k]));
  db.prepare(`INSERT INTO orders (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(...(vals as never[]));
  const r = db.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, image, quantity, purchase_status, purchase_note, batch_id) VALUES (?, ?, 'x', 'x', 1, '', ?, 'bought', '', ?)").run(oid, productId, qty, batchId);
  withTransaction(db, () => allocateOrderSync(db, oid));
  return { orderId: oid, itemId: Number(r.lastInsertRowid) };
}

async function main() {
  const pid = (db.prepare("SELECT id FROM products WHERE status = 'publish' ORDER BY id DESC LIMIT 1").get() as { id: number }).id;
  const batch = createPurchaseBatch({ label: "smoke10", sourceKey: "amazon", boughtAt: "2026-09-27", note: "" });
  const lot = await addStockLot({ productId: pid, qty: 2, expiry: null, warehouse: "jp", boughtAt: "2026-09-27", batchId: batch.id });
  db.prepare("UPDATE stock_lots SET batch_id = ? WHERE id = ?").run(batch.id, lot.id);
  const a = fakeOrder(pid, 1, batch.id);
  const b = fakeOrder(pid, 1, batch.id);
  let bb = getPurchaseBatch(batch.id)!;
  assert.equal(bb.lines.length, 2, "two order lines in the batch");

  // cancel through the normal path → the line leaves the batch, the unit is free again
  await updateOrderStatus(a.orderId, "cancelled");
  bb = getPurchaseBatch(batch.id)!;
  assert.equal(bb.lines.filter((l) => l.orderId === a.orderId).length, 0, "cancelled line gone from the batch");
  const lv = listLotViews(db, { productId: pid }).find((l) => l.id === lot.id)!;
  assert.equal(lv.reserved.filter((r) => r.orderId === a.orderId).length, 0, "cancelled order holds nothing");

  // legacy state: a cancelled order still sitting in the batch (cancelled before this release) → startup cleanup detaches it
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(b.orderId);
  db.prepare("DELETE FROM order_item_allocations WHERE order_item_id = ?").run(b.itemId);
  assert.equal((db.prepare("SELECT batch_id FROM order_items WHERE id = ?").get(b.itemId) as { batch_id: number | null }).batch_id, batch.id);
  assert.equal(getPurchaseBatch(batch.id)!.lines.length, 0, "hidden from the batch even before cleanup");
  await cleanupOrphanLotRefs();
  assert.equal((db.prepare("SELECT batch_id FROM order_items WHERE id = ?").get(b.itemId) as { batch_id: number | null }).batch_id, null, "cleanup detached it");

  // flow counts: every lot unit sits in exactly one step
  const c = flowCounts(db);
  const all = listLotViews(db).reduce((n, l) => n + l.physical, 0);
  assert.equal(c.jp + c.pack + c.transit + c.vn, all, "steps add up to all lot units");
  console.log("flow", c);
  console.log("SMOKE10 OK");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
