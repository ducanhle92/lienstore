// Lot-location model smoke (copy of the local DB): migration 61 leaves no bought slip without a lot; FEFO picks lots for
// orders and shipments; partial split into a shipment merges back on hold; batch status moves lots through the four
// places; removing a lot is allowed before NB→VN and refused after; pickup/delivery readiness only from Kho VN (shop).
import assert from "node:assert/strict";
import { allocateOrderSync, listAllocationViews } from "../../src/lib/allocations-db";
import { addStockLot, deleteStockLot, listStockLots, moveLotsToStatus, setOrderTransferReceived } from "../../src/lib/db";
import { listLotViews, listOrdersReadyToShip } from "../../src/lib/lots-db";
import { addLotsToBatch, createPurchaseBatch, deletePurchaseBatch, listLotsAvailableForBatch, removeLotsFromBatch, setPurchaseBatchStatus } from "../../src/lib/purchase-batches-db";
import { getDb, withTransaction } from "../../src/lib/sqlite";

const db = getDb();
let seq = 0;
function fakeOrder(productId: number, qty: number): { orderId: string; itemId: number } {
  const src = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown>;
  const oid = `smk6-${Date.now()}-${seq++}`;
  const names = Object.keys(src);
  const vals = names.map((k) => (k === "id" ? oid : k === "number" ? 970000 + seq : k === "status" ? "pending" : k === "pay_code" ? `S6${Date.now()}${seq}` : k === "customer_id" ? null : k === "payment_method" ? "bacs" : k === "stock_committed_at" ? null : k === "ship_stage" ? "ordered" : k === "delivery" ? "pickup" : src[k]));
  db.prepare(`INSERT INTO orders (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(...(vals as never[]));
  db.prepare("INSERT INTO order_stage_log (order_id, stage, note, created_at) VALUES (?, 'ordered', '', ?)").run(oid, new Date().toISOString());
  const r = db.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, image, quantity, purchase_status, purchase_note) VALUES (?, ?, 'x', 'x', 1, '', ?, 'not_bought', '')").run(oid, productId, qty);
  withTransaction(db, () => allocateOrderSync(db, oid));
  return { orderId: oid, itemId: Number(r.lastInsertRowid) };
}
type LotRow = { id: number; qty_left: number; warehouse: string; in_transit: number; batch_id: number | null; parent_lot_id: number | null };
const lot = (id: number) => db.prepare("SELECT id, qty_left, warehouse, in_transit, batch_id, parent_lot_id FROM stock_lots WHERE id = ?").get(id) as LotRow | undefined;
const lineStatus = (itemId: number) => (db.prepare("SELECT purchase_status FROM order_items WHERE id = ?").get(itemId) as { purchase_status: string }).purchase_status;
const stockOf = (pid: number) => (db.prepare("SELECT stock FROM products WHERE id = ?").get(pid) as { stock: number }).stock;

async function main() {
  // A. migration 61: every slip from "Tại kho Nhật" on is a lot; no allocation still points at such a slip
  const orphan = db.prepare("SELECT COUNT(*) AS n FROM stock_purchases WHERE status IN ('bought','to_carrier_jp','shipped_jp_vn','at_carrier_vn','to_shop') AND lot_id IS NULL").get() as { n: number };
  assert.equal(orphan.n, 0, "bought slips without a lot after migration");
  const stale = db.prepare("SELECT COUNT(*) AS n FROM order_item_allocations a JOIN stock_purchases sp ON sp.id = a.source_id WHERE a.source_type = 'stock_purchase' AND sp.lot_id IS NOT NULL").get() as { n: number };
  assert.equal(stale.n, 0, "allocations still on slips that became lots");
  const byWh = db.prepare("SELECT warehouse, COALESCE(in_transit,0) AS t, SUM(qty_left) AS u FROM stock_lots GROUP BY 1, 2").all() as Array<{ warehouse: string; t: number; u: number }>;
  console.log("lots by place:", byWh.map((r) => `${r.warehouse}${r.t ? "(bay)" : ""}=${r.u}`).join(" "));

  // B. FEFO for orders and for the shipment picker
  const pid = (db.prepare("SELECT p.id FROM products p WHERE p.status = 'publish' AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status IN ('pending','processing')) AND NOT EXISTS (SELECT 1 FROM stock_purchases sp WHERE sp.product_id = p.id AND sp.lot_id IS NULL) ORDER BY p.id DESC LIMIT 1").get() as { id: number }).id;
  for (const l of await listStockLots(pid, true)) await deleteStockLot(l.id);
  const A = await addStockLot({ productId: pid, qty: 5, expiry: "2027-06-30", warehouse: "jp", sourceKey: "amazon" });
  const B = await addStockLot({ productId: pid, qty: 5, expiry: "2026-12-31", warehouse: "jp", sourceKey: "amazon" });
  const C = await addStockLot({ productId: pid, qty: 5, expiry: "2028-01-31", warehouse: "jp", sourceKey: "amazon" });
  assert.equal(stockOf(pid), 15, "JP lots count as available stock");
  const o = fakeOrder(pid, 2);
  const av = listAllocationViews(db, [o.itemId]);
  assert.equal(av.length, 1);
  assert.equal(av[0].sourceType, "lot");
  assert.equal(av[0].sourceId, B.id, "FEFO: the order takes the lot expiring first");
  assert.equal(stockOf(pid), 13);
  const pick = listLotsAvailableForBatch().filter((l) => l.productId === pid).map((l) => l.id);
  assert.deepEqual(pick, [B.id, A.id, C.id], "shipment picker lists Kho Nhật lots FEFO");

  // C. part of a lot into a shipment, then "giữ lại" → merged back into the parent
  const b1 = createPurchaseBatch({ label: "smoke6-1", sourceKey: "", boughtAt: null, note: "" });
  const r1 = addLotsToBatch(b1.id, [{ lotId: C.id, qty: 2 }]);
  assert.ok(r1.ok && r1.added === 1, r1.message);
  const child = db.prepare("SELECT id FROM stock_lots WHERE parent_lot_id = ? AND batch_id = ?").get(C.id, b1.id) as { id: number };
  assert.ok(child, "split-off lot in the shipment");
  assert.equal(lot(child.id)!.qty_left, 2);
  assert.equal(lot(C.id)!.qty_left, 3);
  assert.equal(lot(C.id)!.batch_id, null, "the rest stays outside the shipment");
  const r2 = removeLotsFromBatch([child.id]);
  assert.ok(r2.ok, r2.message);
  assert.match(r2.message, /gộp lại 1 lô/);
  assert.equal(lot(child.id), undefined, "merged back");
  assert.equal(lot(C.id)!.qty_left, 5);
  assert.equal(stockOf(pid), 13);

  // D. batch status → lot place (the lot holds units of a paid pickup order)
  const pay = await setOrderTransferReceived(o.orderId);
  assert.ok(pay.ok, pay.message);
  assert.equal(lot(B.id)!.qty_left, 3, "paid → deducted from the lot");
  assert.equal(stockOf(pid), 13, "stock unchanged by payment (reservation → deduction)");
  // "Tự chọn theo đơn": qty 0 = only the units the customer paid for travel; the 3 unsold stay at Kho Nhật
  const r3 = addLotsToBatch(b1.id, [{ lotId: B.id, qty: 0 }]);
  assert.ok(r3.ok && r3.added === 1, r3.message);
  const S = (db.prepare("SELECT id FROM stock_lots WHERE parent_lot_id = ? AND batch_id = ?").get(B.id, b1.id) as { id: number }).id;
  assert.equal(lot(S)!.qty_left, 0, "child holds no unsold units");
  assert.equal((db.prepare("SELECT SUM(qty) AS q FROM order_item_allocations WHERE source_type = 'lot' AND source_id = ?").get(S) as { q: number }).q, 2, "the paid units moved to the child");
  assert.equal(lot(B.id)!.qty_left, 3);
  assert.equal(lot(B.id)!.batch_id, null);
  const jpView = listLotViews(db, { productId: pid, side: "jp" }).find((v) => v.id === S)!;
  assert.ok(jpView, "a lot with only paid units still shows");
  assert.equal(jpView.heldQty, 2);
  assert.equal(jpView.physical, 2);
  assert.equal(stockOf(pid), 13);
  const step = async (status: Parameters<typeof setPurchaseBatchStatus>[1], wh: string, transit: number, line: string) => {
    const r = await setPurchaseBatchStatus(b1.id, status);
    assert.ok(r.ok, `${status}: ${r.message}`);
    const l = lot(S)!;
    assert.equal(`${l.warehouse}/${l.in_transit}`, `${wh}/${transit}`, `after ${status}`);
    assert.equal(lineStatus(o.itemId), line, `order line after ${status}`);
  };
  await step("to_carrier_jp", "jp_carrier", 0, "to_carrier_jp");
  await step("shipped_jp_vn", "jp_carrier", 1, "shipped_jp_vn");
  const r4 = removeLotsFromBatch([S]);
  assert.equal(r4.ok, false, "cannot pull a lot once the shipment flew");
  assert.equal(r4.removed, 0);
  assert.equal(lot(S)!.batch_id, b1.id);
  assert.equal(addLotsToBatch(b1.id, [{ lotId: A.id }]).ok, false, "cannot add to a flown shipment");
  await step("at_carrier_vn", "carrier", 0, "at_carrier_vn");
  assert.ok(!listOrdersReadyToShip(db).some((x) => x.orderId === o.orderId), "at Kho ĐVVC VN the pickup order is not ready yet");
  await step("at_shop", "vn", 0, "at_shop");
  const ready = listOrdersReadyToShip(db).find((x) => x.orderId === o.orderId);
  assert.ok(ready, "at Kho VN (shop) the order is ready to hand over");
  assert.equal(ready!.units, 2);
  assert.deepEqual(ready!.lots, [S]);
  const views = listLotViews(db, { productId: pid, side: "vn" });
  assert.deepEqual(views.map((v) => v.id), [S]);
  assert.equal(views[0].reserved.length, 1);
  assert.ok(views[0].reserved[0].consumed);
  // handed over → the lot no longer shows (nothing unsold, nothing waiting)
  db.prepare("UPDATE orders SET ship_stage = 'delivered' WHERE id = ?").run(o.orderId);
  assert.equal(listLotViews(db, { productId: pid, side: "vn" }).length, 0);

  // E. before NB→VN a lot can leave the shipment and stands at Kho Nhật (shop) again
  const b2 = createPurchaseBatch({ label: "smoke6-2", sourceKey: "", boughtAt: null, note: "" });
  assert.ok(addLotsToBatch(b2.id, [{ lotId: A.id }]).ok);
  assert.ok((await setPurchaseBatchStatus(b2.id, "to_carrier_jp")).ok);
  assert.equal(lot(A.id)!.warehouse, "jp_carrier");
  const r5 = removeLotsFromBatch([A.id]);
  assert.ok(r5.ok && r5.removed === 1, r5.message);
  assert.equal(`${lot(A.id)!.warehouse}/${lot(A.id)!.batch_id}`, "jp/null");

  // F. deleting a gathering shipment releases its lots (nothing lost)
  assert.ok((await setPurchaseBatchStatus(b2.id, "bought")).ok);
  assert.ok(addLotsToBatch(b2.id, [{ lotId: A.id }, { lotId: C.id, qty: 1 }]).ok);
  const before = (db.prepare("SELECT SUM(qty_left) AS u FROM stock_lots WHERE product_id = ?").get(pid) as { u: number }).u;
  const del = await deletePurchaseBatch(b2.id);
  assert.ok(del.ok, del.message);
  const after = (db.prepare("SELECT SUM(qty_left) AS u FROM stock_lots WHERE product_id = ?").get(pid) as { u: number }).u;
  assert.equal(after, before, "units kept");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM stock_lots WHERE product_id = ? AND batch_id = ?").get(pid, b2.id) as { n: number }).n, 0);
  assert.ok((db.prepare("SELECT warehouse FROM stock_lots WHERE product_id = ? AND batch_id IS NULL").all(pid) as Array<{ warehouse: string }>).every((l) => l.warehouse === "jp" || l.warehouse === "vn"));
  assert.equal(stockOf(pid), 13, "stock = units left − open reservations, across every place");

  // G. Kho hàng "Chuyển": part of a lot (2 unsold) goes to ĐVVC Nhật, the rest stays; the batch of the lot is unchanged
  const mv = await moveLotsToStatus([{ lotId: A.id, qty: 2 }], "to_carrier_jp");
  assert.ok(mv.ok && mv.moved === 1, mv.message);
  const part = db.prepare("SELECT id, qty_left, warehouse, batch_id FROM stock_lots WHERE parent_lot_id = ? AND warehouse = 'jp_carrier'").get(A.id) as { id: number; qty_left: number; warehouse: string; batch_id: number | null };
  assert.ok(part, "split part at the carrier");
  assert.equal(part.qty_left, 2);
  assert.equal(part.batch_id, lot(A.id)!.batch_id, "batch (đợt mua) stays");
  assert.equal(lot(A.id)!.qty_left, 3);
  assert.equal(lot(A.id)!.warehouse, "jp");
  assert.ok((await moveLotsToStatus([{ lotId: part.id }], "at_shop")).ok);
  assert.equal(lot(part.id)!.warehouse, "vn");
  assert.equal(stockOf(pid), 13);
  console.log("SMOKE6 OK");
}
main().catch((e) => {
  console.error("SMOKE6 FAILED", e);
  process.exit(1);
});
