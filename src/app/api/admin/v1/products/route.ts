import { ApiError, apiRoute, queryFlag, readJson } from "@/lib/api-http";
import { createProduct, LIST_DEFAULT_FIELDS, LIST_SORTS, listProducts, parseFieldList, parseWriteInput, pickFields, type ProductListQuery, toApiProduct } from "@/lib/product-service";

export const dynamic = "force-dynamic";

const int = (raw: string | null, name: string): number | undefined => {
  if (raw === null || raw === "") return undefined;
  if (!/^\d+$/.test(raw)) throw new ApiError(400, "BAD_REQUEST", `Tham số ${name} phải là số nguyên ≥ 0.`);
  return Number.parseInt(raw, 10);
};

/**
 * GET /api/admin/v1/products/ — search / filter / paginate.
 * Query: search (q), category, status (publish|draft|all), saleStatus, sku, ids (1,2,3), hasImage, priceMin, priceMax,
 * updatedSince (ISO), sort (id|-id|name|price|updated|created, "-" = desc; default -updated), page, perPage (≤200),
 * fields (comma list or "all"; default a compact set).
 */
export const GET = apiRoute({ scope: "products:read" }, async ({ req, principal }) => {
  const sp = req.nextUrl.searchParams;
  const includeCost = principal.permissions.includes("see_cost");
  const { fields, unknown } = parseFieldList(sp.get("fields") ?? LIST_DEFAULT_FIELDS.join(","), includeCost);
  if (unknown.length) throw new ApiError(400, "BAD_REQUEST", `Trường không tồn tại: ${unknown.join(", ")}.`);
  const status = sp.get("status") ?? "all";
  if (!["publish", "draft", "all"].includes(status)) throw new ApiError(400, "BAD_REQUEST", "status: publish | draft | all.");
  const saleStatus = sp.get("saleStatus");
  if (saleStatus && saleStatus !== "instock" && saleStatus !== "discontinued") throw new ApiError(400, "BAD_REQUEST", "saleStatus: instock | discontinued.");
  const sort = sp.get("sort") ?? "-updated";
  if (!(LIST_SORTS as readonly string[]).includes(sort)) throw new ApiError(400, "BAD_REQUEST", `sort: ${LIST_SORTS.join(" | ")}.`);
  const idsRaw = sp.get("ids");
  const ids = idsRaw ? idsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (ids.some((s) => !/^\d+$/.test(s))) throw new ApiError(400, "BAD_REQUEST", "ids: danh sách số, cách nhau bởi dấu phẩy.");
  const hasImageRaw = sp.get("hasImage");
  const updatedSince = sp.get("updatedSince") ?? undefined;
  if (updatedSince && Number.isNaN(Date.parse(updatedSince))) throw new ApiError(400, "BAD_REQUEST", "updatedSince phải là ngày ISO, ví dụ 2026-10-01.");
  const q: ProductListQuery = {
    search: sp.get("search") ?? sp.get("q") ?? undefined,
    category: sp.get("category") ?? undefined,
    status: status as ProductListQuery["status"],
    saleStatus: (saleStatus ?? undefined) as ProductListQuery["saleStatus"],
    sku: sp.get("sku") ?? undefined,
    ids: ids.map(Number),
    hasImage: hasImageRaw === null ? undefined : hasImageRaw === "1" || hasImageRaw === "true",
    priceMin: int(sp.get("priceMin"), "priceMin"),
    priceMax: int(sp.get("priceMax"), "priceMax"),
    updatedSince: updatedSince ? new Date(updatedSince).toISOString() : undefined,
    sort,
    page: int(sp.get("page"), "page"),
    perPage: int(sp.get("perPage"), "perPage"),
  };
  const r = await listProducts(q);
  return {
    data: r.items.map((p) => pickFields(toApiProduct(p, { includeCost }), fields)),
    meta: { total: r.total, page: r.page, perPage: r.perPage, totalPages: r.totalPages },
  };
});

/**
 * POST /api/admin/v1/products/ — create. Body: product fields (name + categories required). Query: dryRun=1,
 * allowDuplicateSku=1. Send `Idempotency-Key` so a retried request returns the first result instead of a duplicate.
 */
export const POST = apiRoute({ scope: "products:write", write: true, idempotent: true }, async ({ req, principal, requestId, ip }) => {
  const { input, fields } = parseWriteInput(await readJson(req));
  if (Object.keys(fields).length) throw new ApiError(422, "VALIDATION_FAILED", "Dữ liệu không hợp lệ.", { fields });
  const r = await createProduct(input, { dryRun: queryFlag(req, "dryRun"), allowDuplicateSku: queryFlag(req, "allowDuplicateSku") }, { actor: principal.actor, tokenId: principal.tokenId, requestId, ip, includeCost: principal.permissions.includes("see_cost") });
  return { status: r.created ? 201 : 200, data: r };
});
