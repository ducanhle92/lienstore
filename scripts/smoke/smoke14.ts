// ⑦ Giao hàng VN (1.94): a COD home-delivery order whose goods are at Kho VN is "chờ giao"; leg ④ sent → đang giao
// (units leave the shop), arrived → đã giao; collecting the money completes it. Run on a copy of a DB (LIEN_DB_PATH).
// With KEEP=1 it only prepares such an order (for a browser check) and prints its id.
import assert from "node:assert/strict";
import { getOrderById, setOrderCod, setOrderCodCollected, setOrderLegStatus, updateOrderCustomer, updateOrderShipping } from "../../src/lib/db";
import { listOrdersReadyToShip } from "../../src/lib/lots-db";
import { getDb, withTransaction } from "../../src/lib/sqlite";
import { createUnitsSync, listUnits, touchSync } from "../../src/lib/units-db";

const db = getDb();

async function main() {
  const pid = (db.prepare("SELECT p.id FROM products p WHERE p.status = 'publish' AND NOT EXISTS (SELECT 1 FROM stock_units u WHERE u.product_id = p.id) ORDER BY p.id DESC LIMIT 1").get() as { id: number }).id;
  withTransaction(db, () => {
    const ids = createUnitsSync(db, { productId: pid, qty: 2, status: "at_shop", boughtAt: "2026-09-27" });
    touchSync(db, { unitIds: ids });
  });
  const src = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown>;
  const oid = `smk14-${Date.now()}`;
  const names = Object.keys(src);
  const vals = names.map((k) => (k === "id" ? oid : k === "number" ? 970001 : k === "status" ? "pending" : k === "pay_code" ? `S14${Date.now()}` : k === "customer_id" ? null : k === "payment_method" ? "bacs" : k === "stock_committed_at" ? null : k === "paid_at" ? null : k === "ship_stage" ? "ordered" : k === "delivery" ? "ship" : k === "shipping_label" ? "GHN · Giao tận nhà" : k === "created_at" ? new Date().toISOString() : src[k]));
  db.prepare(`INSERT INTO orders (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(...(vals as never[]));
  const item = Number(db.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, image, quantity, purchase_status, purchase_note) VALUES (?, ?, 'x', 'x', 1, '', 2, 'not_bought', '')").run(oid, pid).lastInsertRowid);
  withTransaction(db, () => touchSync(db, { orderIds: [oid] }));
  assert.ok(!listOrdersReadyToShip(db).some((o) => o.orderId === oid), "unpaid: not yet chờ giao");
  await setOrderCod(oid);
  assert.ok(listOrdersReadyToShip(db).some((o) => o.orderId === oid), "COD with every unit at Kho VN: chờ giao");
  if (process.env.KEEP === "1") {
    console.log("KEEP", oid);
    return;
  }
  await setOrderLegStatus(oid, "vn_domestic", "sent", { tracking: "GHN-777", note: "Giao buổi chiều" });
  let o = (await getOrderById(oid))!;
  assert.equal(o.shipStage, "delivering", "sent → Đang giao hàng");
  assert.ok(listUnits(db, { itemIds: [item], withDelivered: true }).every((u) => u.status === "shipped_to_customer"), "the units left the shop");
  assert.ok(!listOrdersReadyToShip(db).some((x) => x.orderId === oid), "no longer chờ giao");
  await setOrderLegStatus(oid, "vn_domestic", "arrived");
  o = (await getOrderById(oid))!;
  assert.equal(o.shipStage, "delivered", "arrived → Đã giao hàng thành công");
  assert.notEqual(o.status, "completed", "COD not collected yet → not completed");
  const r = await setOrderCodCollected(oid);
  assert.ok(r.ok, r.message);
  o = (await getOrderById(oid))!;
  assert.equal(o.status, "completed", "money collected → Hoàn thành");

  // --- fee paid to the shipper: out of Tổng until the admin applies it on purpose; then the shop collects it (no double charge)
  const sub = Number((db.prepare("SELECT subtotal FROM orders WHERE id = ?").get(oid) as { subtotal: number }).subtotal);
  db.prepare("UPDATE orders SET ship_fee_payment = 'on_delivery', shipping_fee = 35000, discount = 0, total = ? WHERE id = ?").run(sub, oid);
  await updateOrderShipping(oid, { fee: 40000, label: "GHN · Tiêu chuẩn", delivery: "ship", prevVnFee: 35000 });
  o = (await getOrderById(oid))!;
  assert.equal(o.shipFeePayment, "prepaid", "applied → the shop collects the fee");
  assert.equal(o.total, sub + 40000, "Tổng = hàng + phí vừa áp");
  // per-order mode: the Japan legs already in the fee stay when leg ④ changes
  db.prepare("UPDATE orders SET shipping_fee = 100000, total = ? WHERE id = ?").run(sub + 100000, oid);
  await updateOrderShipping(oid, { fee: 30000, label: "GHN", delivery: "ship", prevVnFee: 40000 });
  o = (await getOrderById(oid))!;
  assert.equal(o.shippingFee, 90000, "Japan part (60.000) kept, VN part replaced");
  assert.equal(o.total, sub + 90000);
  // customer block edit
  assert.ok(await updateOrderCustomer(oid, { name: "Nguyễn Văn Mới", phone: "0912 345 678", email: "moi@example.com", address: "Số 1, Hà Nội", note: "giao giờ hành chính" }));
  o = (await getOrderById(oid))!;
  assert.equal(`${o.customer.lastName} ${o.customer.firstName}`.trim(), "Nguyễn Văn Mới");
  assert.equal(o.customer.phone, "0912 345 678");
  assert.equal(o.customer.address, "Số 1, Hà Nội");
  console.log("SMOKE14 OK");
}
main().catch((e) => {
  console.error("SMOKE14 FAILED", e);
  process.exit(1);
});
