import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { getOrderById } from "@/lib/db";
import { absolutePath, MIME_BY_EXT, verifyOrderFileToken } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const PUBLIC_DIRS = new Set(["products", "categories", "banners", "theme"]);

/**
 * Serves admin uploads stored outside `public/`:
 *   /api/files/products/…, /api/files/categories/…, /api/files/banners/…   public (product / category / banner images)
 *   /api/files/orders/<orderId>/…   admin, the order's customer, or anyone holding the signed `?t=` token from the order page
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const rel = parts.join("/");
  const abs = absolutePath(rel);
  if (!abs) return new NextResponse("Not found", { status: 404 });

  if (parts[0] === "orders") {
    const orderId = parts[1] ?? "";
    let allowed = await isAdmin();
    if (!allowed && verifyOrderFileToken(orderId, req.nextUrl.searchParams.get("t"))) allowed = true;
    if (!allowed) {
      const customer = await getCurrentCustomer();
      if (customer) {
        const order = await getOrderById(orderId);
        allowed = !!order && (order.customerId === customer.id || order.customer.email.trim().toLowerCase() === customer.email.toLowerCase());
      }
    }
    if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  } else if (!PUBLIC_DIRS.has(parts[0])) {
    return new NextResponse("Not found", { status: 404 });
  }

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(abs);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!stat.isFile()) return new NextResponse("Not found", { status: 404 });

  const mime = MIME_BY_EXT[path.extname(abs).toLowerCase()] ?? "application/octet-stream";
  const data = await fs.promises.readFile(abs);
  const isPublic = PUBLIC_DIRS.has(parts[0]);
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(stat.size),
      "Cache-Control": isPublic ? "public, max-age=86400, stale-while-revalidate=604800" : "private, no-store",
      "Content-Disposition": `inline; filename="${encodeURIComponent(path.basename(abs))}"`,
      "Last-Modified": stat.mtime.toUTCString(),
    },
  });
}
