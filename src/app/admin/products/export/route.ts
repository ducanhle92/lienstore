import { type NextRequest, NextResponse } from "next/server";
import { can } from "@/lib/auth";
import { getAllProducts, getCategories } from "@/lib/db";
import { filterProducts } from "@/lib/product-filter";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** CSV of the product list with the same filters as the admin page (for printing / stock-taking). */
export async function GET(req: NextRequest) {
  if (!(await can("products"))) return new NextResponse("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const [all, categories] = await Promise.all([getAllProducts(true), getCategories()]);
  const catName = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const items = filterProducts(all, sp);
  const header = ["ID", "SKU", "Tên sản phẩm", "Danh mục", "Hình thức", "Giá bán (VNĐ)", "Giá gốc (VNĐ)", "Giá vốn (VNĐ)", "Số lượng tồn", "Tình trạng", "Trạng thái", "Cân (g)", "Kích thước (cm)", "Link mua", "Đường dẫn", "Cập nhật"];
  const rows = items.map((p) => [
    p.id,
    p.sku ?? "",
    p.name,
    p.categories.map((c) => catName[c] ?? c).join(", "),
    p.fulfillment === "order" ? "Order" : "Lưu kho",
    p.price,
    p.regularPrice ?? "",
    p.costPrice ?? "",
    p.stock ?? "",
    p.stockStatus === "outofstock" ? "Hết hàng" : "Còn hàng",
    p.status === "publish" ? "Đang bán" : "Bản nháp",
    p.weightG ?? "",
    p.dimsCm ?? "",
    p.supplierUrl ?? "",
    `/product/${p.slug}/`,
    p.updatedAt.slice(0, 10),
  ]);
  const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lienstore-san-pham-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
