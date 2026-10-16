import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/admin/v1/ — public index of the Admin API (no data, no auth). Docs: docs/ADMIN_API.md. */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      data: {
        name: "lienstore admin API",
        version: "v1",
        docs: "docs/ADMIN_API.md",
        auth: "Authorization: Bearer lsk_… (cấp ở /admin/api-tokens/ hoặc `npm run api-token -- create`)",
        endpoints: [
          "GET    /api/admin/v1/me/",
          "GET    /api/admin/v1/products/",
          "POST   /api/admin/v1/products/",
          "GET    /api/admin/v1/products/{id}/",
          "PATCH  /api/admin/v1/products/{id}/",
          "POST   /api/admin/v1/products/bulk-update/",
          "POST   /api/admin/v1/media/",
          "GET    /api/admin/v1/categories/",
          "POST   /api/admin/v1/categories/",
          "GET    /api/admin/v1/categories/{slug}/",
          "PATCH  /api/admin/v1/categories/{slug}/",
          "GET    /api/admin/v1/audit/",
        ],
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
