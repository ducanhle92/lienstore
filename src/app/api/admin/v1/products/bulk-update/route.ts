import { ApiError, apiRoute, queryFlag, readJson } from "@/lib/api-http";
import { type BulkItem, bulkUpdateProducts, parseWriteInput } from "@/lib/product-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/v1/products/bulk-update/ — ATOMIC: all items are written in one transaction or none is.
 * Body: `{ "items": [{ "id": 2710, "version"?: "…", "set": { "price": 185000 } }, …] }`
 *    or `{ "ids": [1, 2], "set": { "status": "draft" } }` (same change for several products).
 * `?dryRun=1` → per-item before/after + an `apply` body that pins the versions it was computed from.
 */
export const POST = apiRoute({ scope: "products:write", write: true, idempotent: true }, async ({ req, principal, requestId, ip }) => {
  const body = (await readJson(req)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "BAD_REQUEST", 'Body: { "items": [...] } hoặc { "ids": [...], "set": {...} }.');
  let raw: Array<{ id: unknown; version?: unknown; set: unknown }>;
  if (Array.isArray(body.items)) raw = body.items as typeof raw;
  else if (Array.isArray(body.ids) && body.set) raw = (body.ids as unknown[]).map((id) => ({ id, set: body.set }));
  else throw new ApiError(400, "BAD_REQUEST", 'Body: { "items": [...] } hoặc { "ids": [...], "set": {...} }.');

  const items: BulkItem[] = [];
  const errors: Record<string, unknown> = {};
  raw.forEach((it, i) => {
    const id = typeof it?.id === "number" && Number.isInteger(it.id) && it.id > 0 ? it.id : null;
    if (!id) {
      errors[`items[${i}].id`] = "Phải là số nguyên > 0.";
      return;
    }
    if (it.version !== undefined && it.version !== null && typeof it.version !== "string") errors[`items[${i}].version`] = "Phải là chuỗi.";
    const { input, fields } = parseWriteInput(it.set);
    if (Object.keys(fields).length) errors[`items[${i}].set`] = fields;
    else if (!Object.keys(input).length) errors[`items[${i}].set`] = "Không có trường nào để cập nhật.";
    items.push({ id, version: (it.version as string | null | undefined) ?? null, set: input });
  });
  if (Object.keys(errors).length) throw new ApiError(422, "VALIDATION_FAILED", "Dữ liệu không hợp lệ — không ghi mục nào.", { fields: errors });
  const r = await bulkUpdateProducts(items, { dryRun: queryFlag(req, "dryRun") }, { actor: principal.actor, tokenId: principal.tokenId, requestId, ip, includeCost: principal.permissions.includes("see_cost") });
  return { data: r };
});
