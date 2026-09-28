// Order flow 1.86: payment is its own milestone (prepaid early, COD at the end); "Đã gửi hàng" stage; leg ① moves the
// stage; checkout is transfer-only; expired lots never serve automatically. Run on a copy of the local DB.
import assert from "node:assert/strict";
import { allocateOrderSync, candidatesFor } from "../../src/lib/allocations-db";
import { addStockLot, getOrderById, setOrderCod, setOrderCodCollected, setOrderLegStatus, setOrderStage, setOrderTransferReceived } from "../../src/lib/db";
import { orderSteps } from "../../src/lib/shipping";
import { getDb, withTransaction } from "../../src/lib/sqlite";

const db = getDb();
let seq = 0;
function fakeOrder(productId: number): string {
  const src = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown>;
  const oid = `smk11-${Date.now()}-${seq++}`;
  const names = Object.keys(src);
  const vals = names.map((k) => (k === "id" ? oid : k === "number" ? 970000 + seq : k === "status" ? "pending" : k === "pay_code" ? `S11${Date.now()}${seq}` : k === "customer_id" ? null : k === "payment_method" ? "bacs" : k === "stock_committed_at" ? null : k === "paid_at" ? null : k === "ship_stage" ? "ordered" : src[k]));
  db.prepare(`INSERT INTO orders (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(...(vals as never[]));
  db.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, image, quantity, purchase_status, purchase_note) VALUES (?, ?, 'x', 'x', 1, '', 1, 'not_bought', '')").run(oid, productId);
  withTransaction(db, () => allocateOrderSync(db, oid));
  return oid;
}
const keys = (o: Parameters<typeof orderSteps>[0], admin = false) => orderSteps(o, admin).steps.map((s) => s.key).join(">");

async function main() {
  const migrated = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE ship_stage = 'paid'").get() as { n: number };
  assert.equal(migrated.n, 0, "migration 64: no order left on the old 'paid' stage");
  const legacy = process.env.LEGACY_ID;
  if (legacy) {
    const o = (await getOrderById(legacy))!;
    assert.equal(o.shipStage, "ordered", "old 'paid' stage → ordered");
    assert.ok(o.paidAt, "…with paid_at kept");
  }
  const pid = (db.prepare("SELECT id FROM products WHERE status = 'publish' ORDER BY id DESC LIMIT 1").get() as { id: number }).id;
  await addStockLot({ productId: pid, qty: 5, expiry: null, warehouse: "vn", boughtAt: "2026-09-20" });

  // prepaid
  const a = fakeOrder(pid);
  let o = (await getOrderById(a))!;
  assert.equal(keys(o), "ordered>paid>sent>in_transit>vn_warehouse>delivered", "prepaid: payment second");
  assert.equal(keys(o, true), "ordered>paid>sent>in_transit>vn_warehouse>delivering>delivered", "admin sees Đang giao hàng");
  assert.equal(o.stockCommittedAt, null);
  assert.ok((await setOrderTransferReceived(a)).ok);
  o = (await getOrderById(a))!;
  assert.ok(o.paidAt && o.stockCommittedAt, "transfer → paid + stock deducted");
  assert.equal(orderSteps(o).current, 1, "current = Đã thanh toán");
  await setOrderStage(a, "delivered");
  assert.equal((await getOrderById(a))!.status, "completed", "prepaid delivered = completed");

  // COD
  const b = fakeOrder(pid);
  assert.ok((await setOrderCod(b)).ok);
  o = (await getOrderById(b))!;
  assert.equal(o.paymentMethod, "cod");
  assert.ok(o.stockCommittedAt, "COD deducts stock");
  assert.equal(o.paidAt, null);
  assert.equal(keys(o), "ordered>sent>in_transit>vn_warehouse>delivered>paid", "COD: payment last");
  assert.equal(orderSteps(o).steps.at(-1)!.label, "Hoàn tất thanh toán");
  await setOrderStage(b, "delivered");
  assert.equal((await getOrderById(b))!.status, "processing", "COD delivered but not collected stays open");
  assert.ok((await setOrderCodCollected(b)).ok);
  o = (await getOrderById(b))!;
  assert.equal(o.status, "completed");
  assert.equal(orderSteps(o).current, 5, "last step reached");

  // leg ① sent → "Đã gửi hàng", arrived → in transit; a prepaid order sent before payment still deducts stock
  const c = fakeOrder(pid);
  await setOrderLegStatus(c, "jp_domestic", "sent");
  o = (await getOrderById(c))!;
  assert.equal(o.shipStage, "sent");
  assert.ok(o.stockCommittedAt, "goods left → stock deducted");
  await setOrderLegStatus(c, "jp_domestic", "arrived");
  assert.equal((await getOrderById(c))!.shipStage, "in_transit");

  // expired lot is not an automatic candidate
  const exp = await addStockLot({ productId: pid, qty: 3, expiry: "2020-01-31", warehouse: "vn", boughtAt: "2019-01-01" });
  assert.ok(!candidatesFor(db, pid).some((x) => x.type === "lot" && x.id === exp.id), "expired lot skipped");
  console.log("SMOKE11 OK");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
