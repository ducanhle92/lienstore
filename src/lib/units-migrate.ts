import type { DatabaseSync } from "node:sqlite";
import { isPurchaseStatus, type PurchaseStatus, purchaseIndex } from "./purchase";
import { groupCodeFromName, unitCode } from "./units";
import { isWarehouse, statusForLocation } from "./warehouses";

/**
 * Migration 65 data step: every lot, purchase slip and bought order line becomes one row per physical item in
 * stock_units, keeping where it is, who it is held for, which bill / batch / packing run it belongs to.
 * Runs inside the migration transaction (no imports from sqlite.ts / db.ts). The legacy tables stay untouched.
 */

interface LotRow {
  id: number;
  product_id: number;
  qty_left: number;
  received_at: string;
  bought_at: string | null;
  source_key: string;
  unit_cost_jpy: number | null;
  unit_cost_vnd: number | null;
  expiry: string | null;
  warehouse: string;
  in_transit: number | null;
  batch_id: number | null;
  parent_lot_id: number | null;
  shipment_id: number | null;
  note: string | null;
  created_at: string;
}
interface AllocRow {
  id: number;
  order_item_id: number;
  source_id: number | null;
  qty: number;
  manual: number;
  consumed_at: string | null;
  ship_stage: string | null;
  order_status: string;
}

const cleanStore = (note: string | null) =>
  (note ?? "")
    .replace(/^Đợt [A-Za-z0-9-]+(\s*·\s*)?/u, "")
    .replace(/^(Phiếu|phiếu) [^\s·]+(\s*·\s*)?/u, "")
    .trim()
    .slice(0, 80);

export function convertLegacyStock(db: DatabaseSync): { units: number; lots: number; slips: number; lines: number } {
  const now = new Date().toISOString();
  const ins = db.prepare(
    `INSERT INTO stock_units (code, product_id, receipt_id, batch_id, shipment_id, order_item_id, manual, committed_at, status, removed, source_key, store, bought_at, expiry, unit_cost_jpy, unit_cost_vnd, origin, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const setCode = db.prepare("UPDATE stock_units SET code = ? WHERE id = ?");
  const ev = db.prepare("INSERT INTO stock_unit_events (unit_id, kind, from_status, to_status, order_item_id, actor, note, created_at) VALUES (?, 'created', NULL, ?, ?, 'chuyển đổi 1.87', ?, ?)");
  let tmp = 0;
  let units = 0;
  const make = (u: { productId: number; receiptId: number | null; batchId: number | null; shipmentId: number | null; itemId: number | null; manual: boolean; committedAt: string | null; status: PurchaseStatus; sourceKey: string; store: string; boughtAt: string | null; expiry: string | null; jpy: number | null; vnd: number | null; origin: string; note: string; createdAt: string }, n: number, evNote: string) => {
    for (let i = 0; i < n; i++) {
      const r = ins.run(`~${++tmp}`, u.productId, u.receiptId, u.batchId, u.shipmentId, u.itemId, u.manual ? 1 : 0, u.committedAt, u.status, u.sourceKey || "unknown", u.store, u.boughtAt, u.expiry, u.jpy, u.vnd, u.origin, u.note, u.createdAt, now);
      const id = Number(r.lastInsertRowid);
      setCode.run(unitCode(id), id);
      ev.run(id, u.status, u.itemId, evNote, now);
      units++;
    }
  };

  // bill of a lot: its own slip, else the slip of the lot it was split off from
  const slipOf = db.prepare("SELECT receipt_id FROM stock_purchases WHERE lot_id = ? AND receipt_id IS NOT NULL LIMIT 1");
  const parentOf = db.prepare("SELECT parent_lot_id FROM stock_lots WHERE id = ?");
  const receiptOfLot = (lotId: number): { receiptId: number | null; hasSlip: boolean } => {
    let cur: number | null = lotId;
    for (let depth = 0; cur && depth < 20; depth++) {
      const s = slipOf.get(cur) as { receipt_id: number } | undefined;
      if (s) return { receiptId: s.receipt_id, hasSlip: true };
      cur = ((parentOf.get(cur) as { parent_lot_id: number | null } | undefined)?.parent_lot_id ?? null) as number | null;
    }
    const any = db.prepare("SELECT 1 FROM stock_purchases WHERE lot_id = ?").get(lotId);
    return { receiptId: null, hasSlip: !!any };
  };
  const allocs = db.prepare(
    `SELECT a.id, a.order_item_id, a.source_id, a.qty, a.manual, a.consumed_at, o.ship_stage, o.status AS order_status FROM order_item_allocations a
     JOIN order_items oi ON oi.id = a.order_item_id JOIN orders o ON o.id = oi.order_id WHERE a.source_type = ? AND a.source_id = ? AND o.status <> 'cancelled' ORDER BY o.created_at, a.id`,
  );

  // 1. lots
  const lots = db.prepare("SELECT * FROM stock_lots ORDER BY id").all() as unknown as LotRow[];
  let lotCount = 0;
  for (const l of lots) {
    const wh = isWarehouse(l.warehouse) ? l.warehouse : "vn";
    const status = statusForLocation(wh, (l.in_transit ?? 0) === 1);
    const { receiptId, hasSlip } = receiptOfLot(l.id);
    const note = l.note ?? "";
    const origin = /^Nhập lại/.test(note) ? "return" : /kiểm kho|Tồn đầu kỳ/i.test(note) ? "count" : hasSlip || receiptId ? "bill" : l.batch_id ? "bill" : "legacy";
    const base = { productId: l.product_id, receiptId, batchId: l.batch_id, shipmentId: l.shipment_id ?? null, sourceKey: l.source_key, store: origin === "bill" ? cleanStore(note) : "", boughtAt: l.bought_at ?? l.received_at ?? null, expiry: l.expiry, jpy: l.unit_cost_jpy, vnd: l.unit_cost_vnd, origin, note, createdAt: l.created_at };
    const rows = allocs.all("lot", l.id) as unknown as AllocRow[];
    let free = Math.max(0, l.qty_left);
    // units still on the lot but held for open orders (reserved, not deducted)
    for (const a of rows.filter((x) => !x.consumed_at)) {
      const n = Math.min(a.qty, free);
      if (n <= 0) continue;
      make({ ...base, itemId: a.order_item_id, manual: a.manual === 1, committedAt: null, status }, n, `lô #${l.id} (giữ cho đơn)`);
      free -= n;
    }
    // units customers already paid for (deducted from qty_left, still in the lot until they leave for the customer)
    for (const a of rows.filter((x) => x.consumed_at)) {
      if (a.qty <= 0) continue;
      const st: PurchaseStatus = a.ship_stage === "delivered" || a.order_status === "completed" ? "delivered" : a.ship_stage === "delivering" ? "shipped_to_customer" : status;
      make({ ...base, itemId: a.order_item_id, manual: a.manual === 1, committedAt: a.consumed_at, status: st }, a.qty, `lô #${l.id} (đã trừ tồn)`);
    }
    if (free > 0) make({ ...base, itemId: null, manual: false, committedAt: null, status }, free, `lô #${l.id}`);
    lotCount++;
  }

  // 2. purchase slips that never became a lot (dự định mua / đã đặt mua)
  const slips = db.prepare("SELECT * FROM stock_purchases WHERE lot_id IS NULL AND qty > 0 ORDER BY id").all() as unknown as Array<{ id: number; product_id: number; qty: number; source_key: string; unit_cost_jpy: number | null; status: string; expiry: string | null; bought_at: string | null; note: string | null; batch_id: number | null; receipt_id: number | null; created_at: string }>;
  for (const s of slips) {
    const raw = isPurchaseStatus(s.status) ? s.status : "not_bought";
    const status: PurchaseStatus = purchaseIndex(raw) > purchaseIndex("ordered") ? "ordered" : raw;
    const base = { productId: s.product_id, receiptId: s.receipt_id ?? null, batchId: s.batch_id, shipmentId: null, sourceKey: s.source_key, store: cleanStore(s.note), boughtAt: s.bought_at, expiry: s.expiry, jpy: s.unit_cost_jpy, vnd: null, origin: "bill", note: s.note ?? "", createdAt: s.created_at, status };
    let left = s.qty;
    for (const a of allocs.all("stock_purchase", s.id) as unknown as AllocRow[]) {
      const n = Math.min(a.qty, left);
      if (n <= 0) continue;
      make({ ...base, itemId: a.order_item_id, manual: a.manual === 1, committedAt: null }, n, `phiếu #${s.id} (giữ cho đơn)`);
      left -= n;
    }
    if (left > 0) make({ ...base, itemId: null, manual: false, committedAt: null }, left, `phiếu #${s.id}`);
  }

  // 3. order lines bought for the customer with no unit behind them yet (mua theo đơn, legacy "Đã mua" lines)
  const lines = db
    .prepare(
      `SELECT oi.id, oi.product_id, oi.quantity, oi.purchase_status, oi.source_key, oi.receipt_id, oi.batch_id, oi.purchase_expiry, oi.purchase_bought_at, oi.purchase_cost_jpy, oi.purchase_note,
              o.stock_committed_at, o.created_at, o.number, p.cost_jpy, p.cost_price,
              (SELECT COUNT(*) FROM stock_units u WHERE u.order_item_id = oi.id) AS have
       FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.status <> 'cancelled' AND oi.product_id IS NOT NULL`,
    )
    .all() as unknown as Array<{ id: number; product_id: number; quantity: number; purchase_status: string | null; source_key: string | null; receipt_id: number | null; batch_id: number | null; purchase_expiry: string | null; purchase_bought_at: string | null; purchase_cost_jpy: number | null; purchase_note: string | null; stock_committed_at: string | null; created_at: string; number: number; cost_jpy: number | null; cost_price: number | null; have: number }>;
  let lineCount = 0;
  for (const l of lines) {
    const st = isPurchaseStatus(l.purchase_status) ? l.purchase_status : "not_bought";
    if (purchaseIndex(st) < purchaseIndex("ordered")) continue;
    const missing = l.quantity - Number(l.have);
    if (missing <= 0) continue;
    make(
      {
        productId: l.product_id,
        receiptId: l.receipt_id ?? null,
        batchId: l.batch_id ?? null,
        shipmentId: null,
        itemId: l.id,
        manual: true,
        committedAt: l.stock_committed_at,
        status: st,
        sourceKey: l.source_key || "unknown",
        store: "",
        boughtAt: l.purchase_bought_at,
        expiry: l.purchase_expiry,
        jpy: l.purchase_cost_jpy ?? l.cost_jpy,
        vnd: l.purchase_cost_jpy && l.purchase_cost_jpy !== l.cost_jpy ? null : l.cost_price,
        origin: "order",
        note: `Mua theo đơn #${l.number}${l.purchase_note ? ` · ${l.purchase_note}` : ""}`.slice(0, 300),
        createdAt: l.created_at,
      },
      missing,
      `đơn #${l.number}`,
    );
    lineCount++;
  }
  return { units, lots: lotCount, slips: slips.length, lines: lineCount };
}

/** Variant groups get a memorable code from their name ("HATOMUGI-SUA-TAM"), unique, editable later. */
export function backfillGroupCodes(db: DatabaseSync): number {
  const rows = db.prepare("SELECT id, name FROM product_groups WHERE code IS NULL OR code = '' ORDER BY id").all() as Array<{ id: number; name: string }>;
  const taken = new Set((db.prepare("SELECT code FROM product_groups WHERE code IS NOT NULL AND code <> ''").all() as Array<{ code: string }>).map((r) => r.code));
  for (const r of rows) {
    const base = groupCodeFromName(r.name);
    let code = base;
    for (let i = 2; taken.has(code); i++) code = `${base}-${i}`;
    taken.add(code);
    db.prepare("UPDATE product_groups SET code = ? WHERE id = ?").run(code, r.id);
  }
  return rows.length;
}
