import { NextResponse, type NextRequest } from "next/server";
import { VN_ADDRESS_VERSION, VN_PROVINCES, wardsOf } from "@/lib/vn-address";

/** GET /api/shipping/address/ → 34 provinces; ?province=<code> → its wards (new 2-level model, no districts). */
export async function GET(req: NextRequest) {
  const province = req.nextUrl.searchParams.get("province");
  const headers = { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" };
  if (province) {
    const wards = wardsOf(province).map((w) => ({ code: w.code, name: w.name }));
    if (!wards.length) return NextResponse.json({ error: "UNKNOWN_PROVINCE", message: "Không có tỉnh/thành này." }, { status: 404 });
    return NextResponse.json({ version: VN_ADDRESS_VERSION, data: wards }, { headers });
  }
  return NextResponse.json({ version: VN_ADDRESS_VERSION, data: VN_PROVINCES.map((p) => ({ code: p.code, name: p.name, type: p.type })) }, { headers });
}
