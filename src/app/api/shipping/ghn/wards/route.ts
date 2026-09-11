import { NextResponse, type NextRequest } from "next/server";
import { GhnApiError, ghnConfigured, ghnWards } from "@/lib/ghn";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!ghnConfigured()) return NextResponse.json({ error: "GHN_CONFIGURATION_ERROR", message: "GHN chưa được cấu hình." }, { status: 503 });
  const districtId = Number(req.nextUrl.searchParams.get("districtId"));
  if (!Number.isInteger(districtId) || districtId <= 0) return NextResponse.json({ error: "INVALID_QUOTE_INPUT", message: "districtId không hợp lệ." }, { status: 400 });
  try {
    return NextResponse.json({ data: await ghnWards(districtId) });
  } catch (e) {
    const err = e instanceof GhnApiError ? e : new GhnApiError("Không tải được danh sách phường/xã.", 502, "GHN_UNAVAILABLE");
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.httpStatus });
  }
}
