import { type NextRequest, NextResponse } from "next/server";
import { can } from "@/lib/auth";
import { getCategories } from "@/lib/db";
import { getInventory, type InventoryLine, SALES_PACE_DAYS } from "@/lib/inventory";
import { applyInventoryView, parseInventoryView, warehouseOfPstatus } from "@/lib/inventory-view";
import { TRANSIT_LABEL, WAREHOUSE_LABEL } from "@/lib/warehouses";

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
  const view = parseInventoryView(sp);
  // a sheet exported for ONE warehouse counts that warehouse only; "Kho kiểm kê" tells the import which warehouse to update
  const sheetWh = viewMode ? warehouseOfPstatus(view.pstatus) : null;
  // the buyer's list: open-order / restock needs plus "mua lưu kho" slips not bought yet, biggest first
  const rows = viewMode ? applyInventoryView(lines, view) : lines.filter((l) => l.toBuy > 0 || l.plannedLot > 0).sort((a, b) => b.toBuy + b.plannedLot - (a.toBuy + a.plannedLot));
  const header = viewMode
    ? ["ID", "SKU", "Tên sản phẩm", "Danh mục", "Tình trạng", "Kho kiểm kê", "Số lượng tồn", "Tồn Kho Nhật", "Tồn Kho ĐVVC", "Tồn Kho Việt Nam", "Mức tối thiểu", "Đang về", "Đang về ở đâu", "Tại kho shop", "Đơn mở cần", "Đơn hàng", "Cần mua", "Giá vốn (VNĐ)", "Giá trị tồn (VNĐ)", "Link mua", "Kiểm đếm thực tế", "Ghi chú"]
    : [
        "ID", "Tên sản phẩm", "SKU", "Cần mua", "Đơn mở cần", "Đang về", "Tại kho shop", "Tồn hiện tại", "Tồn kho tiêu chuẩn",
        `Bán ra gần đây (${SALES_PACE_DAYS} ngày)`, "Dự trữ dự kiến sau bán", "Đơn hàng", "Giá vốn (VNĐ)", "Tổng vốn (VNĐ)", "Link mua",
        "Lô lưu kho chờ mua", "Tổng hàng mua đang lưu thông",
      ];
  const data = rows.map((l) =>
    viewMode
      ? [
          l.product.id,
          l.product.sku ?? "",
          l.product.name,
          l.product.categories.map((c) => catName[c] ?? c).join(", "),
          STATE[l.state],
          sheetWh ? WAREHOUSE_LABEL[sheetWh] : "",
          sheetWh ? l.stockByWarehouse[sheetWh] : l.product.stock ?? "",
          l.stockByWarehouse.jp || "",
          l.stockByWarehouse.carrier || "",
          l.stockByWarehouse.vn || "",
          l.minStock,
          l.pipeline.inTransit,
          (["jp", "transit", "carrier"] as const).filter((w) => l.pipeline.where[w] > 0).map((w) => `${TRANSIT_LABEL[w]} ${l.pipeline.where[w]}`).join(" · "),
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
          l.pipeline.inTransit,
          l.pipeline.atShop,
          l.product.stock ?? "",
          l.standardStock,
          l.soldRecent,
          l.reserveForecast ?? "",
          l.demandOrders.map((o) => `#${o.number}x${o.quantity}`).join(" "),
          l.product.costPrice ?? "",
          l.toBuy * (l.product.costPrice ?? 0),
          l.product.supplierUrl ?? "",
          l.plannedLot || "",
          l.totalGoods,
        ],
  );
  const csv = "﻿" + [header, ...data].map((r) => r.map(esc).join(",")).join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${viewMode ? (sheetWh ? `lienstore-kiem-ke-kho-${sheetWh}` : "lienstore-ton-kho") : "lienstore-can-dat-hang"}-${stamp}.csv"`,
    },
  });
}

