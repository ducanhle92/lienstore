import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { loadShippingMethods } from "@/lib/db";
import type { ShippingLeg } from "@/lib/shipping";

/**
 * The carrier choice of one order leg ("<methodId>" | "pickup" | "" = keep), shared by ⑦ Giao hàng VN
 * (app/admin/shipping/order-actions.ts) and the phone pick document (lib/scan-docs.ts). Writes method + label + tracking
 * of the leg (fee / zone / note stay); returns the label written, null when nothing changed, "invalid" for an unknown id.
 */
export const PICKUP_LABEL = "Khách tự tới kho lấy";

export function legMethodOptions(db: DatabaseSync, leg: ShippingLeg): Array<{ value: string; label: string }> {
  return [
    ...loadShippingMethods(db, true)
      .filter((m) => m.leg === leg)
      .map((m) => ({ value: String(m.id), label: `${m.name}${m.carrierName && !m.name.includes(m.carrierName) ? ` (${m.carrierName})` : ""}` })),
    { value: "pickup", label: PICKUP_LABEL },
  ];
}

export function applyLegMethodSync(db: DatabaseSync, orderId: string, leg: ShippingLeg, choice: string, tracking?: string): string | null | "invalid" {
  if (!choice && tracking === undefined) return null;
  const cur = db.prepare("SELECT method_id, zone_id, label, fee, tracking, note FROM order_legs WHERE order_id = ? AND leg = ?").get(orderId, leg) as { method_id: number | null; zone_id: number | null; label: string; fee: number; tracking: string; note: string } | undefined;
  let methodId: number | null = cur?.method_id ?? null;
  let label = cur?.label ?? "";
  if (choice === "pickup") {
    methodId = null;
    label = PICKUP_LABEL;
  } else if (choice) {
    const opt = legMethodOptions(db, leg).find((o) => o.value === choice);
    if (!opt) return "invalid";
    methodId = Number(choice);
    label = opt.label;
  }
  if (cur && cur.method_id === methodId && cur.label === label && (tracking === undefined || tracking === cur.tracking)) return null;
  const zoneId = methodId && cur?.method_id === methodId ? (cur.zone_id ?? null) : null;
  db.prepare(
    `INSERT INTO order_legs (order_id, leg, method_id, zone_id, label, fee, tracking, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(order_id, leg) DO UPDATE SET method_id = excluded.method_id, zone_id = excluded.zone_id, label = excluded.label, tracking = excluded.tracking, updated_at = excluded.updated_at`,
  ).run(orderId, leg, methodId, zoneId, label, Math.max(0, Math.round(cur?.fee ?? 0)), tracking ?? cur?.tracking ?? "", cur?.note ?? "", new Date().toISOString());
  return label;
}
