// Migration 61 on realistic data (copy of the local DB rolled back to schema 60): slips from "Đã mua" on become lots at the
// place their status means, keep source / ¥ / HSD / note / batch, allocations follow, and order lines read
// "Kho Nhật · chuyến DG-…". Then the one-off resync recomputes products.stock.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

const path = process.env.LIEN_DB_PATH!;
const T = new Date().toISOString();

// ---- roll the copy back to schema 60 and seed slips the way prod looks (batch gathering at Kho Nhật + one held slip) ----
const raw = new DatabaseSync(path);
raw.exec("PRAGMA journal_mode = WAL");
raw.exec("DELETE FROM schema_migrations WHERE version = 61");
raw.exec("DELETE FROM stock_lots"); // the copy has nothing real here
raw.exec("DROP INDEX IF EXISTS idx_stock_lots_batch");
for (const c of ["in_transit", "batch_id", "parent_lot_id"]) raw.exec(`ALTER TABLE stock_lots DROP COLUMN ${c}`);
raw.exec("DELETE FROM stock_purchases; DELETE FROM purchase_batches; DELETE FROM order_item_allocations");
const products = (raw.prepare("SELECT id, cost_jpy, cost_price FROM products WHERE status = 'publish' ORDER BY id DESC LIMIT 6").all() as Array<{ id: number; cost_jpy: number | null; cost_price: number | null }>);
const [P1, P2, P3, P4, P5, P6] = products.map((p) => p.id);
const batch = (code: string, status: string) => Number(raw.prepare("INSERT INTO purchase_batches (code, label, status, source_key, created_at, updated_at) VALUES (?, '', ?, 'unknown', ?, ?)").run(code, status, T, T).lastInsertRowid);
const bGather = batch("DG-TEST-01", "bought");
const bCarrierJp = batch("DG-TEST-02", "to_carrier_jp");
const bFlying = batch("DG-TEST-03", "shipped_jp_vn");
const bCarrierVn = batch("DG-TEST-04", "at_carrier_vn");
const bToShop = batch("DG-TEST-05", "to_shop");
const slip = (pid: number, qty: number, status: string, batchId: number | null, extra: { jpy?: number | null; expiry?: string | null; note?: string; source?: string } = {}) =>
  Number(raw.prepare("INSERT INTO stock_purchases (product_id, qty, source_key, unit_cost_jpy, status, expiry, location, note, lot_id, created_at, updated_at, warehouse, batch_id, bought_at) VALUES (?, ?, ?, ?, ?, ?, '', ?, NULL, ?, ?, 'vn', ?, '2026-09-27')").run(pid, qty, extra.source ?? "amazon", extra.jpy ?? null, status, extra.expiry ?? null, extra.note ?? "", T, T, batchId).lastInsertRowid);
const s1 = slip(P1, 100, "bought", bGather, { jpy: 1200, expiry: "2027-03-31", note: "Đợt DG-TEST-01 · Don Quijote" });
const s2 = slip(P2, 36, "bought", bGather, { jpy: 800, source: "don-quijote-shibuya" });
const s3 = slip(P3, 1, "bought", null, { note: "giữ lại Nhật" }); // the "#50 Skin Vape" case
const s4 = slip(P4, 4, "to_carrier_jp", bCarrierJp);
const s5 = slip(P5, 5, "shipped_jp_vn", bFlying);
const s6 = slip(P6, 6, "at_carrier_vn", bCarrierVn);
const s7 = slip(P1, 7, "to_shop", bToShop);
const s8 = slip(P2, 2, "not_bought", bGather); // still a slip after migration
const s9 = slip(P3, 9, "at_shop", null, { note: "already a lot before" });
// a lot the old way for s9 (at_shop already created lots)
const lot9 = Number(raw.prepare("INSERT INTO stock_lots (product_id, qty_in, qty_left, received_at, source_key, expiry, location, note, purchase_id, created_at, updated_at, warehouse) VALUES (?, 9, 9, '2026-09-20', 'amazon', NULL, '', '', ?, ?, ?, 'vn')").run(P3, s9, T, T).lastInsertRowid);
raw.prepare("UPDATE stock_purchases SET lot_id = ? WHERE id = ?").run(lot9, s9);
// open orders whose lines were served from the gathering batch's slips (the #1010/#1011/#1012 case)
const order = (n: number) => {
  const src = raw.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown>;
  const oid = `smk7-${n}`;
  const names = Object.keys(src);
  const vals = names.map((k) => (k === "id" ? oid : k === "number" ? n : k === "status" ? "processing" : k === "pay_code" ? `S7${n}` : k === "customer_id" ? null : k === "payment_method" ? "bacs" : k === "stock_committed_at" ? T : k === "ship_stage" ? "paid" : src[k]));
  raw.prepare(`INSERT INTO orders (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(...(vals as never[]));
  return oid;
};
const item = (oid: string, pid: number, qty: number, spId: number, batchId: number) => {
  const r = raw.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, image, quantity, purchase_status, purchase_note, batch_id) VALUES (?, ?, 'x', 'x', 1, '', ?, 'bought', '', ?)").run(oid, pid, qty, batchId);
  raw.prepare("INSERT INTO order_item_allocations (order_item_id, source_type, source_id, qty, manual, consumed_at, created_at, updated_at) VALUES (?, 'stock_purchase', ?, ?, 0, NULL, ?, ?)").run(r.lastInsertRowid, spId, qty, T, T);
  return Number(r.lastInsertRowid);
};
const o1 = order(961010);
const i1 = item(o1, P1, 2, s1, bGather);
const i2 = item(o1, P2, 1, s2, bGather);
const o2 = order(961011);
const i3 = item(o2, P1, 3, s1, bGather);
raw.prepare("UPDATE products SET stock = 0 WHERE id IN (?, ?, ?, ?, ?, ?)").run(P1, P2, P3, P4, P5, P6);
raw.close();

async function main() {
  const { getDb } = await import("../../src/lib/sqlite");
  const { listAllocationViews, resyncStockAfterLotsOnce } = await import("../../src/lib/allocations-db");
  const { listLotViews } = await import("../../src/lib/lots-db");
  const db = getDb(); // runs migration 61
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 61").get() as { n: number }).n, 1);

  type L = { id: number; product_id: number; qty_left: number; warehouse: string; in_transit: number; batch_id: number | null; purchase_id: number; source_key: string; unit_cost_jpy: number | null; unit_cost_vnd: number | null; expiry: string | null; note: string; received_at: string; bought_at: string | null };
  const lotOf = (sp: number) => db.prepare("SELECT * FROM stock_lots WHERE purchase_id = ?").get(sp) as L | undefined;
  const expect: Array<[number, string, number, number | null]> = [
    [s1, "jp", 0, bGather],
    [s2, "jp", 0, bGather],
    [s3, "jp", 0, null],
    [s4, "jp_carrier", 0, bCarrierJp],
    [s5, "jp_carrier", 1, bFlying],
    [s6, "carrier", 0, bCarrierVn],
    [s7, "carrier", 1, bToShop],
  ];
  for (const [sp, wh, tr, b] of expect) {
    const l = lotOf(sp);
    assert.ok(l, `slip ${sp} became a lot`);
    assert.equal(`${l.warehouse}/${l.in_transit}/${l.batch_id}`, `${wh}/${tr}/${b}`, `slip ${sp} place`);
    assert.equal((db.prepare("SELECT lot_id FROM stock_purchases WHERE id = ?").get(sp) as { lot_id: number }).lot_id, l.id, "slip points at its lot");
  }
  assert.equal(lotOf(s8), undefined, "Chưa mua stays a slip");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM stock_lots WHERE purchase_id = ?").get(s9) as { n: number }).n, 1, "existing lot not duplicated");
  const l1 = lotOf(s1)!;
  assert.equal(l1.qty_left, 100);
  assert.equal(l1.unit_cost_jpy, 1200);
  assert.equal(l1.expiry, "2027-03-31");
  assert.equal(l1.note, "Đợt DG-TEST-01 · Don Quijote");
  assert.equal(l1.received_at, "2026-09-27", "received = bought date");
  assert.equal(l1.bought_at, "2026-09-27");
  assert.equal(lotOf(s2)!.source_key, "don-quijote-shibuya");
  const p1 = products.find((p) => p.id === P1)!;
  if (p1.cost_jpy === 1200) assert.equal(l1.unit_cost_vnd, p1.cost_price);
  else assert.equal(l1.unit_cost_vnd, null, "¥ differs from the catalogue → cost VND unknown");

  // post-migration check as in the spec: Kho Nhật (shop) = 137 units (136 in the gathering batch + 1 held), others per status
  const units = (wh: string, tr: number) => (db.prepare("SELECT COALESCE(SUM(qty_left),0) AS u FROM stock_lots WHERE warehouse = ? AND in_transit = ?").get(wh, tr) as { u: number }).u;
  assert.equal(units("jp", 0), 137);
  assert.equal(units("jp_carrier", 0), 4);
  assert.equal(units("jp_carrier", 1), 5);
  assert.equal(units("carrier", 0), 6);
  assert.equal(units("carrier", 1), 7);
  assert.equal(units("vn", 0), 9);

  // allocations moved from slips to lots; order lines read "Kho Nhật · đợt DG-TEST-01"
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM order_item_allocations WHERE source_type = 'stock_purchase'").get() as { n: number }).n, 0);
  const views = listAllocationViews(db, [i1, i2, i3]);
  assert.equal(views.length, 3);
  for (const v of views) {
    assert.equal(v.sourceType, "lot");
    assert.match(v.label, /Kho Nhật/);
    assert.match(v.detail, /đợt DG-TEST-01/);
  }
  assert.equal(views.find((v) => v.orderItemId === i1)!.sourceId, l1.id);
  assert.equal(views.find((v) => v.orderItemId === i2)!.sourceId, lotOf(s2)!.id);
  const jpLots = listLotViews(db, { side: "jp" });
  const v1 = jpLots.find((l) => l.id === l1.id)!;
  assert.equal(v1.reservedQty, 5, "two orders hold 2+3 units of the 100");
  assert.equal(v1.free, 95);
  assert.deepEqual(v1.reserved.map((r) => r.orderNumber).sort(), [961010, 961011]);
  assert.ok(v1.reserved.every((r) => r.committed && !r.consumed), "paid orders: reserved, deducted only when the lot is at Kho VN");

  // one-off resync: products.stock now counts the Japan lots minus open reservations
  const n = await resyncStockAfterLotsOnce();
  assert.ok(n >= 6, `resynced ${n}`);
  const stock = (pid: number) => (db.prepare("SELECT stock FROM products WHERE id = ?").get(pid) as { stock: number }).stock;
  assert.equal(stock(P1), 100 + 7 - 5, "P1: lot 100 (jp) + lot 7 (carrier, in transit) − 5 reserved");
  assert.equal(stock(P2), 36 - 1);
  assert.equal(stock(P3), 1 + 9);
  assert.equal(stock(P4), 4);
  assert.equal(await resyncStockAfterLotsOnce(), 0, "runs once");
  console.log("SMOKE7 OK");
}
main().catch((e) => {
  console.error("SMOKE7 FAILED", e);
  process.exit(1);
});
