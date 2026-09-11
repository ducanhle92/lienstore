import { type NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { runPricingJob } from "@/lib/fx";

export const dynamic = "force-dynamic";

/**
 * Nightly pricing job entry point for an external cron (TrueNAS): `GET /api/cron/pricing/?key=<CRON_KEY>`.
 * A signed-in admin may also call it without the key (the "Cập nhật ngay" button uses a server action instead).
 */
export async function GET(req: NextRequest) {
  const key = process.env.CRON_KEY;
  const given = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key");
  const ok = (key && given === key) || (await isAdmin());
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await runPricingJob();
  return NextResponse.json(r);
}
