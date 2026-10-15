import { apiRouteWithParams, parseId } from "@/lib/api-http";
import { unlinkBarcode } from "@/lib/barcodes-db";

export const dynamic = "force-dynamic";

/** DELETE /api/admin/v1/barcodes/{id}/ — stop using a code link (kept for history). */
export const DELETE = apiRouteWithParams<{ id: string }>({ scope: "products:write", write: true }, async ({ principal, requestId, ip }, { id }) => ({
  data: unlinkBarcode(parseId(id), { actor: principal.actor, tokenId: principal.tokenId, requestId, ip }),
}));
