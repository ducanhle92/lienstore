import "server-only";
import { ApiError, type ApiContext, apiRoute, apiRouteWithParams, parseId, readJson } from "@/lib/api-http";
import { isShopWarehouse } from "@/lib/scan-access";
import { addLine, cancelDoc, confirmDoc, createDoc, type DocCtx, type DocKind, type DocStatus, getDoc, listDocs, removeLine, scanIntoDoc, undoScan, updateLine } from "@/lib/scan-docs";

/**
 * Route handlers shared by the three scan document families (thin: parse → lib/scan-docs → envelope):
 *   /api/admin/v1/stock-receipts/…  (receive)   /stock-counts/… (count)   /picks/… (pick)
 * Reads need inventory:read, writes inventory:write; the services then check the warehouse / delivery permission.
 */
const ctxOf = ({ principal, requestId, ip }: ApiContext): DocCtx => ({ actor: principal.actor, permissions: principal.permissions, tokenId: principal.tokenId, requestId, ip });
const obj = async (c: ApiContext): Promise<Record<string, unknown>> => {
  const b = await readJson(c.req);
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new ApiError(400, "BAD_REQUEST", "Body phải là JSON object.");
  return b as Record<string, unknown>;
};
/** Body is optional for these actions (an empty POST is fine). */
const optObj = async (c: ApiContext): Promise<Record<string, unknown>> => ((c.req.headers.get("content-length") ?? "0") === "0" ? {} : obj(c));

type IdP = { id: string };
type LineP = { id: string; lineId: string };

export function docRoutes(kind: DocKind) {
  return {
    list: apiRoute({ scope: "inventory:read" }, async ({ req }) => {
      const sp = req.nextUrl.searchParams;
      const status = (sp.get("status") ?? "draft") as DocStatus | "all";
      if (!["draft", "confirmed", "cancelled", "all"].includes(status)) throw new ApiError(400, "BAD_REQUEST", "status: draft | confirmed | cancelled | all.");
      const wh = sp.get("warehouse");
      if (wh && !isShopWarehouse(wh)) throw new ApiError(400, "BAD_REQUEST", "warehouse: vn | jp.");
      return { data: listDocs(kind, { status, warehouse: wh ? (wh as "vn" | "jp") : undefined, limit: Number.parseInt(sp.get("limit") ?? "30", 10) || 30 }) };
    }),
    create: apiRoute({ scope: "inventory:write", write: true, idempotent: true }, async (c) => ({ status: 201, data: createDoc(kind, await obj(c), ctxOf(c)) })),
    get: apiRouteWithParams<IdP>({ scope: "inventory:read" }, async (_c, { id }) => ({ data: getDoc(kind, parseId(id)) })),
    scan: apiRouteWithParams<IdP>({ scope: "inventory:write", write: true }, async (c, { id }) => {
      const b = await obj(c);
      return { data: scanIntoDoc(kind, parseId(id), { code: b.code, opId: b.opId, qty: b.qty }, ctxOf(c)) };
    }),
    addLine: apiRouteWithParams<IdP>({ scope: "inventory:write", write: true, idempotent: true }, async (c, { id }) => ({ status: 201, data: addLine(kind, parseId(id), await obj(c), ctxOf(c)) })),
    updateLine: apiRouteWithParams<LineP>({ scope: "inventory:write", write: true }, async (c, { id, lineId }) => ({ data: updateLine(kind, parseId(id), parseId(lineId), await obj(c), ctxOf(c)) })),
    removeLine: apiRouteWithParams<LineP>({ scope: "inventory:write", write: true }, async (c, { id, lineId }) => ({ data: removeLine(kind, parseId(id), parseId(lineId), ctxOf(c)) })),
    undo: apiRouteWithParams<IdP>({ scope: "inventory:write", write: true }, async (c, { id }) => ({ data: undoScan(kind, parseId(id), await optObj(c), ctxOf(c)) })),
    confirm: apiRouteWithParams<IdP>({ scope: "inventory:write", write: true, idempotent: true }, async (c, { id }) => ({ data: confirmDoc(kind, parseId(id), await obj(c), ctxOf(c)) })),
    cancel: apiRouteWithParams<IdP>({ scope: "inventory:write", write: true, idempotent: true }, async (c, { id }) => ({ data: cancelDoc(kind, parseId(id), ctxOf(c)) })),
  };
}
