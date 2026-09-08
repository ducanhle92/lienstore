import { NextResponse, type NextRequest } from "next/server";
import { canAny } from "@/lib/auth";
import { extForMime, IMAGE_MIMES, MAX_UPLOAD_BYTES, saveUpload, slugifyFileName, uniqueName } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * Product image upload (admin only). The browser already resized the picture and sends two blobs per image:
 *   image  – full size (max ~1200px)      thumb – 300×300 padded square
 * Both are stored under uploads/<folder>/<yyyy-mm>/ (folder = products | categories) and the public URLs are returned.
 */
export async function POST(req: NextRequest) {
  if (!(await canAny(["products", "categories"]))) return NextResponse.json({ error: "Chưa đăng nhập quản trị hoặc không có quyền." }, { status: 401 });
  const form = await req.formData();
  const image = form.get("image");
  const thumb = form.get("thumb");
  const label = String(form.get("name") ?? "anh");
  const folder = form.get("folder") === "categories" ? "categories" : "products";
  if (!(image instanceof File)) return NextResponse.json({ error: "Thiếu file ảnh." }, { status: 400 });
  if (!IMAGE_MIMES.has(image.type)) return NextResponse.json({ error: `Định dạng ${image.type || "không rõ"} không được hỗ trợ.` }, { status: 415 });
  if (image.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Ảnh vượt quá 10 MB." }, { status: 413 });

  const ext = extForMime(image.type) || ".jpg";
  const month = new Date().toISOString().slice(0, 7);
  const base = uniqueName(slugifyFileName(label), "");
  const saved = await saveUpload(`${folder}/${month}`, `${base}${ext}`, Buffer.from(await image.arrayBuffer()));
  let thumbUrl = saved.url;
  if (thumb instanceof File && IMAGE_MIMES.has(thumb.type) && thumb.size <= MAX_UPLOAD_BYTES) {
    const t = await saveUpload(`${folder}/${month}`, `${base}-300x300${extForMime(thumb.type) || ".jpg"}`, Buffer.from(await thumb.arrayBuffer()));
    thumbUrl = t.url;
  }
  return NextResponse.json({ image: saved.url, thumb: thumbUrl, size: image.size });
}
