import { NextResponse, type NextRequest } from "next/server";
import { isLang, LANG_COOKIE } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/** `/api/lang/?to=ja&back=/shop/` — remember the chrome language in a cookie and go back where the user was. */
export function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to");
  const backRaw = req.nextUrl.searchParams.get("back") ?? "/";
  // same-origin paths only
  const back = backRaw.startsWith("/") && !backRaw.startsWith("//") ? backRaw : "/";
  const res = NextResponse.redirect(new URL(back, req.nextUrl.origin), 303);
  if (isLang(to)) res.cookies.set(LANG_COOKIE, to, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
