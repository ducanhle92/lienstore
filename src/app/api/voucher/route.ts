import { NextResponse, type NextRequest } from "next/server";
import { validateVoucher } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

/** `/api/voucher/?code=X&subtotal=N` — checkout preview of a discount code (the order re-validates on submit). */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const subtotal = Number.parseInt(req.nextUrl.searchParams.get("subtotal") ?? "0", 10) || 0;
  if (!code.trim()) return NextResponse.json({ ok: false, message: "Nhập mã giảm giá." });
  const me = await getCurrentCustomer();
  const r = await validateVoucher(code, subtotal, me?.id ?? null);
  return NextResponse.json(r.ok ? { ok: true, code: r.voucher.code, discount: r.discount, label: r.voucher.kind === "percent" ? `-${r.voucher.value}%` : `-${r.discount.toLocaleString("vi-VN")}đ` } : { ok: false, message: r.message });
}
