import { getSiteTheme } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Web app manifest of the phone scan screen: "Thêm vào màn hình chính" from /admin/scan/ opens the scanner (standalone),
 * not the storefront (src/app/manifest.ts keeps start_url "/"). No service worker: the screen is online-only.
 */
export async function GET() {
  const theme = await getSiteTheme();
  return new Response(
    JSON.stringify({
      name: `Quét mã · ${theme.shopName}`,
      short_name: "Quét mã",
      id: "/admin/scan/",
      start_url: "/admin/scan/",
      scope: "/admin/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#ffffff",
      theme_color: theme.colors.header,
      lang: "vi",
      icons: [
        { src: theme.icon, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: theme.icon, sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    }),
    { headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
