import { ApiError, apiRoute } from "@/lib/api-http";
import { listAudit } from "@/lib/api-tokens";

export const dynamic = "force-dynamic";

/** GET /api/admin/v1/audit/?product=2710&limit=20 — API writes on products / media (who, when, before → after). */
export const GET = apiRoute({ scope: "products:read" }, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const product = sp.get("product");
  if (product && !/^\d+$/.test(product)) throw new ApiError(400, "BAD_REQUEST", "product phải là ID số.");
  const limit = Number.parseInt(sp.get("limit") ?? "50", 10) || 50;
  const rows = await listAudit({ target: product ? `product:${product}` : undefined, limit: product ? limit : limit * 2 });
  // token management rows (token.create / token.revoke) are only for the admin page
  return { data: rows.filter((r) => !r.action.startsWith("token.")).slice(0, limit) };
});
