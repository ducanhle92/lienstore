import { NextResponse, type NextRequest } from "next/server";
import { type BankTransferPayload, processBankTransfer, sepayApiKey } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * SePay → shop: POST JSON when money lands on the connected BIDV account (docs.sepay.vn/tich-hop-webhooks.html).
 * Auth: header "Authorization: Apikey <key>" must match the key configured in Admin › Kế toán › Thanh toán tự động.
 * SePay retries (up to 7×, ≤ 5 h) unless we answer 200/201 with {"success": true} within 30 s — so every
 * well-formed, authenticated notification is acknowledged, even when it does not match an order (it is stored for
 * manual reconciliation instead).
 */
export async function POST(req: NextRequest) {
  const key = sepayApiKey();
  if (!key) return NextResponse.json({ success: false, error: "SEPAY_NOT_CONFIGURED", message: "Chưa cấu hình API key SePay trong admin." }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  const m = /^\s*apikey\s+(.+)$/i.exec(auth);
  if (!m || m[1].trim() !== key) {
    console.warn(`[sepay] webhook rejected: bad api key from ${req.headers.get("x-forwarded-for") ?? "?"}`);
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  let body: BankTransferPayload;
  try {
    body = (await req.json()) as BankTransferPayload;
  } catch {
    return NextResponse.json({ success: false, error: "BAD_JSON" }, { status: 400 });
  }
  if (body === null || typeof body !== "object" || body.id === undefined) return NextResponse.json({ success: false, error: "MISSING_ID" }, { status: 400 });
  try {
    const ev = await processBankTransfer(body, "sepay");
    console.info(`[sepay] tx ${ev.externalId}: ${ev.status}${ev.orderNumber ? ` → đơn #${ev.orderNumber}` : ""} (${ev.amount}đ, code ${ev.payCode || "-"})`);
    return NextResponse.json({ success: true, status: ev.status, order: ev.orderNumber ?? null });
  } catch (e) {
    console.error(`[sepay] webhook failed: ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ success: false, error: "INTERNAL" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST JSON từ SePay tới endpoint này với header Authorization: Apikey <key>." });
}
