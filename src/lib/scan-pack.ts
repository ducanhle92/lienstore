import "server-only";
import { resolveCode } from "@/lib/barcodes-db";
import { DomainError } from "@/lib/service-error";
import {
  createShipment,
  getShipmentPackView,
  listOpenShipments,
  packProduct,
  packUnits,
  unpackProduct,
  unpackUnits,
  type PackLineView,
} from "@/lib/shipments-db";
import { getUnitByCode } from "@/lib/units-db";
import { getDb } from "@/lib/sqlite";

/**
 * Phone “Đóng hàng JP”: pack / unpack units into an open packing run via JAN / mã H / product id.
 * Each successful pack writes immediately (not a draft scan doc) — FEFO via packProduct.
 */

function requirePacking(permissions: string[]): void {
  if (!permissions.includes("packing")) throw new DomainError(403, "FORBIDDEN", "Tài khoản không có quyền ④ Đóng hàng JP.");
}

export function listEditableShipments(permissions: string[]) {
  requirePacking(permissions);
  return listOpenShipments().map((s) => ({
    id: s.id,
    code: s.code,
    label: s.label,
    status: s.status,
    title: s.label ? `${s.code} · ${s.label}` : s.code,
  }));
}

export function createPackShipment(input: { label?: string; note?: string }, permissions: string[], actor: string) {
  requirePacking(permissions);
  const sh = createShipment({ label: (input.label ?? "").trim() || `Đóng ${new Date().toLocaleDateString("vi-VN")}`, plannedAt: null, note: (input.note ?? "").trim() });
  void actor;
  return getShipmentPackView(sh.id)!;
}

export function getPackShipment(id: number, permissions: string[]) {
  requirePacking(permissions);
  const v = getShipmentPackView(id);
  if (!v) throw new DomainError(404, "NOT_FOUND", `Không tìm thấy chuyến #${id}.`);
  return v;
}

export function packIntoShipment(
  shipmentId: number,
  input: { code?: string; productId?: number; qty?: number },
  permissions: string[],
  actor: string,
): { ok: true; message: string; units: number; productId: number | null; shipment: NonNullable<ReturnType<typeof getShipmentPackView>> } {
  requirePacking(permissions);
  const qty = input.qty === undefined ? 1 : input.qty;
  if (!Number.isInteger(qty) || qty <= 0) throw new DomainError(422, "VALIDATION_FAILED", "Số lượng phải là số nguyên > 0.", { fields: { qty: "> 0" } });

  let productId: number | null = null;
  let result: { ok: boolean; message: string; units: number };

  if (input.code !== undefined && String(input.code).trim()) {
    const res = resolveCode(String(input.code));
    if (res.kind === "invalid" || res.kind === "unsupported_qr") throw new DomainError(422, "INVALID_CODE", res.message);
    if (res.kind === "unknown") throw new DomainError(404, "UNKNOWN_CODE", res.message);
    if (res.kind === "conflict") throw new DomainError(409, "CODE_CONFLICT", res.message, { candidates: res.candidates });
    if (res.kind === "unit") {
      productId = res.product.id;
      const u = getUnitByCode(getDb(), res.code);
      if (!u || u.removed) throw new DomainError(404, "UNKNOWN_CODE", `Không tìm thấy cái ${res.code}.`);
      if (u.shipmentId === shipmentId) {
        result = { ok: true, message: `Cái ${res.code} đã nằm trong chuyến này.`, units: 0 };
      } else {
        result = packUnits(shipmentId, [u.id], actor);
        if (!result.ok) throw new DomainError(409, "PACK_FAILED", result.message);
      }
    } else {
      // product JAN / SKU — supermarket: each scan packs `qty` pieces (not × packQty)
      productId = res.product.id;
      result = packProduct(shipmentId, res.product.id, qty, actor);
      if (!result.ok) throw new DomainError(409, "PACK_FAILED", result.message);
    }
  } else if (input.productId !== undefined) {
    if (!Number.isInteger(input.productId) || input.productId <= 0) throw new DomainError(422, "VALIDATION_FAILED", "productId không hợp lệ.", { fields: { productId: "> 0" } });
    productId = input.productId;
    result = packProduct(shipmentId, input.productId, qty, actor);
    if (!result.ok) throw new DomainError(409, "PACK_FAILED", result.message);
  } else {
    throw new DomainError(422, "VALIDATION_FAILED", "Cần code hoặc productId.", { fields: { code: "…", productId: "…" } });
  }

  const shipment = getShipmentPackView(shipmentId);
  if (!shipment) throw new DomainError(404, "NOT_FOUND", `Không tìm thấy chuyến #${shipmentId}.`);
  const line = productId ? shipment.lines.find((l) => l.productId === productId) : undefined;
  const total = line?.qty ?? 0;
  const message = result.units > 0 ? `${result.message} · tổng trong chuyến: ${total} cái` : result.message;
  return { ok: true, message, units: result.units, productId, shipment };
}

export function unpackFromShipment(
  shipmentId: number,
  input: { productId?: number; unitIds?: number[]; qty?: number },
  permissions: string[],
  actor: string,
): { ok: true; message: string; units: number; shipment: NonNullable<ReturnType<typeof getShipmentPackView>> } {
  requirePacking(permissions);
  let result: { ok: boolean; message: string; units?: number };

  if (Array.isArray(input.unitIds) && input.unitIds.length) {
    const ids = input.unitIds.filter((n) => Number.isInteger(n) && n > 0);
    result = unpackUnits(ids, actor);
    if (!result.ok) throw new DomainError(409, "UNPACK_FAILED", result.message);
    result = { ...result, units: ids.length };
  } else if (input.productId !== undefined) {
    const qty = input.qty === undefined ? 1 : input.qty;
    if (!Number.isInteger(qty) || qty <= 0) throw new DomainError(422, "VALIDATION_FAILED", "Số lượng phải là số nguyên > 0.", { fields: { qty: "> 0" } });
    result = unpackProduct(shipmentId, input.productId, qty, actor);
    if (!result.ok) throw new DomainError(409, "UNPACK_FAILED", result.message);
  } else {
    throw new DomainError(422, "VALIDATION_FAILED", "Cần productId (+ qty) hoặc unitIds.", { fields: { productId: "…", unitIds: "…" } });
  }

  const shipment = getShipmentPackView(shipmentId);
  if (!shipment) throw new DomainError(404, "NOT_FOUND", `Không tìm thấy chuyến #${shipmentId}.`);
  return { ok: true, message: result.message, units: result.units ?? 0, shipment };
}

export type { PackLineView };
