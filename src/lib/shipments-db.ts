import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { heldAllocationsSync, mergeLotBackSync, setLotLocationSync, splitLotSync } from "./db";
import { listLotViews, type LotView } from "./lots-db";
import { isShipmentStatus, shipmentCode, shipmentEditable, shipmentIndex, shipmentStage, type ShipmentStatus } from "./shipments";
import { getDb, withTransaction } from "./sqlite";
import { syncProductStock } from "./stock-sync";

/**
 * Đóng hàng (DB side): a shipment owns lots (or parts split off them) through `stock_lots.shipment_id`. While the run
 * is "packing" / "packed" the lots stay at Kho Nhật (shop) but are boxed: Tồn kho lists them apart and "Đóng vào chuyến"
 * can still change its mind. From "handed" on, every status change moves the lots to the matching place.
 */

export interface Shipment {
  id: number;
  code: string;
  label: string;
  status: ShipmentStatus;
  plannedAt: string | null;
  shippedAt: string | null;
  tracking: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  lots: LotView[];
  units: number;
  /** Units already paid for by customers (travel with the lots). */
  heldUnits: number;
  jpy: number | null;
}

interface Row {
  id: number;
  code: string;
  label: string;
  status: string;
  planned_at: string | null;
  shipped_at: string | null;
  tracking: string;
  note: string;
  created_at: string;
  updated_at: string;
}

const statusOf = (v: string): ShipmentStatus => (isShipmentStatus(v) ? v : "packing");

function hydrate(rows: Row[]): Shipment[] {
  if (!rows.length) return [];
  const db = getDb();
  const ids = new Set(rows.map((r) => r.id));
  const lots = listLotViews(db, { includeEmpty: true }).filter((l) => l.shipmentId !== null && ids.has(l.shipmentId) && (l.qtyLeft > 0 || l.heldQty > 0));
  return rows.map((r) => {
    const mine = lots.filter((l) => l.shipmentId === r.id);
    let jpy: number | null = null;
    for (const l of mine) if (l.unitCostJpy !== null) jpy = (jpy ?? 0) + l.unitCostJpy * l.physical;
    return {
      id: r.id,
      code: r.code,
      label: r.label ?? "",
      status: statusOf(r.status),
      plannedAt: r.planned_at,
      shippedAt: r.shipped_at,
      tracking: r.tracking ?? "",
      note: r.note ?? "",
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lots: mine,
      units: mine.reduce((n, l) => n + l.physical, 0),
      heldUnits: mine.reduce((n, l) => n + l.heldQty, 0),
      jpy,
    };
  });
}

export function listShipments(includeDone = false, limit = 60): Shipment[] {
  const rows = getDb()
    .prepare(`SELECT * FROM shipments ${includeDone ? "" : "WHERE status <> 'done'"} ORDER BY CASE status WHEN 'done' THEN 1 ELSE 0 END, id DESC LIMIT ?`)
    .all(limit) as unknown as Row[];
  return hydrate(rows);
}
export function getShipment(id: number): Shipment | null {
  const r = getDb().prepare("SELECT * FROM shipments WHERE id = ?").get(id) as Row | undefined;
  return r ? hydrate([r])[0] : null;
}
/** Open runs a lot can still be packed into. */
export function listOpenShipments(): Array<{ id: number; code: string; label: string; status: ShipmentStatus }> {
  return (getDb().prepare("SELECT id, code, label, status FROM shipments WHERE status IN ('packing','packed') ORDER BY id DESC").all() as Array<{ id: number; code: string; label: string; status: string }>).map((r) => ({ ...r, status: statusOf(r.status) }));
}

function nextCode(db: DatabaseSync, date: string): string {
  const prefix = shipmentCode(date, 1).slice(0, -3);
  const n = (db.prepare("SELECT COUNT(*) AS n FROM shipments WHERE code LIKE ?").get(`${prefix}-%`) as { n: number }).n;
  let seq = Number(n) + 1;
  while (db.prepare("SELECT 1 FROM shipments WHERE code = ?").get(shipmentCode(date, seq))) seq++;
  return shipmentCode(date, seq);
}

export function createShipment(input: { label: string; plannedAt: string | null; note: string }): Shipment {
  const db = getDb();
  const now = new Date().toISOString();
  const id = withTransaction(db, () => {
    const code = nextCode(db, now.slice(0, 10));
    const r = db.prepare("INSERT INTO shipments (code, label, status, planned_at, shipped_at, tracking, note, created_at, updated_at) VALUES (?, ?, 'packing', ?, NULL, '', ?, ?, ?)").run(code, input.label.slice(0, 80), input.plannedAt, input.note.slice(0, 300), now, now);
    return Number(r.lastInsertRowid);
  });
  return getShipment(id)!;
}

export function updateShipment(id: number, patch: { label?: string; plannedAt?: string | null; shippedAt?: string | null; tracking?: string; note?: string }): boolean {
  const db = getDb();
  const cur = db.prepare("SELECT * FROM shipments WHERE id = ?").get(id) as Row | undefined;
  if (!cur) return false;
  db.prepare("UPDATE shipments SET label = ?, planned_at = ?, shipped_at = ?, tracking = ?, note = ?, updated_at = ? WHERE id = ?").run(
    (patch.label ?? cur.label ?? "").slice(0, 80),
    patch.plannedAt === undefined ? cur.planned_at : patch.plannedAt,
    patch.shippedAt === undefined ? cur.shipped_at : patch.shippedAt,
    (patch.tracking ?? cur.tracking ?? "").slice(0, 120),
    (patch.note ?? cur.note ?? "").slice(0, 300),
    new Date().toISOString(),
    id,
  );
  return true;
}

/** Status change: from "handed" on the packed lots move to the stage's place (order lines follow through the lots). */
export async function setShipmentStatus(id: number, status: ShipmentStatus): Promise<{ ok: boolean; lots: number; message?: string }> {
  const db = getDb();
  const cur = db.prepare("SELECT * FROM shipments WHERE id = ?").get(id) as Row | undefined;
  if (!cur) return { ok: false, lots: 0, message: "Không tìm thấy chuyến." };
  const lotIds = (db.prepare("SELECT id FROM stock_lots WHERE shipment_id = ?").all(id) as Array<{ id: number }>).map((r) => r.id);
  const stage = shipmentStage(status);
  const now = new Date().toISOString();
  withTransaction(db, () => {
    if (stage.location) setLotLocationSync(db, lotIds, stage.location.warehouse, stage.location.inTransit);
    else if (shipmentIndex(statusOf(cur.status)) > shipmentIndex("packed")) setLotLocationSync(db, lotIds, "jp", false); // pulled back to the shop
    const shippedAt = shipmentIndex(status) >= shipmentIndex("handed") ? (cur.shipped_at ?? now.slice(0, 10)) : null;
    db.prepare("UPDATE shipments SET status = ?, shipped_at = ?, updated_at = ? WHERE id = ?").run(status, shippedAt, now, id);
  });
  return { ok: true, lots: lotIds.length };
}

/** Pack whole lots (or `qty` unsold units of one: that part + every unit customers already paid for) into a run. */
export function packLots(shipmentId: number, items: Array<{ lotId: number; qty?: number | null }>): { ok: boolean; message: string; packed: number; units: number } {
  const db = getDb();
  const sh = db.prepare("SELECT id, code, status FROM shipments WHERE id = ?").get(shipmentId) as { id: number; code: string; status: string } | undefined;
  if (!sh) return { ok: false, message: "Không tìm thấy chuyến.", packed: 0, units: 0 };
  if (!shipmentEditable(statusOf(sh.status))) return { ok: false, message: `Chuyến ${sh.code} đã xuất cho ĐVVC — không thêm được nữa.`, packed: 0, units: 0 };
  let packed = 0;
  let units = 0;
  const skipped: string[] = [];
  const now = new Date().toISOString();
  withTransaction(db, () => {
    for (const it of items) {
      const lot = db.prepare("SELECT id, qty_left, warehouse, in_transit, shipment_id FROM stock_lots WHERE id = ?").get(it.lotId) as { id: number; qty_left: number; warehouse: string; in_transit: number; shipment_id: number | null } | undefined;
      if (!lot) continue;
      if (lot.shipment_id) {
        skipped.push(`lô #${lot.id} đã ở chuyến khác`);
        continue;
      }
      if (lot.warehouse !== "jp" || lot.in_transit) {
        skipped.push(`lô #${lot.id} không ở Kho Nhật (shop)`);
        continue;
      }
      const held = heldAllocationsSync(db, lot.id).reduce((n, a) => n + a.qty, 0);
      const qty = typeof it.qty === "number" && it.qty >= 0 && it.qty < lot.qty_left ? it.qty : null;
      if (qty !== null) {
        const r = splitLotSync(db, lot.id, qty, { moveReservations: true });
        if (!r.ok) {
          skipped.push(`lô #${lot.id}: ${r.message}`);
          continue;
        }
        db.prepare("UPDATE stock_lots SET shipment_id = ?, updated_at = ? WHERE id = ?").run(shipmentId, now, r.childId!);
        units += qty + held;
      } else {
        db.prepare("UPDATE stock_lots SET shipment_id = ?, updated_at = ? WHERE id = ?").run(shipmentId, now, lot.id);
        units += lot.qty_left + held;
      }
      packed++;
    }
    db.prepare("UPDATE shipments SET updated_at = ? WHERE id = ?").run(now, shipmentId);
  });
  return { ok: packed > 0 || !skipped.length, message: `Đã đóng ${packed} lô (${units} đv) vào chuyến ${sh.code}${skipped.length ? ` · bỏ qua: ${skipped.join("; ")}` : ""}.`, packed, units };
}

/**
 * Pack `qty` units of a product: FEFO over its lots at Kho Nhật (shop) that are not boxed yet. A lot's paid units go
 * first (they are what customers wait for), then unsold ones, splitting the last lot when only part of it is needed.
 */
export function packProduct(shipmentId: number, productId: number, qty: number): { ok: boolean; message: string; units: number; lots: number } {
  const db = getDb();
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, message: "Số lượng phải lớn hơn 0.", units: 0, lots: 0 };
  const cands = listLotViews(db, { productId, side: "jp" }).filter((l) => l.warehouse === "jp" && !l.inTransit && l.shipmentId === null && l.physical > 0);
  const available = cands.reduce((n, l) => n + l.physical, 0);
  if (!cands.length) return { ok: false, message: "Sản phẩm này không có lô nào ở Kho Nhật (shop).", units: 0, lots: 0 };
  let need = qty;
  const items: Array<{ lotId: number; qty?: number | null }> = [];
  for (const l of cands) {
    if (need <= 0) break;
    if (need >= l.physical) {
      items.push({ lotId: l.id });
      need -= l.physical;
    } else {
      // paid units always travel; the unsold part is what is left of the request (may be 0 when paid units cover it)
      const unsold = Math.max(0, need - l.heldQty);
      items.push({ lotId: l.id, qty: unsold });
      need -= l.heldQty + unsold;
    }
  }
  const r = packLots(shipmentId, items);
  const short = need > 0 ? ` Chỉ có ${available} đv ở Kho Nhật (shop) — thiếu ${need} đv.` : "";
  return { ok: r.ok, message: `${r.message}${short}`, units: r.units, lots: r.packed };
}

/** Take a lot out of a run that is still at the shop; a split-off part rejoins its parent lot when possible. */
export function unpackLot(lotId: number): { ok: boolean; message: string } {
  const db = getDb();
  const lot = db.prepare("SELECT l.id, l.shipment_id, s.code, s.status FROM stock_lots l LEFT JOIN shipments s ON s.id = l.shipment_id WHERE l.id = ?").get(lotId) as { id: number; shipment_id: number | null; code: string | null; status: string | null } | undefined;
  if (!lot || !lot.shipment_id) return { ok: false, message: "Lô không nằm trong chuyến nào." };
  if (!shipmentEditable(statusOf(lot.status ?? "packing"))) return { ok: false, message: `Chuyến ${lot.code} đã xuất cho ĐVVC — không rút được.` };
  let merged = false;
  withTransaction(db, () => {
    db.prepare("UPDATE stock_lots SET shipment_id = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), lotId);
    const parent = db.prepare("SELECT p.id FROM stock_lots c JOIN stock_lots p ON p.id = c.parent_lot_id WHERE c.id = ? AND p.warehouse = 'jp' AND COALESCE(p.in_transit, 0) = 0 AND p.shipment_id IS NULL AND p.batch_id IS c.batch_id").get(lotId) as { id: number } | undefined;
    if (parent) merged = mergeLotBackSync(db, lotId).ok;
  });
  return { ok: true, message: merged ? `Đã rút lô #${lotId} khỏi chuyến (gộp lại về lô gốc).` : `Đã rút lô #${lotId} khỏi chuyến.` };
}

/** Delete a run that never left the shop: its lots go back to the shelf. */
export function deleteShipment(id: number): { ok: boolean; message: string } {
  const db = getDb();
  const sh = db.prepare("SELECT id, code, status FROM shipments WHERE id = ?").get(id) as { id: number; code: string; status: string } | undefined;
  if (!sh) return { ok: false, message: "Không tìm thấy chuyến." };
  if (!shipmentEditable(statusOf(sh.status))) return { ok: false, message: `Chuyến ${sh.code} đã xuất cho ĐVVC — không xoá được.` };
  const lotIds = (db.prepare("SELECT id FROM stock_lots WHERE shipment_id = ?").all(id) as Array<{ id: number }>).map((r) => r.id);
  for (const lotId of lotIds) unpackLot(lotId);
  db.prepare("DELETE FROM shipments WHERE id = ?").run(id);
  return { ok: true, message: `Đã xoá chuyến ${sh.code}; ${lotIds.length} lô trở lại Kho Nhật (shop).` };
}

// ---------------------------------------------------------------------------------------------------------------------
// Picking what to pack: lots on the shelf at Kho Nhật (shop) and order lines bought at the shop that have no lot yet.

export interface PackCandidate {
  /** "lot:<id>" | "line:<itemId>" */
  key: string;
  kind: "lot" | "line";
  productId: number;
  productName: string;
  productSku: string | null;
  productThumb: string;
  /** Units that can go into the box. */
  qty: number;
  /** Of which already paid by customers. */
  heldQty: number;
  orders: Array<{ orderId: string; orderNumber: number; customer: string; qty: number; committed: boolean }>;
  batchId: number | null;
  batchCode: string;
  expiry: string | null;
  sourceKey: string;
  unitCostJpy: number | null;
  lotId: number | null;
  itemId: number | null;
}

interface LineCand {
  id: number;
  order_id: string;
  number: number;
  first_name: string;
  last_name: string;
  stock_committed_at: string | null;
  product_id: number;
  name: string;
  quantity: number;
  batch_id: number | null;
  batch_code: string | null;
  sku: string | null;
  thumb: string | null;
  purchase_expiry: string | null;
  source_key: string | null;
  jpy: number | null;
}

const LINE_CANDS = `SELECT oi.id, oi.order_id, o.number, o.first_name, o.last_name, o.stock_committed_at, oi.product_id, oi.name, oi.quantity, oi.batch_id, b.code AS batch_code, p.sku, p.thumb,
        oi.purchase_expiry, oi.source_key, COALESCE(oi.purchase_cost_jpy, p.cost_jpy) AS jpy
   FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id LEFT JOIN purchase_batches b ON b.id = oi.batch_id
   WHERE o.status IN ('pending','processing') AND oi.purchase_status = 'bought'
     AND NOT EXISTS (SELECT 1 FROM order_item_allocations a WHERE a.order_item_id = oi.id AND a.source_type = 'lot')`;

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");

/** Everything that could be packed right now, optionally narrowed to one order / one purchase batch / a search text. */
export function listPackCandidates(db: DatabaseSync, filter: { orderId?: string; batchId?: number; q?: string } = {}): PackCandidate[] {
  const lots = listLotViews(db, { side: "jp" }).filter((l) => l.warehouse === "jp" && !l.inTransit && l.shipmentId === null && l.physical > 0);
  const lines = db.prepare(`${LINE_CANDS} ORDER BY o.number, oi.id`).all() as unknown as LineCand[];
  const out: PackCandidate[] = [
    ...lots.map(
      (l): PackCandidate => ({
        key: `lot:${l.id}`,
        kind: "lot",
        productId: l.productId,
        productName: l.productName,
        productSku: l.productSku,
        productThumb: l.productThumb,
        qty: l.physical,
        heldQty: l.heldQty,
        orders: l.reserved.map((r) => ({ orderId: r.orderId, orderNumber: r.orderNumber, customer: "", qty: r.qty, committed: r.committed })),
        batchId: l.batchId,
        batchCode: l.batchCode,
        expiry: l.expiry,
        sourceKey: l.sourceKey,
        unitCostJpy: l.unitCostJpy,
        lotId: l.id,
        itemId: null,
      }),
    ),
    ...lines.map(
      (x): PackCandidate => ({
        key: `line:${x.id}`,
        kind: "line",
        productId: x.product_id,
        productName: x.name,
        productSku: x.sku,
        productThumb: x.thumb ?? "",
        qty: x.quantity,
        heldQty: x.stock_committed_at ? x.quantity : 0,
        orders: [{ orderId: x.order_id, orderNumber: x.number, customer: `${x.last_name} ${x.first_name}`.trim(), qty: x.quantity, committed: !!x.stock_committed_at }],
        batchId: x.batch_id,
        batchCode: x.batch_code ?? "",
        expiry: x.purchase_expiry,
        sourceKey: x.source_key ?? "",
        unitCostJpy: x.jpy,
        lotId: null,
        itemId: x.id,
      }),
    ),
  ];
  // customers' names on lot reservations
  const orderIds = Array.from(new Set(out.flatMap((c) => c.orders.map((o) => o.orderId))));
  if (orderIds.length) {
    const names = new Map((db.prepare(`SELECT id, first_name, last_name FROM orders WHERE id IN (${orderIds.map(() => "?").join(",")})`).all(...orderIds) as Array<{ id: string; first_name: string; last_name: string }>).map((r) => [r.id, `${r.last_name} ${r.first_name}`.trim()]));
    for (const c of out) for (const o of c.orders) if (!o.customer) o.customer = names.get(o.orderId) ?? "";
  }
  const q = filter.q ? fold(filter.q.trim()) : "";
  return out
    .filter((c) => (filter.orderId ? c.orders.some((o) => o.orderId === filter.orderId) : true))
    .filter((c) => (filter.batchId ? c.batchId === filter.batchId : true))
    .filter((c) => (q ? fold(`${c.productName} ${c.productSku ?? ""} #${c.productId} ${c.orders.map((o) => `#${o.orderNumber} ${o.customer}`).join(" ")} ${c.batchCode}`).includes(q) : true))
    .sort((a, b) => a.productName.localeCompare(b.productName, "vi") || (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"));
}

/** Orders / batches that currently have something packable (for the pickers). */
export function listPackSources(db: DatabaseSync): { orders: Array<{ orderId: string; orderNumber: number; customer: string; units: number }>; batches: Array<{ batchId: number; code: string; units: number }> } {
  const all = listPackCandidates(db);
  const orders = new Map<string, { orderId: string; orderNumber: number; customer: string; units: number }>();
  const batches = new Map<number, { batchId: number; code: string; units: number }>();
  for (const c of all) {
    for (const o of c.orders) {
      const g = orders.get(o.orderId) ?? { orderId: o.orderId, orderNumber: o.orderNumber, customer: o.customer, units: 0 };
      g.units += o.qty;
      orders.set(o.orderId, g);
    }
    if (c.batchId) {
      const g = batches.get(c.batchId) ?? { batchId: c.batchId, code: c.batchCode, units: 0 };
      g.units += c.qty;
      batches.set(c.batchId, g);
    }
  }
  return { orders: [...orders.values()].sort((a, b) => b.orderNumber - a.orderNumber), batches: [...batches.values()].sort((a, b) => b.batchId - a.batchId) };
}

/**
 * A line bought for a customer at the shop that never became a lot (legacy "Đã mua" lines, batch-sourced lines):
 * give it a lot at Kho Nhật (shop) holding exactly its units, so it can be boxed like everything else.
 */
export function materializeLineLotSync(db: DatabaseSync, itemId: number): number | null {
  const x = db.prepare(`${LINE_CANDS} AND oi.id = ?`).get(itemId) as LineCand | undefined;
  if (!x) return (db.prepare("SELECT source_id FROM order_item_allocations WHERE order_item_id = ? AND source_type = 'lot' LIMIT 1").get(itemId) as { source_id: number } | undefined)?.source_id ?? null;
  const now = new Date().toISOString();
  const p = db.prepare("SELECT cost_jpy, cost_price FROM products WHERE id = ?").get(x.product_id) as { cost_jpy: number | null; cost_price: number | null } | undefined;
  const jpy = x.jpy ?? p?.cost_jpy ?? null;
  const vnd = jpy && jpy !== p?.cost_jpy ? null : (p?.cost_price ?? null);
  const consumed = !!x.stock_committed_at;
  const r = db
    .prepare("INSERT INTO stock_lots (product_id, qty_in, qty_left, received_at, bought_at, source_key, unit_cost_jpy, unit_cost_vnd, expiry, warehouse, in_transit, batch_id, parent_lot_id, location, note, purchase_id, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'jp', 0, ?, NULL, '', ?, NULL, ?, ?)")
    .run(x.product_id, x.quantity, consumed ? 0 : x.quantity, now.slice(0, 10), x.source_key || "unknown", jpy, vnd, x.purchase_expiry, x.batch_id, `${x.batch_code ? `Đợt ${x.batch_code} · ` : ""}theo đơn #${x.number}`, now, now);
  const lotId = Number(r.lastInsertRowid);
  db.prepare("DELETE FROM order_item_allocations WHERE order_item_id = ?").run(itemId);
  db.prepare("INSERT INTO order_item_allocations (order_item_id, source_type, source_id, qty, manual, consumed_at, created_at, updated_at) VALUES (?, 'lot', ?, ?, 1, ?, ?, ?)").run(itemId, lotId, x.quantity, consumed ? now : null, now, now);
  syncProductStock(db, x.product_id, now);
  return lotId;
}

/** Ticked candidates (lots or lines) → the run; a line gets its lot first. `qty` below a lot's unsold count splits it. */
export function packCandidates(shipmentId: number, items: Array<{ key: string; qty?: number | null }>): { ok: boolean; message: string; packed: number; units: number } {
  const db = getDb();
  const lotItems: Array<{ lotId: number; qty?: number | null }> = [];
  withTransaction(db, () => {
    for (const it of items) {
      const [kind, idRaw] = it.key.split(":");
      const id = Number.parseInt(idRaw, 10);
      if (!Number.isInteger(id)) continue;
      if (kind === "lot") lotItems.push({ lotId: id, qty: it.qty });
      else if (kind === "line") {
        const lotId = materializeLineLotSync(db, id);
        if (lotId) lotItems.push({ lotId });
      }
    }
  });
  if (!lotItems.length) return { ok: false, message: "Chưa tick dòng nào.", packed: 0, units: 0 };
  return packLots(shipmentId, lotItems);
}
