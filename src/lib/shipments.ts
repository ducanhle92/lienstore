import type { Warehouse } from "./warehouses";

/**
 * Đóng hàng — a packing run from Kho Nhật (shop) to the carrier. Pure helpers (no DB) so they can be unit-tested and
 * shared with client components.
 */
export type ShipmentStatus = "packing" | "packed" | "handed" | "flying" | "arrived" | "done";

export interface ShipmentStage {
  key: ShipmentStatus;
  label: string;
  short: string;
  cls: string;
  /** Where the packed lots are once the shipment reaches this stage (null = still on the shop's shelf, boxed). */
  location: { warehouse: Warehouse; inTransit: boolean } | null;
}

export const SHIPMENT_STAGES: ShipmentStage[] = [
  { key: "packing", label: "Đang đóng hàng", short: "Đang đóng", cls: "bg-gray-200 text-gray-700", location: null },
  { key: "packed", label: "Đã đóng xong — chờ xuất cho ĐVVC", short: "Đã đóng xong", cls: "bg-amber-100 text-amber-800", location: null },
  { key: "handed", label: "Đã chuyển cho ĐVVC (kho Kiến Nhật)", short: "Đã giao ĐVVC", cls: "bg-sky-100 text-sky-800", location: { warehouse: "jp_carrier", inTransit: false } },
  { key: "flying", label: "Đang bay NB→VN", short: "NB→VN", cls: "bg-indigo-100 text-indigo-800", location: { warehouse: "jp_carrier", inTransit: true } },
  { key: "arrived", label: "Đã về kho ĐVVC VN (Hà Nội)", short: "Kho ĐVVC VN", cls: "bg-purple-100 text-purple-800", location: { warehouse: "carrier", inTransit: false } },
  { key: "done", label: "Đã về kho shop VN", short: "Về kho VN", cls: "bg-green-100 text-green-800", location: { warehouse: "vn", inTransit: false } },
];

export function isShipmentStatus(v: unknown): v is ShipmentStatus {
  return typeof v === "string" && SHIPMENT_STAGES.some((s) => s.key === v);
}
export function shipmentIndex(s: ShipmentStatus): number {
  return SHIPMENT_STAGES.findIndex((x) => x.key === s);
}
export function shipmentStage(s: ShipmentStatus): ShipmentStage {
  return SHIPMENT_STAGES[shipmentIndex(s)] ?? SHIPMENT_STAGES[0];
}
/** Lots can be added / taken out only while the boxes are still at the shop. */
export function shipmentEditable(s: ShipmentStatus): boolean {
  return shipmentIndex(s) <= shipmentIndex("packed");
}
/** CH-yymmdd-nn */
export function shipmentCode(date: string, seq: number): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  return `CH-${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}-${String(seq).padStart(2, "0")}`;
}
