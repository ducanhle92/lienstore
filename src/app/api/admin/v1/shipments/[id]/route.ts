import { apiRouteWithParams, parseId, requirePermission } from "@/lib/api-http";
import { getPackShipment } from "@/lib/scan-pack";

export const dynamic = "force-dynamic";

/** GET /api/admin/v1/shipments/{id}/ — packing run summary + lines by product. */
export const GET = apiRouteWithParams<{ id: string }>({ scope: "inventory:read" }, async ({ principal }, { id }) => {
  requirePermission(principal, "packing");
  return { data: getPackShipment(parseId(id), principal.permissions) };
});
