import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await siteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/checkout/", "/cart/", "/my-account/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
