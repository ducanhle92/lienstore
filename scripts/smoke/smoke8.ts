// Đóng hàng smoke (copy of the local DB): pack by product FEFO (paid units first, last lot split), the shelf shrinks
// while products.stock does not, unpack merges back, status "handed" moves the lots to the carrier, delete returns lots.
import assert from "node:assert/strict";
import { allocateOrderSync } from "../../src/lib/allocations-db";
import { addStockLot, deleteStockLot, listStockLots, setOrderTransferReceived } from "../../src/lib/db";
import { listLotViews } from "../../src/lib/lots-db";
import { createShipment, deleteShipment, getShipment, listPackCandidates, listPackSources, packCandidates, packLots, packProduct, setShipmentStatus, unpackLot } from "../../src/lib/shipments-db";
import { getDb, withTransaction } from "../../src/lib/sqlite";
import { syncProductStock } from "../../src/lib/stock-sync";

const db = getDb();
let seq = 0;
function fakeOrder(productId: number, qty: number): { orderId: string; itemId: number } {
  const src = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown>;
  const oid = `smk8-${Date.now()}-${seq++}`;
  const names = Object.keys(src);
  const vals = names.map((k) => (k === "id" ? oid : k === "number" ? 960000 + seq : k === "status" ? "pending" : k === "pay_code" ? `S8${Date.now()}${seq}` : k === "customer_id" ? null : k === "payment_method" ? "bacs" : k === "stock_committed_at" ? null : k === "paid_at" ? null : k === "ship_stage" ? "ordered" : src[k]));
  db.prepare(`INSERT INTO orders (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(...(vals as never[]));
  db.prepare("INSERT INTO order_stage_log (order_id, stage, note, created_at) VALUES (?, 'ordered', '', ?)").run(oid, new Date().toISOString());
  const r = db.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, image, quantity, purchase_status, purchase_note) VALUES (?, ?, 'x', 'x', 1, '', ?, 'not_bought', '')").run(oid, productId, qty);
  withTransaction(db, () => allocateOrderSync(db, oid));
  return { orderId: oid, itemId: Number(r.lastInsertRowid) };
}
const lot = (id: number) => db.prepare("SELECT id, qty_left, warehouse, in_transit, shipment_id, parent_lot_id FROM stock_lots WHERE id = ?").get(id) as { id: number; qty_left: number; warehouse: string; in_transit: number; shipment_id: number | null; parent_lot_id: number | null } | undefined;
const stockOf = (pid: number) => (db.prepare("SELECT stock FROM products WHERE id = ?").get(pid) as { stock: number }).stock;
const shelf = (pid: number) => listLotViews(db, { productId: pid, side: "jp" }).filter((l) => l.warehouse === "jp" && !l.inTransit && l.shipmentId === null).reduce((n, l) => n + l.physical, 0);

async function main() {
  const pid = (db.prepare("SELECT p.id FROM products p WHERE p.status = 'publish' AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status IN ('pending','processing')) AND NOT EXISTS (SELECT 1 FROM stock_purchases sp WHERE sp.product_id = p.id AND sp.lot_id IS NULL) ORDER BY p.id DESC LIMIT 1").get() as { id: number }).id;
  for (const l of await listStockLots(pid, true)) await deleteStockLot(l.id);
  const A = await addStockLot({ productId: pid, qty: 4, expiry: "2026-12-31", warehouse: "jp", sourceKey: "amazon" }); // expires first
  const B = await addStockLot({ productId: pid, qty: 6, expiry: "2027-06-30", warehouse: "jp", sourceKey: "amazon" });
  // a paid order holds 2 units of A (deducted, still on the shelf)
  const o = fakeOrder(pid, 2);
  assert.ok((await setOrderTransferReceived(o.orderId)).ok);
  assert.equal(lot(A.id)!.qty_left, 2);
  assert.equal(stockOf(pid), 8);
  assert.equal(shelf(pid), 10, "shelf = 2 unsold + 2 paid of A + 6 of B");

  // pack 5 units: FEFO → all of A (2 unsold + 2 paid = 4), then 1 of B (split)
  const sh = createShipment({ label: "smoke8", plannedAt: "2026-10-02", note: "" });
  const r = packProduct(sh.id, pid, 5);
  assert.ok(r.ok, r.message);
  assert.equal(r.units, 5);
  assert.equal(r.lots, 2);
  let s = getShipment(sh.id)!;
  assert.equal(s.units, 5);
  assert.equal(s.heldUnits, 2, "paid units travel");
  assert.equal(lot(A.id)!.shipment_id, sh.id, "whole lot A boxed");
  const part = s.lots.find((l) => l.parentLotId === B.id)!;
  assert.ok(part, "part of B split off");
  assert.equal(part.qtyLeft, 1);
  assert.equal(lot(B.id)!.qty_left, 5);
  assert.equal(shelf(pid), 5, "shelf shrinks by what was packed");
  assert.equal(stockOf(pid), 8, "web stock unchanged (units still exist, just boxed)");
  assert.equal(lot(A.id)!.warehouse, "jp", "still at the shop while packing");
  // more than the shelf has → what is there goes, message says how many are missing
  const over = packProduct(sh.id, pid, 99);
  assert.ok(over.ok && over.units === 5, over.message);
  assert.match(over.message, /thiếu 94/);
  assert.equal(shelf(pid), 0);
  // B was boxed whole by the over-pack: unpack it, then the split part → the part merges back into B
  assert.ok(unpackLot(B.id).ok);
  const u = unpackLot(part.id);
  assert.ok(u.ok, u.message);
  assert.match(u.message, /gộp lại/);
  assert.equal(lot(part.id), undefined);
  assert.equal(lot(B.id)!.qty_left, 6, "B whole again");
  s = getShipment(sh.id)!;
  assert.equal(s.units, 4, "only A left in the run");
  assert.equal(shelf(pid), 6, "B (6) back on the shelf; A (4) still boxed");
  assert.equal(stockOf(pid), 8);

  // handed to the carrier → boxed lots move to Kho ĐVVC Nhật; the order line follows
  assert.ok((await setShipmentStatus(sh.id, "packed")).ok);
  assert.equal(lot(A.id)!.warehouse, "jp");
  assert.ok((await setShipmentStatus(sh.id, "handed")).ok);
  assert.equal(lot(A.id)!.warehouse, "jp_carrier");
  assert.equal((db.prepare("SELECT purchase_status FROM order_items WHERE id = ?").get(o.itemId) as { purchase_status: string }).purchase_status, "to_carrier_jp");
  assert.equal(packLots(sh.id, [{ lotId: B.id }]).ok, false, "cannot add once handed");
  assert.equal(unpackLot(A.id).ok, false, "cannot pull out once handed");
  assert.equal(deleteShipment(sh.id).ok, false);
  assert.ok((await setShipmentStatus(sh.id, "flying")).ok);
  assert.equal(lot(A.id)!.in_transit, 1);
  assert.ok((await setShipmentStatus(sh.id, "done")).ok);
  assert.equal(lot(A.id)!.warehouse, "vn");
  assert.equal(stockOf(pid), 8);

  // a second run deleted while packing gives its lots back
  const sh2 = createShipment({ label: "smoke8-2", plannedAt: null, note: "" });
  assert.ok(packLots(sh2.id, [{ lotId: B.id, qty: 2 }]).ok);
  assert.equal(shelf(pid), 4);
  const d = deleteShipment(sh2.id);
  assert.ok(d.ok, d.message);
  assert.equal(shelf(pid), 6, "units back on the shelf (merged into B)");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM stock_lots WHERE product_id = ? AND warehouse = 'jp'").get(pid) as { n: number }).n, 1, "the split part merged back");

  // H. picker: a paid order line bought at the shop without a lot (legacy "Đã mua") shows up, gets a lot and is packed
  const o2 = fakeOrder(pid, 1);
  db.prepare("UPDATE order_items SET purchase_status = 'bought' WHERE id = ?").run(o2.itemId);
  db.prepare("UPDATE order_item_allocations SET source_type = 'batch', source_id = 0 WHERE order_item_id = ?").run(o2.itemId);
  syncProductStock(db, pid, new Date().toISOString()); // the hand-made allocation no longer holds a lot
  assert.ok((await setOrderTransferReceived(o2.orderId)).ok);
  const cands = listPackCandidates(db, { orderId: o2.orderId });
  assert.equal(cands.length, 1);
  assert.equal(cands[0].kind, "line");
  assert.equal(cands[0].heldQty, 1, "paid line");
  assert.ok(listPackSources(db).orders.some((o) => o.orderId === o2.orderId));
  assert.ok(listPackCandidates(db, { q: String(960000 + seq) }).length >= 1, "search by order number");
  const sh3 = createShipment({ label: "smoke8-3", plannedAt: null, note: "" });
  const stockBefore = stockOf(pid);
  const pc = packCandidates(sh3.id, [{ key: cands[0].key }]);
  assert.ok(pc.ok, pc.message);
  assert.equal(pc.units, 1);
  const s3 = getShipment(sh3.id)!;
  assert.equal(s3.units, 1);
  assert.equal(s3.heldUnits, 1);
  const alloc = db.prepare("SELECT source_type, source_id, consumed_at FROM order_item_allocations WHERE order_item_id = ?").get(o2.itemId) as { source_type: string; source_id: number; consumed_at: string | null };
  assert.equal(alloc.source_type, "lot");
  assert.equal(alloc.source_id, s3.lots[0].id, "line now points at its lot, boxed in the run");
  assert.ok(alloc.consumed_at, "paid → deducted on the new lot");
  assert.equal(stockOf(pid), stockBefore, "web stock unchanged by materialising a paid line");
  assert.equal(listPackCandidates(db, { orderId: o2.orderId }).length, 0, "no longer a candidate");
  assert.ok((await setShipmentStatus(sh3.id, "handed")).ok);
  assert.equal((db.prepare("SELECT purchase_status FROM order_items WHERE id = ?").get(o2.itemId) as { purchase_status: string }).purchase_status, "to_carrier_jp");
  console.log("SMOKE8 OK");
}
main().catch((e) => {
  console.error("SMOKE8 FAILED", e);
  process.exit(1);
});
