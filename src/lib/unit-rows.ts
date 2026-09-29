import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { parseExpiry } from "./lots";
import { isPurchaseStatus, purchaseIndex, type PurchaseStatus } from "./purchase";
import { receiptIdForCode } from "./purchase-batches-db";
import { createUnitsSync, deleteUnitsSync, editUnitsSync, moveUnitsSync, type UnitPatch, type UnitView } from "./units-db";

/**
 * Edits posted by a unit table (Mua theo đợt, trang sản phẩm): bill lines as g_<firstUnitId>_* (g_<id>_ids = their
 * units; applies to all of them), single units as u_<unitId>_status. Only differences are written; a status chosen on
 * one unit wins over its bill line's. Call inside a transaction, then touchSync(touched).
 */
export function readUnitRowFields(formData: FormData): Map<string, Record<string, string>> {
  const fields = new Map<string, Record<string, string>>();
  for (const [k, v] of formData.entries()) {
    const m = /^(g|u)_(\d+)_(\w+)$/.exec(k);
    if (!m || typeof v !== "string") continue;
    const key = `${m[1]}_${m[2]}`;
    const f = fields.get(key) ?? {};
    f[m[3]] = v.trim();
    fields.set(key, f);
  }
  return fields;
}

const dateOrNull = (raw: string): string | null | undefined => (raw ? (parseExpiry(raw) ?? undefined) : null);

export function applyUnitRowEdits(db: DatabaseSync, fields: Map<string, Record<string, string>>, units: UnitView[], opts: { batchId: number | null; actor: string }): { changed: number; errors: string[]; touched: number[]; /** Old + new product of every line that changed product. */ productIds: number[] } {
  const byId = new Map(units.map((u) => [u.id, u]));
  const errors: string[] = [];
  const touched: number[] = [];
  let changed = 0;
  const explicit = new Set<number>();
  // products whose queues must be re-derived after a line moved from one product to another
  const productIds = new Set<number>();
  for (const [key, f] of fields) {
    if (!key.startsWith("u_")) continue;
    const id = Number(key.slice(2));
    const u = byId.get(id);
    if (!u || !f.status || !isPurchaseStatus(f.status) || f.status === u.status) continue;
    moveUnitsSync(db, [id], f.status, { actor: opts.actor });
    explicit.add(id);
    touched.push(id);
    changed++;
  }
  for (const [key, f] of fields) {
    if (!key.startsWith("g_")) continue;
    const ids = (f.ids ?? "").split(/[,.\s]+/).map((x) => Number.parseInt(x, 10)).filter((x) => byId.has(x));
    if (!ids.length) continue;
    const u = byId.get(ids[0])!;
    const label = `${u.productName.slice(0, 30)} (${u.code})`;
    const patch: UnitPatch = {};
    // entered under the wrong product: the line becomes the other product (its order holds drop — another item now)
    if (f.pid !== undefined && f.pid !== "") {
      const pid = Number.parseInt(f.pid, 10);
      if (!Number.isInteger(pid) || pid <= 0) errors.push(`${label}: sản phẩm không hợp lệ.`);
      else if (pid !== u.productId) {
        const exists = db.prepare("SELECT 1 FROM products WHERE id = ?").get(pid);
        if (!exists) errors.push(`${label}: không tìm thấy sản phẩm #${pid}.`);
        else if (ids.some((x) => purchaseIndex(byId.get(x)!.status) >= purchaseIndex("shipped_to_customer"))) errors.push(`${label}: hàng đã giao cho khách — không đổi sản phẩm được.`);
        else {
          patch.productId = pid;
          productIds.add(u.productId);
          productIds.add(pid);
        }
      }
    }
    if (f.sourceKey && f.sourceKey !== u.sourceKey) patch.sourceKey = f.sourceKey;
    if (f.store !== undefined && f.store !== u.store) patch.store = f.store;
    if (f.expiry !== undefined) {
      const v = f.expiry ? parseExpiry(f.expiry) : null;
      if (f.expiry && !v) errors.push(`${label}: hạn dùng không hợp lệ.`);
      else if (v !== u.expiry) patch.expiry = v;
    }
    if (f.boughtAt !== undefined) {
      const v = dateOrNull(f.boughtAt);
      if (v === undefined) errors.push(`${label}: ngày mua không hợp lệ.`);
      else if (v !== u.boughtAt) patch.boughtAt = v;
    }
    if (f.unitCostJpy !== undefined) {
      const raw = f.unitCostJpy.replace(/[^\d]/g, "");
      const v = raw ? Number.parseInt(raw, 10) : null;
      if (v !== u.unitCostJpy) patch.unitCostJpy = v;
    }
    if (f.billCode !== undefined && f.billCode !== u.receiptCode) patch.receiptId = receiptIdForCode(f.billCode, opts.batchId ?? u.batchId);
    if (Object.keys(patch).length) {
      editUnitsSync(db, ids, patch, { actor: opts.actor });
      touched.push(...ids);
      changed++;
    }
    if (f.status && isPurchaseStatus(f.status)) {
      const rest = ids.filter((x) => !explicit.has(x) && byId.get(x)!.status !== f.status);
      if (rest.length) {
        moveUnitsSync(db, rest, f.status as PurchaseStatus, { actor: opts.actor });
        touched.push(...rest);
        changed++;
      }
    }
    // SL of the bill line: more → new units copied from the line; fewer → the free ones (not held, not boxed) go
    const qty = f.qty !== undefined ? Number.parseInt(f.qty, 10) : Number.NaN;
    if (Number.isInteger(qty) && qty >= 0 && qty !== ids.length) {
      if (qty > ids.length) {
        const made = createUnitsSync(db, {
          productId: patch.productId ?? u.productId,
          qty: qty - ids.length,
          status: u.status,
          receiptId: patch.receiptId === undefined ? u.receiptId : patch.receiptId,
          batchId: u.batchId,
          sourceKey: patch.sourceKey ?? u.sourceKey,
          store: patch.store ?? u.store,
          boughtAt: patch.boughtAt === undefined ? u.boughtAt : patch.boughtAt,
          expiry: patch.expiry === undefined ? u.expiry : patch.expiry,
          unitCostJpy: patch.unitCostJpy === undefined ? u.unitCostJpy : patch.unitCostJpy,
          origin: u.origin === "order" ? "bill" : u.origin,
          actor: opts.actor,
        });
        touched.push(...made);
      } else {
        const free = ids.map((x) => byId.get(x)!).filter((x) => !x.itemId && !x.shipmentId).sort((a, b) => b.id - a.id);
        const drop = free.slice(0, ids.length - qty).map((x) => x.id);
        if (drop.length < ids.length - qty) errors.push(`${label}: chỉ bớt được ${drop.length} cái (các cái còn lại đang giữ cho đơn / đã đóng chuyến).`);
        deleteUnitsSync(db, drop);
      }
      changed++;
    }
  }
  return { changed, errors, touched, productIds: [...productIds] };
}
