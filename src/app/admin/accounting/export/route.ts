import { NextResponse, type NextRequest } from "next/server";
import { dayKey, getAccounting } from "@/lib/accounting";
import { can } from "@/lib/auth";

export const dynamic = "force-dynamic";

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** GET /admin/accounting/export/?from=YYYY-MM-DD&to=YYYY-MM-DD → CSV of the per-order profit table. */
export async function GET(req: NextRequest) {
  if (!(await can("accounting"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = dayKey(new Date().toISOString());
  const from = isDay(req.nextUrl.searchParams.get("from") ?? "") ? (req.nextUrl.searchParams.get("from") as string) : `${today.slice(0, 7)}-01`;
  const to = isDay(req.nextUrl.searchParams.get("to") ?? "") ? (req.nextUrl.searchParams.get("to") as string) : today;
  const { rows, totals } = await getAccounting(from, to);
  const head = ["Đơn", "Ngày", "Khách", "Trạng thái", "Đã thanh toán", "Số SP", "Doanh thu (VNĐ)", "Ship khách trả (VNĐ)", "Giá vốn (VNĐ)", "Nhập 3 chặng (VNĐ)", "Giao VN trả hãng (VNĐ)", "Lãi/lỗ (VNĐ)", "Dòng thiếu giá vốn"];
  const lines = rows.map((r) => [`#${r.number}`, r.createdAt.slice(0, 10), r.customer, r.status, r.paid ? "x" : "", r.items, r.revenue, r.shipOnDelivery ? "trả shipper" : r.shipCollected, r.cogs, r.importFees, r.vnCarrierFee, r.profit, r.missingCost]);
  lines.push(["Tổng", `${from} → ${to}`, "", "", totals.paidOrders, "", totals.revenue, totals.shipCollected, totals.cogs, totals.importFees, totals.vnCarrierFee, totals.profit, totals.missingCost]);
  const csv = "﻿" + [head, ...lines].map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="lai-lo-${from}-${to}.csv"` } });
}
