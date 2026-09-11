import { NextResponse, type NextRequest } from "next/server";
import { quoteCartGhn } from "@/lib/db";
import { GhnApiError, ghnConfigured, rateLimited } from "@/lib/ghn";

export const dynamic = "force-dynamic";

/**
 * POST { toDistrictId, toWardCode, items: [{ productId, quantity }], cod: boolean }
 * Weight and parcel size are recomputed from the catalogue on the server; the browser never sends a fee.
 */
export async function POST(req: NextRequest) {
  if (!ghnConfigured()) return NextResponse.json({ error: "GHN_CONFIGURATION_ERROR", message: "GHN chưa được cấu hình." }, { status: 503 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (rateLimited(ip)) return NextResponse.json({ error: "SHIPPING_RATE_LIMITED", message: "Bạn thao tác quá nhanh, thử lại sau ít phút." }, { status: 429 });
  let body: { toDistrictId?: unknown; toWardCode?: unknown; items?: unknown; cod?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "INVALID_QUOTE_INPUT", message: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const toDistrictId = Number(body.toDistrictId);
  const toWardCode = String(body.toWardCode ?? "").trim();
  const items = Array.isArray(body.items)
    ? body.items
        .map((x) => ({ productId: Number((x as { productId?: unknown }).productId), quantity: Math.max(1, Math.floor(Number((x as { quantity?: unknown }).quantity) || 1)) }))
        .filter((x) => Number.isInteger(x.productId) && x.productId > 0)
    : [];
  if (!Number.isInteger(toDistrictId) || toDistrictId <= 0 || !toWardCode || items.length === 0) {
    return NextResponse.json({ error: "INVALID_QUOTE_INPUT", message: "Chọn đủ quận/huyện và phường/xã." }, { status: 400 });
  }
  try {
    const q = await quoteCartGhn(items, { districtId: toDistrictId, wardCode: toWardCode }, body.cod === true);
    return NextResponse.json(q);
  } catch (e) {
    const err = e instanceof GhnApiError ? e : new GhnApiError("GHN tạm thời không phản hồi.", 502, "GHN_UNAVAILABLE");
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.httpStatus });
  }
}
