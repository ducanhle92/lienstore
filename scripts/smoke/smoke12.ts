// Từng cái (1.87): migration totals, automatic serving (place → expiry → bill date, oldest order first), cancel,
// packing run moving units + order stage / legs following, manual stage moving units, stocktake, typed stock.
// Run on a copy of a DB (LIEN_DB_PATH); prints a report and asserts the invariants.
import assert from "node:assert/strict";
import { getOrderById, setOrderCod, setOrderLegStatus, setOrderStage, updateOrderStatus, updateProductStock } from "../../src/lib/db";
import { listAllocationViews } from "../../src/lib/allocations-db";
import { createShipment, packProduct, setShipmentStatus } from "../../src/lib/shipments-db";
import { getDb, withTransaction } from "../../src/lib/sqlite";
import { parseUnitCode, unitCode } from "../../src/lib/units";
import { adjustUnitsToTotalSync, createUnitsSync, listUnits, resyncAllUnitsSync, touchSync } from "../../src/lib/units-db";

const db = getDb();
let seq = 0;
function fakeOrder(productId: number, qty: number): { orderId: string; itemId: number } {
  const src = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown>;
  const oid = `smk12-${Date.now()}-${seq++}`;
  const names = Object.keys(src);
  const vals = names.map((k) => (k === "id" ? oid : k === "number" ? 990000 + seq : k === "status" ? "pending" : k === "pay_code" ? `S12${Date.now()}${seq}` : k === "customer_id" ? null : k === "payment_method" ? "bacs" : k === "stock_committed_at" ? null : k === "paid_at" ? null : k === "ship_stage" ? "ordered" : k === "created_at" ? new Date(Date.now() + seq * 1000).toISOString() : src[k]));
  db.prepare(`INSERT INTO orders (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(...(vals as never[]));
  const r = db.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, image, quantity, purchase_status, purchase_note) VALUES (?, ?, 'x', 'x', 1, '', ?, 'not_bought', '')").run(oid, productId, qty);
  withTransaction(db, () => touchSync(db, { orderIds: [oid] }));
  return { orderId: oid, itemId: Number(r.lastInsertRowid) };
}
const make = (productId: number, qty: number, status: Parameters<typeof createUnitsSync>[1]["status"], extra: Partial<Parameters<typeof createUnitsSync>[1]> = {}) => withTransaction(db, () => {
  const ids = createUnitsSync(db, { productId, qty, status, ...extra });
  touchSync(db, { unitIds: ids });
  return ids;
});
const held = (itemId: number) => listUnits(db, { itemIds: [itemId], withDelivered: true });

async function main() {
  // --- codes
  const code = unitCode(4567);
  assert.match(code, /^H004567\d$/);
  assert.equal(parseUnitCode(` ${code.toLowerCase()} `), code, "typed lower case / spaces still read");
  assert.equal(parseUnitCode(code.slice(0, -1) + String((Number(code.slice(-1)) + 1) % 10)), null, "wrong check digit rejected");
  assert.equal(parseUnitCode("H0045767" === code ? "H0045677" : `H00${"4576"}7`), null, "swapped digits rejected");

  // --- migration report (legacy data of the copied DB)
  const legacyLots = (db.prepare("SELECT COALESCE(SUM(qty_left), 0) AS n FROM stock_lots").get() as { n: number }).n;
  const units = db.prepare("SELECT COUNT(*) AS n, SUM(origin = 'legacy' OR origin = 'bill') AS lots, SUM(order_item_id IS NULL AND status IN ('bought','to_carrier_jp','shipped_jp_vn','at_carrier_vn','to_shop','at_shop')) AS free FROM stock_units").get() as { n: number; lots: number; free: number };
  console.log(`migration: legacy lots qty_left=${legacyLots} → units=${units.n} (free in hand ${units.free})`);
  const freeInHandBefore = Number(units.free);

  const pid = (db.prepare("SELECT p.id FROM products p WHERE p.status = 'publish' AND NOT EXISTS (SELECT 1 FROM stock_units u WHERE u.product_id = p.id) AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status IN ('pending','processing')) ORDER BY p.id DESC LIMIT 1").get() as { id: number }).id;

  // --- A. place before expiry: JP unit with near expiry vs VN unit with far expiry → VN serves
  const jp = make(pid, 1, "bought", { expiry: "2027-01-31", boughtAt: "2026-09-20" });
  const vn = make(pid, 1, "at_shop", { expiry: "2028-12-31", boughtAt: "2026-09-25" });
  const a = fakeOrder(pid, 1);
  assert.deepEqual(held(a.itemId).map((u) => u.id), vn, "VN unit serves first (place before expiry)");
  // same place → nearer expiry, then earlier bill date
  const vn2 = make(pid, 1, "at_shop", { expiry: "2027-06-30", boughtAt: "2026-09-26" });
  const b = fakeOrder(pid, 1);
  // oldest order first: a now takes the nearer-expiry VN unit, b the other one
  assert.deepEqual(held(a.itemId).map((u) => u.id), vn2, "oldest order takes the best unit (FEFO within Kho VN)");
  assert.deepEqual(held(b.itemId).map((u) => u.id), vn, "next order the next best");
  const stockAfter = (db.prepare("SELECT stock FROM products WHERE id = ?").get(pid) as { stock: number }).stock;
  assert.equal(stockAfter, 1, "stock = free units in hand (the JP one)");

  // --- B. cancel → units back, the waiting order is served at once
  const c = fakeOrder(pid, 2); // takes JP unit, 1 short
  assert.equal(held(c.itemId).length, 1);
  assert.equal(listAllocationViews(db, [c.itemId]).find((x) => x.sourceType === "buy")?.qty, 1, "1 still Cần mua");
  await updateOrderStatus(a.orderId, "cancelled");
  assert.equal(held(a.itemId).length, 0, "cancelled order holds nothing");
  assert.equal(held(c.itemId).length, 2, "the waiting order took the freed unit automatically");

  // --- C. paid order keeps its units; packing run moves them and the order follows
  await setOrderCod(b.orderId);
  const pid2 = (db.prepare("SELECT p.id FROM products p WHERE p.status = 'publish' AND p.id <> ? AND NOT EXISTS (SELECT 1 FROM stock_units u WHERE u.product_id = p.id) ORDER BY p.id DESC LIMIT 1").get(pid) as { id: number }).id;
  make(pid2, 3, "bought", { boughtAt: "2026-09-20" });
  const d = fakeOrder(pid2, 2);
  await setOrderCod(d.orderId);
  const sh = createShipment({ label: "smoke12", plannedAt: null, note: "" });
  const pk = packProduct(sh.id, pid2, 2);
  assert.equal(pk.units, 2, "packed the order's two units first");
  assert.ok(held(d.itemId).every((u) => u.shipmentId === sh.id), "the packed units are the customer's");
  await setShipmentStatus(sh.id, "packed");
  let o = (await getOrderById(d.orderId))!;
  assert.equal(o.shipStage, "sent", "boxed + packed → Đã gửi hàng");
  await setShipmentStatus(sh.id, "flying");
  o = (await getOrderById(d.orderId))!;
  assert.equal(o.shipStage, "in_transit", "flying → Đang vận chuyển về kho shop VN");
  assert.equal(held(d.itemId)[0].status, "shipped_jp_vn");
  const legs = db.prepare("SELECT leg, status FROM order_legs WHERE order_id = ?").all(d.orderId) as Array<{ leg: string; status: string }>;
  assert.equal(legs.find((l) => l.leg === "jp_domestic")?.status, "arrived", "leg ① followed");
  assert.equal(legs.find((l) => l.leg === "jp_vn")?.status, "sent", "leg ② followed");
  await setShipmentStatus(sh.id, "done");
  o = (await getOrderById(d.orderId))!;
  assert.equal(o.shipStage, "vn_warehouse", "run at the shop → Đã về kho VN");

  // --- D. manual leg / stage on the order moves its units (no flip-flop)
  await setOrderLegStatus(d.orderId, "vn_domestic", "sent");
  assert.equal(held(d.itemId)[0].status, "shipped_to_customer", "leg ④ sent moved the units");
  touchSync(db, { orderIds: [d.orderId] });
  assert.equal(held(d.itemId)[0].status, "shipped_to_customer", "a re-derivation does not lower it");
  await setOrderStage(c.orderId, "vn_warehouse");
  assert.ok(held(c.itemId).every((u) => u.status === "at_shop"), "manual stage moved the order's units to Kho VN");

  // --- E. stocktake: free units of pid2 at Kho VN become 3 → +3 on the KK bill; then 1 → 2 written off
  withTransaction(db, () => {
    adjustUnitsToTotalSync(db, pid2, 3, { warehouse: "vn" });
    touchSync(db, { productIds: [pid2] });
  });
  const kk = listUnits(db, { productId: pid2, free: true, statuses: ["at_shop"] });
  assert.equal(kk.length, 3);
  assert.ok(kk.every((u) => u.receiptCode.startsWith("KK-") && u.origin === "count"), "extras live on the KK bill");
  withTransaction(db, () => {
    adjustUnitsToTotalSync(db, pid2, 1, { warehouse: "vn" });
    touchSync(db, { productIds: [pid2] });
  });
  assert.equal(listUnits(db, { productId: pid2, free: true, statuses: ["at_shop"] }).length, 1);
  assert.equal(listUnits(db, { productId: pid2, onlyRemoved: true }).length, 2, "two written off as thất lạc");

  // --- F. typed stock on the product page
  await updateProductStock(pid2, 5);
  assert.equal((db.prepare("SELECT stock FROM products WHERE id = ?").get(pid2) as { stock: number }).stock, 5);

  // --- G. invariant (after the startup re-derivation): stock of every tracked product = its free units in hand
  withTransaction(db, () => resyncAllUnitsSync(db));
  const bad = db.prepare(`SELECT p.id, p.stock, (SELECT COUNT(*) FROM stock_units u WHERE u.product_id = p.id AND u.order_item_id IS NULL AND u.removed IS NULL AND u.status IN ('bought','to_carrier_jp','shipped_jp_vn','at_carrier_vn','to_shop','at_shop')) AS n
    FROM products p WHERE EXISTS (SELECT 1 FROM stock_units u WHERE u.product_id = p.id AND (u.status NOT IN ('not_bought','ordered') OR u.removed IS NOT NULL)) AND COALESCE(p.stock, -1) <> n`).all() as Array<{ id: number; stock: number; n: number }>;
  assert.deepEqual(bad, [], "products.stock matches the units");
  void freeInHandBefore;
  console.log("SMOKE12 OK");
}
main().catch((e) => {
  console.error("SMOKE12 FAILED", e);
  process.exit(1);
});
