import { apiRouteWithParams, parseId, readJson, requirePermission } from "@/lib/api-http";
import { unpackFromShipment } from "@/lib/scan-pack";

export const dynamic = "force-dynamic";

/** POST /api/admin/v1/shipments/{id}/unpack/ — `{ productId, qty? }` or `{ unitIds: number[] }`. */
export const POST = apiRouteWithParams<{ id: string }>({ scope: "inventory:write", write: true, idempotent: true }, async ({ req, principal }, { id }) => {
  requirePermission(principal, "packing");
  const body = (await readJson(req)) as Record<string, unknown>;
  const productId = typeof body.productId === "number" ? body.productId : typeof body.productId === "string" && /^\d+$/.test(body.productId) ? Number(body.productId) : undefined;
  const qty = typeof body.qty === "number" ? body.qty : typeof body.qty === "string" && /^\d+$/.test(body.qty) ? Number(body.qty) : undefined;
  const unitIds = Array.isArray(body.unitIds) ? body.unitIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0) : undefined;
  return { data: unpackFromShipment(parseId(id), { productId, qty, unitIds }, principal.permissions, principal.actor) };
});
