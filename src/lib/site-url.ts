import { headers } from "next/headers";

/**
 * Public origin of the running site, for sitemap / robots / absolute links.
 * NEXT_PUBLIC_* values are frozen into the image at build time (CI does not know the deployment host), so the
 * request's forwarded host is the reliable source; SITE_URL can pin it explicitly.
 */
export async function siteUrl(): Promise<string> {
  const fixed = process.env.SITE_URL?.trim();
  if (fixed) return fixed.replace(/\/$/, "");
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  if (host) {
    const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (/^(localhost|127\.|192\.168\.|10\.)/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  }
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
