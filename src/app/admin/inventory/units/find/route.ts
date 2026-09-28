import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/auth";
import { parseUnitCode } from "@/lib/units";

/** "Tra mã": /admin/inventory/units/find/?code=h 000123-5 → the unit page (typos in the check digit are rejected). */
export async function GET(req: NextRequest) {
  if (!(await can("inventory"))) return NextResponse.redirect(new URL("/admin/login/", req.url));
  const raw = req.nextUrl.searchParams.get("code") ?? "";
  const code = parseUnitCode(raw);
  const back = req.headers.get("referer") ?? "/admin/inventory/";
  if (!code) return NextResponse.redirect(new URL(`${back.split("?")[0]}?error=${encodeURIComponent(`Mã “${raw}” không hợp lệ (dạng H + 7 chữ số, chữ số cuối là số kiểm tra).`)}`, req.url));
  return NextResponse.redirect(new URL(`/admin/inventory/units/${code}/`, req.url));
}
