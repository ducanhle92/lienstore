import { type NextRequest, NextResponse } from "next/server";
import { can } from "@/lib/auth";
import { getAllProducts, getJpyRate, getPricingConfig } from "@/lib/db";
import { productToCsvRow, toCsv } from "@/lib/product-csv";
import { filterProducts } from "@/lib/product-filter";

export const dynamic = "force-dynamic";

/** CSV of the product list (same filters as the page) with every editable field — edit in Excel, re-import on the same page. */
export async function GET(req: NextRequest) {
  if (!(await can("products"))) return new NextResponse("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const [all, rate, pricing] = await Promise.all([getAllProducts(true), getJpyRate(), getPricingConfig()]);
  const rows = filterProducts(all, sp).map((p) => productToCsvRow(p, rate, pricing.marginPct));
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lienstore-san-pham-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
