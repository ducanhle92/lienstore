import { NextResponse, type NextRequest } from "next/server";
import { isLang, LANG_COOKIE } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * `/api/lang/?to=ja&back=/shop/` — remember the chrome language in a cookie and go back where the visitor was.
 * The redirect uses a *relative* Location so it works behind proxies and when the server is bound to 0.0.0.0.
 */
export function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to");
  const backRaw = req.nextUrl.searchParams.get("back") ?? "/";
  const back = backRaw.startsWith("/") && !backRaw.startsWith("//") ? backRaw : "/";
  const res = new NextResponse(null, { status: 303, headers: { Location: back } });
  if (isLang(to)) res.cookies.set(LANG_COOKIE, to, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
