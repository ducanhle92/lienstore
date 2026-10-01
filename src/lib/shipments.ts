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
  { key: "flying", label: "Đang vận chuyển JP→VN", short: "JP→VN", cls: "bg-indigo-100 text-indigo-800", location: { warehouse: "jp_carrier", inTransit: true } },
  { key: "arrived", label: "Đã về kho ĐVVC VN (Hà Nội)", short: "Kho ĐVVC VN", cls: "bg-purple-100 text-purple-800", location: { warehouse: "carrier", inTransit: false } },
  { key: "done", label: "Đã về kho shop VN", short: "Về kho VN", cls: "bg-green-100 text-green-800", location: { warehouse: "vn", inTransit: false } },
];

/**
 * The carrier's own five states (Kiến Express API) a handed-over run goes through — what ⑤ Vận chuyển JP-VN shows.
 * `run` is the shop-side status each state corresponds to; the API code is what the status check will compare later.
 */
export interface CarrierStep {
  api: "waiting" | "warehouse_jp" | "shipping" | "warehouse_hn" | "delivered";
  label: string;
  hint: string;
  run: ShipmentStatus;
}
export const CARRIER_STEPS: CarrierStep[] = [
  { api: "waiting", label: "Nhận yêu cầu", hint: "Đã tạo yêu cầu gửi; Kiến chưa xác nhận nhận hàng vào kho Nhật", run: "packed" },
  { api: "warehouse_jp", label: "Kho JP đang xử lý", hint: "Kiện đã vào kho Kiến Express Nhật (mã nội địa PU…)", run: "handed" },
  { api: "shipping", label: "Đang vận chuyển", hint: "Đang vận chuyển Nhật → Hà Nội (mã quốc tế KEA…)", run: "flying" },
  { api: "warehouse_hn", label: "Kho HN đang xử lý", hint: "Kiện đã về kho Kiến Express Hà Nội", run: "arrived" },
  { api: "delivered", label: "Đã giao hàng xong", hint: "Kiến báo đã giao; đối chiếu bước nhận ở kho shop VN", run: "done" },
];
/** Index of the carrier step a run is at (−1 while still packing at the shop). */
export function carrierStepIndex(s: ShipmentStatus): number {
  const i = CARRIER_STEPS.findIndex((c) => c.run === s);
  if (i >= 0) return i;
  return shipmentIndex(s) > shipmentIndex("packed") ? CARRIER_STEPS.length - 1 : -1;
}
/** Shop-side status for a carrier API state (for the status check job). */
export function runStatusForCarrier(api: string): ShipmentStatus | null {
  return CARRIER_STEPS.find((c) => c.api === api)?.run ?? null;
}

export function isShipmentStatus(v: unknown): v is ShipmentStatus {
  return typeof v === "string" && SHIPMENT_STAGES.some((s) => s.key === v);
}
export function shipmentIndex(s: ShipmentStatus): number {
  return SHIPMENT_STAGES.findIndex((x) => x.key === s);
}
export function shipmentStage(s: ShipmentStatus): ShipmentStage {
  return SHIPMENT_STAGES[shipmentIndex(s)] ?? SHIPMENT_STAGES[0];
}
/** The run is still at the shop (packing or packed): can be deleted, moved back, and is listed under ④. */
export function shipmentEditable(s: ShipmentStatus): boolean {
  return shipmentIndex(s) <= shipmentIndex("packed");
}
/** Goods can be added / taken out only while packing; "Đã đóng xong" is the lock (Khoá) — reopen to change the contents. */
export function shipmentOpen(s: ShipmentStatus): boolean {
  return s === "packing";
}
/** CH-yymmdd-nn */
export function shipmentCode(date: string, seq: number): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  return `CH-${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}-${String(seq).padStart(2, "0")}`;
}
