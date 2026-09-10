import type { MetadataRoute } from "next";
import { getAllProducts, getCategories, getPosts } from "@/lib/db";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
const STATIC = ["/", "/shop/", "/category/goc-chia-se/", "/lien-he/", "/gioi-thieu-ve-lienstore/", "/huong-dan-dat-hang/", "/chinh-sach-doi-tra/", "/privacy-policy/"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [BASE, products, categories, posts] = await Promise.all([siteUrl(), getAllProducts(), getCategories(), getPosts()]);
  return [
    ...STATIC.map((p) => ({ url: `${BASE}${p}`, changeFrequency: "weekly" as const, priority: p === "/" ? 1 : 0.7 })),
    ...categories.map((c) => ({ url: `${BASE}/product-category/${c.slug}/`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...products.map((p) => ({ url: `${BASE}/product/${p.slug}/`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...posts.map((p) => ({ url: `${BASE}/${p.slug}/`, lastModified: p.date, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
