import { apiRouteWithParams, parseId, readJson, requirePermission } from "@/lib/api-http";
import { packIntoShipment } from "@/lib/scan-pack";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/v1/shipments/{id}/pack/ — supermarket-style pack into an open run.
 * Body: `{ code?, productId?, qty? }` — qty defaults to 1 (pieces; JAN does not × packQty).
 */
export const POST = apiRouteWithParams<{ id: string }>({ scope: "inventory:write", write: true, idempotent: true }, async ({ req, principal }, { id }) => {
  requirePermission(principal, "packing");
  const body = (await readJson(req)) as Record<string, unknown>;
  const code = typeof body.code === "string" ? body.code : undefined;
  const productId = typeof body.productId === "number" ? body.productId : typeof body.productId === "string" && /^\d+$/.test(body.productId) ? Number(body.productId) : undefined;
  const qty = typeof body.qty === "number" ? body.qty : typeof body.qty === "string" && /^\d+$/.test(body.qty) ? Number(body.qty) : undefined;
  return { data: packIntoShipment(parseId(id), { code, productId, qty }, principal.permissions, principal.actor) };
});
