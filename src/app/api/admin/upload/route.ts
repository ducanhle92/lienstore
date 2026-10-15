import { NextResponse, type NextRequest } from "next/server";
import { canAny } from "@/lib/auth";
import { MediaError, storeImageUpload } from "@/lib/media-service";

export const dynamic = "force-dynamic";

/**
 * Product image upload (admin only). The browser already resized the picture and sends two blobs per image:
 *   image  – full size (max ~1200px)      thumb – 300×300 padded square
 * Both are stored under uploads/<folder>/<yyyy-mm>/ (folder = products | categories | posts) and the public URLs are
 * returned. The checks and storage are shared with the Admin API v1 (lib/media-service.ts).
 */
export async function POST(req: NextRequest) {
  if (!(await canAny(["products", "categories", "posts"]))) return NextResponse.json({ error: "Chưa đăng nhập quản trị hoặc không có quyền." }, { status: 401 });
  const form = await req.formData();
  const image = form.get("image");
  const thumb = form.get("thumb");
  const label = String(form.get("name") ?? "anh");
  const folderRaw = String(form.get("folder") ?? "");
  const folder = folderRaw === "categories" ? "categories" : folderRaw === "posts" ? "posts" : "products";
  if (!(image instanceof File)) return NextResponse.json({ error: "Thiếu file ảnh." }, { status: 400 });
  try {
    const r = await storeImageUpload({
      data: Buffer.from(await image.arrayBuffer()),
      mime: image.type,
      label,
      folder,
      thumb: thumb instanceof File ? { data: Buffer.from(await thumb.arrayBuffer()), mime: thumb.type } : null,
    });
    return NextResponse.json({ image: r.image, thumb: r.thumb, size: image.size });
  } catch (e) {
    if (e instanceof MediaError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
