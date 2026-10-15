import { ApiError, apiRouteWithParams, parseId, readJson } from "@/lib/api-http";
import { linkBarcode, listBarcodes } from "@/lib/barcodes-db";

export const dynamic = "force-dynamic";

type Params = { id: string };

/** GET /api/admin/v1/products/{id}/barcodes/?all=1 — codes linked to the product (all = with unlinked ones). */
export const GET = apiRouteWithParams<Params>({ scope: "products:read" }, async ({ req }, { id }) => ({
  data: listBarcodes(parseId(id), req.nextUrl.searchParams.get("all") === "1"),
}));

/** POST /api/admin/v1/products/{id}/barcodes/ — `{ code, packQty?, packLabel?, note?, force? }`. */
export const POST = apiRouteWithParams<Params>({ scope: "products:write", write: true, idempotent: true }, async ({ req, principal, requestId, ip }, { id }) => {
  const body = (await readJson(req)) as Record<string, unknown>;
  if (!body || typeof body !== "object" || typeof body.code !== "string") throw new ApiError(422, "VALIDATION_FAILED", "Cần trường code (chuỗi).", { fields: { code: "Phải là chuỗi." } });
  if (body.packQty !== undefined && typeof body.packQty !== "number") throw new ApiError(422, "VALIDATION_FAILED", "packQty phải là số.", { fields: { packQty: "Phải là số nguyên." } });
  const r = linkBarcode(
    { productId: parseId(id), code: body.code, packQty: body.packQty as number | undefined, packLabel: typeof body.packLabel === "string" ? body.packLabel : "", note: typeof body.note === "string" ? body.note : "", force: body.force === true },
    { actor: principal.actor, tokenId: principal.tokenId, requestId, ip },
  );
  return { status: r.status === "created" ? 201 : 200, data: r };
});
