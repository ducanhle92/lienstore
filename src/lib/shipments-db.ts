import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { groupUnits, type StockGroup } from "./lots-db";
import type { PurchaseStatus } from "./purchase";
import { isShipmentStatus, shipmentCode, shipmentEditable, shipmentIndex, shipmentOpen, shipmentStage, type ShipmentStatus } from "./shipments";
import { getDb, withTransaction } from "./sqlite";
import { sortUnits } from "./units";
import { listUnits, moveUnitsSync, packUnitsSync, touchSync, unpackUnitsSync, type UnitView } from "./units-db";
import { statusForLocation } from "./warehouses";

/**
 * Đóng hàng (DB side): a packing run owns units through `stock_units.shipment_id`. While the run is "packing" /
 * "packed" the units stay at Kho Nhật (shop) but are boxed; from "handed" on every status change moves them to the
 * matching place, and the orders / lines / batches that hold them follow (units-db.touchSync).
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
  groups: StockGroup[];
  units: number;
  /** Units already held for customers (paid or not). */
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
  const units = listUnits(db, { shipmentIds: rows.map((r) => r.id), withDelivered: true });
  return rows.map((r) => {
    const mine = units.filter((u) => u.shipmentId === r.id);
    let jpy: number | null = null;
    for (const u of mine) if (u.unitCostJpy !== null) jpy = (jpy ?? 0) + u.unitCostJpy;
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
      groups: groupUnits(mine),
      units: mine.length,
      heldUnits: mine.filter((u) => u.itemId).length,
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
/** Open runs units can still be packed into. */
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

/** Unit status a run stage puts its units at (null = still on the shop's shelf, boxed). */
function stageUnitStatus(status: ShipmentStatus): PurchaseStatus | null {
  const loc = shipmentStage(status).location;
  return loc ? statusForLocation(loc.warehouse, loc.inTransit) : null;
}

/** Status change: from "handed" on the packed units move to the stage's place; orders, lines and batches follow. */
export async function setShipmentStatus(id: number, status: ShipmentStatus, actor = ""): Promise<{ ok: boolean; lots: number; message?: string }> {
  const db = getDb();
  const cur = db.prepare("SELECT * FROM shipments WHERE id = ?").get(id) as Row | undefined;
  if (!cur) return { ok: false, lots: 0, message: "Không tìm thấy chuyến." };
  const unitIds = (db.prepare("SELECT id FROM stock_units WHERE shipment_id = ? AND removed IS NULL").all(id) as Array<{ id: number }>).map((r) => r.id);
  const target = stageUnitStatus(status);
  const now = new Date().toISOString();
  withTransaction(db, () => {
    if (target) moveUnitsSync(db, unitIds, target, { actor, note: `Chuyến ${cur.code}` });
    else if (shipmentIndex(statusOf(cur.status)) > shipmentIndex("packed")) moveUnitsSync(db, unitIds, "bought", { actor, note: `Chuyến ${cur.code} — về lại kệ` });
    const shippedAt = shipmentIndex(status) >= shipmentIndex("handed") ? (cur.shipped_at ?? now.slice(0, 10)) : null;
    db.prepare("UPDATE shipments SET status = ?, shipped_at = ?, updated_at = ? WHERE id = ?").run(status, shippedAt, now, id);
    touchSync(db, { unitIds });
  });
  return { ok: true, lots: unitIds.length };
}

function assertEditable(db: DatabaseSync, shipmentId: number): { ok: true; code: string } | { ok: false; message: string } {
  const sh = db.prepare("SELECT id, code, status FROM shipments WHERE id = ?").get(shipmentId) as { id: number; code: string; status: string } | undefined;
  if (!sh) return { ok: false, message: "Không tìm thấy chuyến." };
  const st = statusOf(sh.status);
  if (!shipmentEditable(st)) return { ok: false, message: `Chuyến ${sh.code} đã xuất cho ĐVVC — không thêm / rút được nữa.` };
  if (!shipmentOpen(st)) return { ok: false, message: `Chuyến ${sh.code} đã khoá (đã đóng xong) — bấm Mở khoá để thêm / rút hàng.` };
  return { ok: true, code: sh.code };
}

/** Units (by id) into a run; only those on the shelf at Kho Nhật (shop) and not boxed yet are taken. */
export function packUnits(shipmentId: number, unitIds: number[], actor = ""): { ok: boolean; message: string; units: number } {
  const db = getDb();
  const e = assertEditable(db, shipmentId);
  if (!e.ok) return { ok: false, message: e.message, units: 0 };
  const n = withTransaction(db, () => {
    const k = packUnitsSync(db, shipmentId, unitIds, { actor });
    db.prepare("UPDATE shipments SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), shipmentId);
    touchSync(db, { unitIds });
    return k;
  });
  const skipped = unitIds.length - n;
  return { ok: n > 0, message: `Đã đóng ${n} cái vào chuyến ${e.code}${skipped ? ` · bỏ qua ${skipped} cái (không ở kệ Kho Nhật hoặc đã ở chuyến khác)` : ""}.`, units: n };
}

/** Pick order inside a candidate: units of paid orders first, then held ones, then free — FEFO within each. */
function packOrder(units: UnitView[]): UnitView[] {
  const w = (u: UnitView) => (u.itemId && u.committed ? 0 : u.itemId ? 1 : 2);
  return sortUnits(units).sort((a, b) => w(a) - w(b));
}

/** Pack `qty` units of a product: FEFO over what is on the shelf at Kho Nhật (shop), customers' units first. */
export function packProduct(shipmentId: number, productId: number, qty: number, actor = ""): { ok: boolean; message: string; units: number } {
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, message: "Số lượng phải lớn hơn 0.", units: 0 };
  const shelf = packOrder(listUnits(getDb(), { productId, statuses: ["bought"] }).filter((u) => !u.shipmentId));
  if (!shelf.length) return { ok: false, message: "Sản phẩm này không còn cái nào trên kệ Kho Nhật (shop).", units: 0 };
  const r = packUnits(shipmentId, shelf.slice(0, qty).map((u) => u.id), actor);
  return { ...r, message: `${r.message}${qty > shelf.length ? ` Chỉ có ${shelf.length} cái ở Kho Nhật (shop) — thiếu ${qty - shelf.length}.` : ""}` };
}

/** Take units out of a run that is still at the shop. */
export function unpackUnits(unitIds: number[], actor = ""): { ok: boolean; message: string } {
  const db = getDb();
  if (!unitIds.length) return { ok: false, message: "Chưa chọn cái nào." };
  const rows = db.prepare(`SELECT u.id, s.code, s.status FROM stock_units u JOIN shipments s ON s.id = u.shipment_id WHERE u.id IN (${unitIds.map(() => "?").join(",")})`).all(...unitIds) as Array<{ id: number; code: string; status: string }>;
  const ok = rows.filter((r) => shipmentOpen(statusOf(r.status))).map((r) => r.id);
  if (!ok.length) return { ok: false, message: rows.length ? (shipmentEditable(statusOf(rows[0].status)) ? `Chuyến ${rows[0].code} đã khoá (đã đóng xong) — bấm Mở khoá để rút hàng.` : `Chuyến ${rows[0].code} đã xuất cho ĐVVC — không rút được.`) : "Các cái này không nằm trong chuyến nào." };
  withTransaction(db, () => {
    unpackUnitsSync(db, ok, { actor });
    touchSync(db, { unitIds: ok });
  });
  return { ok: true, message: `Đã rút ${ok.length} cái khỏi chuyến — về lại kệ Kho Nhật (shop).` };
}

/** Delete a run that never left the shop: its units go back to the shelf. */
export function deleteShipment(id: number): { ok: boolean; message: string } {
  const db = getDb();
  const e = assertEditable(db, id);
  if (!e.ok) return { ok: false, message: e.message };
  const ids = (db.prepare("SELECT id FROM stock_units WHERE shipment_id = ?").all(id) as Array<{ id: number }>).map((r) => r.id);
  withTransaction(db, () => {
    unpackUnitsSync(db, ids);
    db.prepare("DELETE FROM shipments WHERE id = ?").run(id);
    touchSync(db, { unitIds: ids });
  });
  return { ok: true, message: `Đã xoá chuyến ${e.code}; ${ids.length} cái trở lại Kho Nhật (shop).` };
}

// ---------------------------------------------------------------------------------------------------------------------
// Picking what to pack: units on the shelf at Kho Nhật (shop), one row per bill line × who holds them.

export interface PackCandidate {
  /** "u:<id>.<id>…" — the units of the row, in pick order. */
  key: string;
  unitIds: number[];
  codes: string[];
  productId: number;
  productName: string;
  productSku: string | null;
  productThumb: string;
  productWeightG: number | null;
  /** Units on the shelf in this row. */
  qty: number;
  /** Of which already paid by customers. */
  heldQty: number;
  orders: Array<{ orderId: string; orderNumber: number; customer: string; qty: number; committed: boolean }>;
  batchId: number | null;
  batchCode: string;
  receiptCode: string;
  expiry: string | null;
  sourceKey: string;
  unitCostJpy: number | null;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");

/** Everything that could be packed right now, optionally narrowed to one order / one purchase batch / a search text. */
/** `orderId: "none"` = goods no order holds; `batchId: "none"` = goods bought outside a purchase trip. Filters combine. */
export function listPackCandidates(db: DatabaseSync, filter: { orderId?: string; batchId?: number | "none"; q?: string } = {}): PackCandidate[] {
  const shelf = listUnits(db, { statuses: ["bought"] }).filter((u) => !u.shipmentId);
  const out: PackCandidate[] = [];
  for (const g of groupUnits(shelf)) {
    // split the bill line by holder: each order's units, then the free ones
    const parts = new Map<string, UnitView[]>();
    for (const u of g.units) {
      const k = u.itemId ? `i${u.itemId}` : "free";
      parts.set(k, [...(parts.get(k) ?? []), u]);
    }
    for (const us of parts.values()) {
      const ordered = packOrder(us);
      const u = ordered[0];
      out.push({
        key: `u:${ordered.map((x) => x.id).join(".")}`,
        unitIds: ordered.map((x) => x.id),
        codes: ordered.map((x) => x.code),
        productId: u.productId,
        productName: u.productName,
        productSku: u.productSku,
        productThumb: u.productThumb,
        productWeightG: u.productWeightG,
        qty: ordered.length,
        heldQty: ordered.filter((x) => x.committed).length,
        orders: u.orderId ? [{ orderId: u.orderId, orderNumber: u.orderNumber ?? 0, customer: u.customerName, qty: ordered.length, committed: ordered.some((x) => x.committed) }] : [],
        batchId: u.batchId,
        batchCode: u.batchCode,
        receiptCode: u.receiptCode,
        expiry: u.expiry,
        sourceKey: u.sourceKey,
        unitCostJpy: u.unitCostJpy,
      });
    }
  }
  const q = filter.q ? fold(filter.q.trim()) : "";
  return out
    .filter((c) => (filter.orderId === "none" ? c.orders.length === 0 : filter.orderId ? c.orders.some((o) => o.orderId === filter.orderId) : true))
    .filter((c) => (filter.batchId === "none" ? !c.batchId : filter.batchId ? c.batchId === filter.batchId : true))
    .filter((c) => (q ? fold(`${c.productName} ${c.productSku ?? ""} #${c.productId} ${c.orders.map((o) => `#${o.orderNumber} ${o.customer}`).join(" ")} ${c.batchCode} ${c.receiptCode} ${c.codes.join(" ")}`).includes(q) : true))
    .sort((a, b) => a.productName.localeCompare(b.productName, "vi") || (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"));
}

/** Orders / batches that currently have something packable (for the pickers). */
export function listPackSources(db: DatabaseSync): { orders: Array<{ orderId: string; orderNumber: number; customer: string; units: number }>; batches: Array<{ batchId: number; code: string; units: number }>; noOrderUnits: number; noBatchUnits: number } {
  const all = listPackCandidates(db);
  const noOrderUnits = all.filter((c) => !c.orders.length).reduce((n, c) => n + c.qty, 0);
  const noBatchUnits = all.filter((c) => !c.batchId).reduce((n, c) => n + c.qty, 0);
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
  return { orders: [...orders.values()].sort((a, b) => b.orderNumber - a.orderNumber), batches: [...batches.values()].sort((a, b) => b.batchId - a.batchId), noOrderUnits, noBatchUnits };
}

/** Ticked candidate rows → the run; `qty` below the row count packs only that many (in pick order). */
export function packCandidates(shipmentId: number, items: Array<{ unitIds: number[]; qty?: number | null }>, actor = ""): { ok: boolean; message: string; units: number } {
  const ids = items.flatMap((it) => (typeof it.qty === "number" && it.qty >= 0 && it.qty < it.unitIds.length ? it.unitIds.slice(0, it.qty) : it.unitIds));
  if (!ids.length) return { ok: false, message: "Chưa tick dòng nào (hoặc SL đóng = 0).", units: 0 };
  return packUnits(shipmentId, ids, actor);
}
