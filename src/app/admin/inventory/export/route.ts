import { type NextRequest, NextResponse } from "next/server";
import { can } from "@/lib/auth";
import { getCategories } from "@/lib/db";
import { getInventory, type InventoryLine } from "@/lib/inventory";
import { applyInventoryView, parseInventoryView } from "@/lib/inventory-view";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const STATE: Record<InventoryLine["state"], string> = { ok: "Còn hàng", low: "Sắp hết", out: "Hết hàng", untracked: "Không theo dõi" };

/**
 * CSV export of the inventory.
 *  - default (`mode` absent): everything that needs to be bought (open-order demand + low-stock top-ups) for the buyer in Japan.
 *  - `mode=view` + the same query params as the inventory page: exactly the rows / order shown on screen — for stock-taking prints.
 */
export async function GET(req: NextRequest) {
  if (!(await can("inventory"))) return new NextResponse("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const [{ lines }, categories] = await Promise.all([getInventory(), getCategories()]);
  const catName = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const viewMode = sp.mode === "view";
  const rows = viewMode ? applyInventoryView(lines, parseInventoryView(sp)) : lines.filter((l) => l.toBuy > 0).sort((a, b) => b.toBuy - a.toBuy);
  const header = viewMode
    ? ["ID", "SKU", "Tên sản phẩm", "Danh mục", "Tình trạng", "Số lượng tồn", "Mức tối thiểu", "Đang về", "Tại kho shop", "Đơn mở cần", "Đơn hàng", "Cần mua", "Giá vốn (VNĐ)", "Giá trị tồn (VNĐ)", "Link mua", "Kiểm đếm thực tế", "Ghi chú"]
    : ["ID", "Tên sản phẩm", "SKU", "Cần mua", "Đơn mở cần", "Tổng hàng mua", "Đang về", "Tại kho shop", "Đơn hàng", "Tồn hiện tại", "Giá vốn (VNĐ)", "Tổng vốn (VNĐ)", "Link mua"];
  const data = rows.map((l) =>
    viewMode
      ? [
          l.product.id,
          l.product.sku ?? "",
          l.product.name,
          l.product.categories.map((c) => catName[c] ?? c).join(", "),
          STATE[l.state],
          l.product.stock ?? "",
          l.minStock,
          l.pipeline.inTransit,
          l.pipeline.atShop,
          l.demand,
          l.demandOrders.map((o) => `#${o.number}x${o.quantity}`).join(" "),
          l.toBuy,
          l.product.costPrice ?? "",
          l.stockValue || "",
          l.product.supplierUrl ?? "",
          "",
          "",
        ]
      : [
          l.product.id,
          l.product.name,
          l.product.sku ?? "",
          l.toBuy,
          l.demand,
          l.toBuy + l.pipeline.pipeline,
          l.pipeline.inTransit,
          l.pipeline.atShop,
          l.demandOrders.map((o) => `#${o.number}x${o.quantity}`).join(" "),
          l.product.stock ?? "",
          l.product.costPrice ?? "",
          l.toBuy * (l.product.costPrice ?? 0),
          l.product.supplierUrl ?? "",
        ],
  );
  const csv = "﻿" + [header, ...data].map((r) => r.map(esc).join(",")).join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${viewMode ? "lienstore-ton-kho" : "lienstore-can-dat-hang"}-${stamp}.csv"`,
    },
  });
}

