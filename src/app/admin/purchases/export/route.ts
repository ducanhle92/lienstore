import { NextResponse } from "next/server";
import { can } from "@/lib/auth";
import { getAllProducts } from "@/lib/db";
import { getCurrentPurchaseNeeds, PURCHASE_CSV_HEADER, purchaseCsv, purchaseCsvRows } from "@/lib/purchase-export";
import { getDb } from "@/lib/sqlite";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await can("purchases"))) return new NextResponse("Unauthorized", { status: 401 });
  const products = new Map((await getAllProducts(true)).map((p) => [p.id, p]));
  const rows = purchaseCsvRows(getCurrentPurchaseNeeds(getDb()), (id) => {
    const p = products.get(id);
    return p ? { name: p.name, sku: p.sku ?? "", costPrice: p.costPrice ?? null, supplierUrl: p.supplierUrl ?? "" } : undefined;
  });
  const csv = purchaseCsv([PURCHASE_CSV_HEADER, ...rows]);
  return new NextResponse(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="lienstore-can-mua-${new Date().toISOString().slice(0, 10)}.csv"`,
    "Cache-Control": "no-store",
  } });
}
