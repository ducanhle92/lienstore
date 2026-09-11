import { NextResponse } from "next/server";
import { can } from "@/lib/auth";
import { getInventory } from "@/lib/inventory";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** CSV of everything that needs to be bought (open-order demand + low-stock top-ups), for the buyer in Japan. */
export async function GET() {
  if (!(await can("inventory"))) return new NextResponse("Unauthorized", { status: 401 });
  const { lines } = await getInventory();
  const rows = lines
    .filter((l) => l.toBuy > 0)
    .sort((a, b) => b.toBuy - a.toBuy)
    .map((l) => [
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
    ]);
  const header = ["ID", "Tên sản phẩm", "SKU", "Cần mua", "Đơn mở cần", "Tổng hàng mua", "Đang về", "Tại kho shop", "Đơn hàng", "Tồn hiện tại", "Giá vốn (VNĐ)", "Tổng vốn (VNĐ)", "Link mua"];
  const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lienstore-can-dat-hang-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
