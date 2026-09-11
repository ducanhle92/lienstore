import { type NextRequest, NextResponse } from "next/server";
import { can } from "@/lib/auth";
import { getAllProducts, getImportQuoteConfig, getJpyRate, getPricingConfig } from "@/lib/db";
import { suggestPrice } from "@/lib/pricing";
import { productToCsvRow, toCsv } from "@/lib/product-csv";
import { filterProducts } from "@/lib/product-filter";

export const dynamic = "force-dynamic";

/** CSV of the product list (same filters as the page) with every editable field — edit in Excel, re-import on the same page. */
export async function GET(req: NextRequest) {
  if (!(await can("products"))) return new NextResponse("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const [all, rate, pricing, quote] = await Promise.all([getAllProducts(true), getJpyRate(), getPricingConfig(), getImportQuoteConfig()]);
  const rows = filterProducts(all, sp).map((p) => productToCsvRow(p, rate, pricing.marginPct, suggestPrice({ costPrice: p.costPrice, weightG: p.weightG, dimsCm: p.dimsCm, dimsConfidence: p.dimsConfidence, marginPct: p.marginPct, categories: p.categories }, quote, pricing)));
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lienstore-san-pham-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
