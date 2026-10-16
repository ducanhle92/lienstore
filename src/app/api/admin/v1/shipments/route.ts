import { ApiError, apiRoute, readJson, requirePermission } from "@/lib/api-http";
import { createPackShipment, listEditableShipments } from "@/lib/scan-pack";

export const dynamic = "force-dynamic";

/** GET /api/admin/v1/shipments/?editable=1 — open packing runs (Đóng hàng JP). */
export const GET = apiRoute({ scope: "inventory:read" }, async ({ req, principal }) => {
  requirePermission(principal, "packing");
  const editable = req.nextUrl.searchParams.get("editable");
  if (editable !== "1" && editable !== "true") throw new ApiError(400, "BAD_REQUEST", 'Dùng ?editable=1 để lấy chuyến còn đóng được.');
  return { data: listEditableShipments(principal.permissions) };
});

/** POST /api/admin/v1/shipments/ — create a packing run { label?, note? }. */
export const POST = apiRoute({ scope: "inventory:write", write: true, idempotent: true }, async ({ req, principal }) => {
  requirePermission(principal, "packing");
  const body = (await readJson(req)) as Record<string, unknown>;
  const data = createPackShipment(
    { label: typeof body.label === "string" ? body.label : "", note: typeof body.note === "string" ? body.note : "" },
    principal.permissions,
    principal.actor,
  );
  return { status: 201, data };
});
