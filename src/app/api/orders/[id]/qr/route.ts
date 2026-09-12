import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { getBankConfig, orderQrPayload } from "@/lib/bank-config";
import { getOrderById } from "@/lib/db";

export const dynamic = "force-dynamic";

/** PNG of the order's VietQR (amount + memo pre-filled) — for sharing via Zalo or saving to the phone. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const order = await getOrderById(id);
  if (!order || order.status === "cancelled") return NextResponse.json({ error: "Không tìm thấy đơn." }, { status: 404 });
  const cfg = await getBankConfig();
  const png = await QRCode.toBuffer(orderQrPayload(cfg, order.total, order.number), { type: "png", width: 512, margin: 2, errorCorrectionLevel: "M" });
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300", "Content-Disposition": `inline; filename="qr-don-${order.number}.png"` } });
}
