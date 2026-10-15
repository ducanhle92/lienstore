import { apiRouteWithParams, parseId } from "@/lib/api-http";
import { getProductStock } from "@/lib/barcodes-db";

export const dynamic = "force-dynamic";

/** GET /api/admin/v1/products/{id}/stock/ — stock by warehouse / expiry, held for orders, incoming (read-only). */
export const GET = apiRouteWithParams<{ id: string }>({ scope: "inventory:read" }, async ({ principal }, { id }) => ({
  data: getProductStock(parseId(id), { seePrices: principal.permissions.includes("see_prices") }),
}));
