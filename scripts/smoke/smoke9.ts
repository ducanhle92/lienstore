// Purchasing reset + quick bill import + earlier-bought-first allocation (copy of the local DB).
import assert from "node:assert/strict";
import { allocateOrderSync, listAllocationViews } from "../../src/lib/allocations-db";
import { addStockLot, deleteStockLot, listStockLots } from "../../src/lib/db";
import { createPurchaseBatch, importBillsFromText, resetPurchasingData } from "../../src/lib/purchase-batches-db";
import { getDb, withTransaction } from "../../src/lib/sqlite";

const db = getDb();
let seq = 0;
function fakeOrder(productId: number, qty: number): { orderId: string; itemId: number } {
  const src = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown>;
  const oid = `smk9-${Date.now()}-${seq++}`;
  const names = Object.keys(src);
  const vals = names.map((k) => (k === "id" ? oid : k === "number" ? 950000 + seq : k === "status" ? "pending" : k === "pay_code" ? `S9${Date.now()}${seq}` : k === "customer_id" ? null : k === "payment_method" ? "bacs" : k === "stock_committed_at" ? null : k === "paid_at" ? null : k === "ship_stage" ? "ordered" : src[k]));
  db.prepare(`INSERT INTO orders (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(...(vals as never[]));
  db.prepare("INSERT INTO order_stage_log (order_id, stage, note, created_at) VALUES (?, 'ordered', '', ?)").run(oid, new Date().toISOString());
  const r = db.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, image, quantity, purchase_status, purchase_note) VALUES (?, ?, 'x', 'x', 1, '', ?, 'not_bought', '')").run(oid, productId, qty);
  withTransaction(db, () => allocateOrderSync(db, oid));
  return { orderId: oid, itemId: Number(r.lastInsertRowid) };
}

async function main() {
  // A. earlier-bought lot serves the order first when expiry ties
  const pid = (db.prepare("SELECT p.id FROM products p WHERE p.status = 'publish' AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status IN ('pending','processing')) ORDER BY p.id DESC LIMIT 1").get() as { id: number }).id;
  for (const l of await listStockLots(pid, true)) await deleteStockLot(l.id);
  const late = await addStockLot({ productId: pid, qty: 3, expiry: null, warehouse: "jp", boughtAt: "2026-09-27" });
  const early = await addStockLot({ productId: pid, qty: 3, expiry: null, warehouse: "jp", boughtAt: "2026-09-26" });
  const o = fakeOrder(pid, 1);
  const v = listAllocationViews(db, [o.itemId]);
  assert.equal(v[0].sourceId, early.id, "the bill bought first serves the order");
  void late;

  // B. quick bill import into a batch: source headers, custom codes, totals, dates from the code, duplicates skipped
  const b = createPurchaseBatch({ label: "smoke9", sourceKey: "amazon", boughtAt: "2026-09-27", note: "" });
  const text = [
    "Mã bill\tCửa hàng\tNội dung\tTổng",
    "@ OS Drug Store",
    "BILL-260926-1730\t船橋店\tパブロンゴールドA錠\t¥1,518 tiền mặt",
    "| BILL-260927-1344 | 船橋店 | bill lớn 87 món | ¥63,800 PayPay |",
    "@ Kusurino Fukutaro (5 bill)",
    "BILL-260926-1733 | 東葛西店 | パブロンゴールドA錠 | ¥1,537",
    "BILL-260926-1733 | dup | dup | ¥1",
  ].join("\n");
  const r = await importBillsFromText(b.id, text);
  assert.equal(r.created, 3, JSON.stringify(r));
  assert.equal(r.skipped.length, 1, "duplicate code skipped");
  assert.ok(r.sources.includes("Kusurino Fukutaro"), "unknown store created as a source");
  const bills = db.prepare("SELECT code, bought_at, total_jpy, source_key, order_ref, note FROM purchase_receipts WHERE batch_id = ? ORDER BY code").all(b.id) as Array<{ code: string; bought_at: string; total_jpy: number | null; source_key: string; order_ref: string; note: string }>;
  const big = bills.find((x) => x.code === "BILL-260927-1344")!;
  assert.equal(big.bought_at, "2026-09-27");
  assert.equal(big.total_jpy, 63800);
  assert.equal(big.source_key, "os-drug-store");
  assert.equal(big.order_ref, "船橋店");
  assert.match(big.note, /bill lớn 87 món · PayPay/);
  const kf = bills.find((x) => x.code === "BILL-260926-1733")!;
  assert.equal(kf.bought_at, "2026-09-26");
  assert.equal(kf.total_jpy, 1537);
  assert.notEqual(kf.source_key, "os-drug-store");

  // C. reset wipes everything and puts open lines back to "Cần mua"; lot-only products go back to "hàng order"
  assert.ok((db.prepare("SELECT COUNT(*) AS n FROM stock_lots").get() as { n: number }).n > 0);
  const res = resetPurchasingData();
  assert.ok(res.receipts >= 3 && res.lots >= 2 && res.batches >= 1, JSON.stringify(res));
  for (const t of ["stock_lots", "stock_purchases", "purchase_receipts", "purchase_receipt_items", "purchase_batches", "shipments"]) assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n, 0, t);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM order_item_allocations WHERE source_type <> 'buy'").get() as { n: number }).n, 0);
  const line = db.prepare("SELECT purchase_status, batch_id, receipt_id FROM order_items WHERE id = ?").get(o.itemId) as { purchase_status: string; batch_id: number | null; receipt_id: number | null };
  assert.equal(line.purchase_status, "not_bought");
  assert.equal(line.batch_id, null);
  assert.equal((db.prepare("SELECT stock FROM products WHERE id = ?").get(pid) as { stock: number | null }).stock, null, "back to hàng order");
  assert.equal(listAllocationViews(db, [o.itemId])[0].sourceType, "buy");
  console.log("SMOKE9 OK");
}
main().catch((e) => {
  console.error("SMOKE9 FAILED", e);
  process.exit(1);
});
