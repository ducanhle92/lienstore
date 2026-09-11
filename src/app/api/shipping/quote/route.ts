import { NextResponse, type NextRequest } from "next/server";
import { getShipPolicy } from "@/lib/db";
import { rateLimited } from "@/lib/ghn";
import { quoteCart } from "@/lib/ship-quote";
import { coarseRegionOf } from "@/lib/vn-address";

export const dynamic = "force-dynamic";

/**
 * POST { provinceCode, wardCode, street, items: [{ productId, quantity }], cod?: boolean, coupon?: string }
 * → { quotes: ShippingQuote[], parcel, quotedAt, expiresAt }. Weight, size and value are rebuilt from the catalogue on
 * the server; carrier tokens never leave the server; a "Từ …" quote is flagged by accuracy = from_price.
 */
export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (rateLimited(ip, 60)) return NextResponse.json({ error: "SHIPPING_RATE_LIMITED", message: "Bạn thao tác quá nhanh, thử lại sau ít phút." }, { status: 429 });
  let body: { provinceCode?: unknown; wardCode?: unknown; street?: unknown; items?: unknown; cod?: unknown; coupon?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "INVALID_QUOTE_INPUT", message: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const items = Array.isArray(body.items)
    ? body.items
        .map((x) => ({ productId: Number((x as { productId?: unknown }).productId), quantity: Math.max(1, Math.floor(Number((x as { quantity?: unknown }).quantity) || 1)) }))
        .filter((x) => Number.isInteger(x.productId) && x.productId > 0)
        .slice(0, 50)
    : [];
  const provinceCode = String(body.provinceCode ?? "").trim();
  const wardCode = String(body.wardCode ?? "").trim();
  const street = String(body.street ?? "").trim().slice(0, 200);
  if (!provinceCode || !wardCode || !street || items.length === 0) {
    return NextResponse.json({ error: "INVALID_QUOTE_INPUT", message: "Nhập đủ tỉnh/thành, xã/phường và địa chỉ nhà để xem cước." }, { status: 400 });
  }
  const r = await quoteCart({ lines: items, destination: { provinceCode, wardCode, street }, cod: body.cod === true, coupon: typeof body.coupon === "string" ? body.coupon : undefined });
  if ("error" in r) return NextResponse.json({ error: "INVALID_QUOTE_INPUT", message: r.error }, { status: 400 });
  // shop free-shipping policy (Sales › Chính sách vận chuyển): threshold for the destination's coarse region, or null
  const policy = await getShipPolicy();
  const region = coarseRegionOf(provinceCode);
  const freeOver = policy.enabled && region ? policy.thresholds[region] : null;
  return NextResponse.json({ quotes: r.quotes, parcel: r.parcel, destination: r.request.destination.fullAddress, quotedAt: r.quotedAt, expiresAt: r.expiresAt, fromCache: r.fromCache, freeOver });
}
