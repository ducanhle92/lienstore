import { ApiError, apiRoute, readJson } from "@/lib/api-http";
import { getCategories, saveCategory } from "@/lib/db";
import { slugify } from "@/lib/format";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

function serialize(c: Awaited<ReturnType<typeof getCategories>>[number]) {
  return { slug: c.slug, name: c.name, nameJa: c.nameJa, parent: c.parentSlug, image: c.image, description: c.description, count: c.count };
}

/** GET /api/admin/v1/categories/ — slugs to use in a product's `categories` (count = published products directly in it). */
export const GET = apiRoute({ scope: "products:read" }, async () => {
  const cats = await getCategories();
  return { data: cats.map((c) => ({ slug: c.slug, name: c.name, nameJa: c.nameJa, parent: c.parentSlug, count: c.count })) };
});

/**
 * POST /api/admin/v1/categories/ — create a category.
 * Body: `{ name, slug?, nameJa?, description?, image?, parent? }` (`parent` = parent slug).
 */
export const POST = apiRoute({ scope: "products:write", write: true, idempotent: true }, async ({ req, principal }) => {
  if (!principal.permissions.includes("categories") && !principal.permissions.includes("products")) {
    throw new ApiError(403, "FORBIDDEN", "Tài khoản không có quyền danh mục / sản phẩm.");
  }
  const body = await readJson(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "BAD_REQUEST", "Body phải là object JSON.");
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) throw new ApiError(422, "VALIDATION_FAILED", "Tên danh mục là bắt buộc.", { fields: { name: "Bắt buộc." } });
  const slug = slugify(typeof b.slug === "string" && b.slug.trim() ? b.slug : name);
  if (!slug) throw new ApiError(422, "VALIDATION_FAILED", "Đường dẫn không hợp lệ.", { fields: { slug: "Không hợp lệ." } });
  const image = typeof b.image === "string" && b.image.trim() ? b.image.trim() : null;
  if (image && !/^(\/|https?:\/\/)/.test(image)) throw new ApiError(422, "VALIDATION_FAILED", "Ảnh phải là đường dẫn /… hoặc https://…", { fields: { image: "Không hợp lệ." } });
  const parent = typeof b.parent === "string" && b.parent.trim() ? b.parent.trim() : null;
  const description = typeof b.description === "string" ? b.description : "";
  const nameJa = typeof b.nameJa === "string" ? b.nameJa : "";
  try {
    const cat = await saveCategory({ slug, name, description, image, parentSlug: parent, nameJa });
    revalidatePath("/", "layout");
    return { data: serialize(cat) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Không thể tạo danh mục.";
    if (/đã tồn tại/i.test(msg)) throw new ApiError(409, "DUPLICATE_SLUG", msg);
    throw new ApiError(422, "VALIDATION_FAILED", msg);
  }
});
