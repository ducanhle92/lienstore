import { NextResponse, type NextRequest } from "next/server";
import { authorizeBasic, can } from "@/lib/auth";
import { exportCatalogue } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/export — the live catalogue (products, categories, pages, posts) in seed.json format.
 * Auth: admin session with the "products" module, or HTTP Basic with the env admin credentials (for scripts, e.g.
 * `scripts/sync-from-prod.mjs`). Customers and orders are never included.
 */
export async function GET(req: NextRequest) {
  const ok = authorizeBasic(req.headers.get("authorization")) || (await can("products"));
  if (!ok) return new NextResponse("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="lienstore-admin"' } });
  const seed = await exportCatalogue();
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(seed, null, 1), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="lienstore-seed-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
