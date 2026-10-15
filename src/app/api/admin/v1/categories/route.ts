import { apiRoute } from "@/lib/api-http";
import { getCategories } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/admin/v1/categories/ — slugs to use in a product's `categories` (count = published products directly in it). */
export const GET = apiRoute({ scope: "products:read" }, async () => {
  const cats = await getCategories();
  return { data: cats.map((c) => ({ slug: c.slug, name: c.name, nameJa: c.nameJa, parent: c.parentSlug, count: c.count })) };
});
