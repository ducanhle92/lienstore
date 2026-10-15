import { NextResponse } from "next/server";
import { can } from "@/lib/auth";
import { getAllProducts } from "@/lib/db";
import { getCurrentPurchaseNeeds, purchaseCsv } from "@/lib/purchase-export";
import { getDb } from "@/lib/sqlite";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await can("purchases"))) return new NextResponse("Unauthorized", { status: 401 });
  const products = new Map((await getAllProducts(true)).map((p) => [p.id, p]));
  const rows = getCurrentPurchaseNeeds(getDb()).map((n) => {
    const p = products.get(n.productId);
    return [n.productId, p?.name ?? `Sản phẩm #${n.productId}`, p?.sku ?? "", n.quantity,
      n.orderQuantity, n.stockQuantity, n.orders.join(" "), p?.costPrice ?? "",
      p?.costPrice == null ? "" : n.quantity * p.costPrice, p?.supplierUrl ?? ""];
  });
  const csv = purchaseCsv([
    ["ID", "Tên sản phẩm", "SKU", "Cần mua", "Còn thiếu theo đơn", "Dự định mua lưu kho", "Đơn hàng", "Giá vốn (VNĐ)", "Tổng vốn (VNĐ)", "Link mua"], ...rows,
  ]);
  return new NextResponse(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="lienstore-can-mua-${new Date().toISOString().slice(0, 10)}.csv"`,
    "Cache-Control": "no-store",
  } });
}
