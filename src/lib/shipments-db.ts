import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { heldAllocationsSync, mergeLotBackSync, setLotLocationSync, splitLotSync } from "./db";
import { listLotViews, type LotView } from "./lots-db";
import { isShipmentStatus, shipmentCode, shipmentEditable, shipmentIndex, shipmentStage, type ShipmentStatus } from "./shipments";
import { getDb, withTransaction } from "./sqlite";

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
