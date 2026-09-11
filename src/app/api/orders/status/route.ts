import { NextResponse, type NextRequest } from "next/server";
import { getOrderById } from "@/lib/db";

export const dynamic = "force-dynamic";

/** `/api/orders/status/?id=<uuid>` — order status + logistics stage, polled by the order page after checkout. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const order = await getOrderById(id);
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ status: order.status, shipStage: order.shipStage }, { headers: { "Cache-Control": "no-store" } });
}
