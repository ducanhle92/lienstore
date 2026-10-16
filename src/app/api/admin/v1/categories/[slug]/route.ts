import { ApiError, apiRouteWithParams, readJson } from "@/lib/api-http";
import { getCategoryBySlug, saveCategory } from "@/lib/db";
import { slugify } from "@/lib/format";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

type Params = { slug: string };

function serialize(c: NonNullable<Awaited<ReturnType<typeof getCategoryBySlug>>>) {
  return { slug: c.slug, name: c.name, nameJa: c.nameJa, parent: c.parentSlug, image: c.image, description: c.description, count: c.count };
}

/** GET /api/admin/v1/categories/{slug}/ */
export const GET = apiRouteWithParams<Params>({ scope: "products:read" }, async (_ctx, { slug }) => {
  const cat = await getCategoryBySlug(decodeURIComponent(slug));
  if (!cat) throw new ApiError(404, "NOT_FOUND", `Không có danh mục "${slug}".`);
  return { data: serialize(cat) };
});

/**
 * PATCH /api/admin/v1/categories/{slug}/ — rename / move / change image. Send only fields to change.
 * Body: `{ name?, slug?, nameJa?, description?, image?, parent? }` (`parent: null` = top-level).
 */
export const PATCH = apiRouteWithParams<Params>({ scope: "products:write", write: true, idempotent: true }, async ({ req, principal }, { slug: raw }) => {
  if (!principal.permissions.includes("categories") && !principal.permissions.includes("products")) {
    throw new ApiError(403, "FORBIDDEN", "Tài khoản không có quyền danh mục / sản phẩm.");
  }
  const originalSlug = decodeURIComponent(raw);
  const existing = await getCategoryBySlug(originalSlug);
  if (!existing) throw new ApiError(404, "NOT_FOUND", `Không có danh mục "${originalSlug}".`);

  const body = await readJson(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "BAD_REQUEST", "Body phải là object JSON.");
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : existing.name;
  if (!name) throw new ApiError(422, "VALIDATION_FAILED", "Tên danh mục là bắt buộc.", { fields: { name: "Bắt buộc." } });

  let nextSlug = existing.slug;
  if (typeof b.slug === "string" && b.slug.trim()) {
    nextSlug = slugify(b.slug);
    if (!nextSlug) throw new ApiError(422, "VALIDATION_FAILED", "Đường dẫn không hợp lệ.", { fields: { slug: "Không hợp lệ." } });
  }

  const description = typeof b.description === "string" ? b.description : existing.description;
  const nameJa = typeof b.nameJa === "string" ? b.nameJa : existing.nameJa;
  let image = existing.image;
  if (b.image === null) image = null;
  else if (typeof b.image === "string") {
    image = b.image.trim() || null;
    if (image && !/^(\/|https?:\/\/)/.test(image)) throw new ApiError(422, "VALIDATION_FAILED", "Ảnh phải là đường dẫn /… hoặc https://…", { fields: { image: "Không hợp lệ." } });
  }

  let parentSlug: string | null = existing.parentSlug;
  if ("parent" in b) {
    if (b.parent === null || b.parent === "") parentSlug = null;
    else if (typeof b.parent === "string") parentSlug = b.parent.trim() || null;
    else throw new ApiError(422, "VALIDATION_FAILED", "parent phải là slug hoặc null.", { fields: { parent: "Không hợp lệ." } });
  }

  try {
    const cat = await saveCategory({
      slug: nextSlug,
      name,
      description,
      image,
      parentSlug,
      nameJa,
      originalSlug,
    });
    revalidatePath("/", "layout");
    return { data: serialize(cat) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Không thể cập nhật danh mục.";
    if (/đã tồn tại/i.test(msg)) throw new ApiError(409, "DUPLICATE_SLUG", msg);
    if (/không tồn tại/i.test(msg)) throw new ApiError(404, "NOT_FOUND", msg);
    throw new ApiError(422, "VALIDATION_FAILED", msg);
  }
});
