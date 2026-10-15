import { ApiError, apiRouteWithParams, parseId, queryFlag, readJson } from "@/lib/api-http";
import { getProductForApi, parseFieldList, parseWriteInput, pickFields, updateProduct } from "@/lib/product-service";

export const dynamic = "force-dynamic";

type Params = { id: string };

/** GET /api/admin/v1/products/{id}/ — full product (or `fields=`), with its `version`. */
export const GET = apiRouteWithParams<Params>({ scope: "products:read" }, async ({ req, principal }, { id }) => {
  const includeCost = principal.permissions.includes("see_cost");
  const { fields, unknown } = parseFieldList(req.nextUrl.searchParams.get("fields"), includeCost);
  if (unknown.length) throw new ApiError(400, "BAD_REQUEST", `Trường không tồn tại: ${unknown.join(", ")}.`);
  const p = await getProductForApi(parseId(id), includeCost);
  return { data: pickFields(p, fields) };
});

/**
 * PATCH /api/admin/v1/products/{id}/ — change only the fields sent. Pin the version you read with `If-Match: <version>`
 * (or `"version"` in the body) to get 409 VERSION_CONFLICT instead of overwriting a newer edit. `?dryRun=1` = preview.
 */
export const PATCH = apiRouteWithParams<Params>({ scope: "products:write", write: true, idempotent: true }, async ({ req, principal, requestId, ip }, { id }) => {
  const body = await readJson(req);
  const bodyVersion = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).version : undefined;
  if (bodyVersion !== undefined && typeof bodyVersion !== "string") throw new ApiError(422, "VALIDATION_FAILED", "version phải là chuỗi.", { fields: { version: "Phải là chuỗi." } });
  const ifMatch = req.headers.get("if-match")?.replace(/^W\//, "").replace(/"/g, "").trim() || null;
  if (ifMatch && bodyVersion && ifMatch !== bodyVersion) throw new ApiError(400, "BAD_REQUEST", "If-Match và version trong body khác nhau.");
  const { input, fields } = parseWriteInput(body, ["version"]);
  if (Object.keys(fields).length) throw new ApiError(422, "VALIDATION_FAILED", "Dữ liệu không hợp lệ.", { fields });
  if (!Object.keys(input).length) throw new ApiError(400, "BAD_REQUEST", "Không có trường nào để cập nhật.");
  const r = await updateProduct(parseId(id), input, { expectedVersion: ifMatch ?? (bodyVersion as string | undefined) ?? null, dryRun: queryFlag(req, "dryRun") }, { actor: principal.actor, tokenId: principal.tokenId, requestId, ip, includeCost: principal.permissions.includes("see_cost") });
  return { data: r };
});
