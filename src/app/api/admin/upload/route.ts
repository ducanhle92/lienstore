import { NextResponse, type NextRequest } from "next/server";
import { canAny } from "@/lib/auth";
import { trimToFrame } from "@/lib/image-trim";
import { extForMime, IMAGE_MIMES, MAX_UPLOAD_BYTES, saveUpload, slugifyFileName, uniqueName } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * Product image upload (admin only). The browser already resized the picture and sends two blobs per image:
 *   image  – full size (max ~1200px)      thumb – 300×300 padded square
 * Both are stored under uploads/<folder>/<yyyy-mm>/ (folder = products | categories) and the public URLs are returned.
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
  if (!IMAGE_MIMES.has(image.type)) return NextResponse.json({ error: `Định dạng ${image.type || "không rõ"} không được hỗ trợ.` }, { status: 415 });
  if (image.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Ảnh vượt quá 10 MB." }, { status: 413 });

  const ext = extForMime(image.type) || ".jpg";
  const month = new Date().toISOString().slice(0, 7);
  const base = uniqueName(slugifyFileName(label), "");
  // product pictures: cut the white border so the object fills its frame evenly (cards use object-fit: contain)
  const trimProducts = folder === "products" && image.type !== "image/gif";
  let imageBuf: Buffer = Buffer.from(await image.arrayBuffer());
  if (trimProducts) {
    try {
      imageBuf = (await trimToFrame(imageBuf, { square: false, margin: 0.03 })).buffer;
    } catch {
      /* keep the original */
    }
  }
  const saved = await saveUpload(`${folder}/${month}`, `${base}${ext}`, imageBuf);
  let thumbUrl = saved.url;
  if (thumb instanceof File && IMAGE_MIMES.has(thumb.type) && thumb.size <= MAX_UPLOAD_BYTES) {
    let thumbBuf: Buffer = Buffer.from(await thumb.arrayBuffer());
    if (trimProducts) {
      try {
        thumbBuf = (await trimToFrame(thumbBuf, { size: 300 })).buffer;
      } catch {
        /* keep the original */
      }
    }
    const t = await saveUpload(`${folder}/${month}`, `${base}-300x300${extForMime(thumb.type) || ".jpg"}`, thumbBuf);
    thumbUrl = t.url;
  }
  return NextResponse.json({ image: saved.url, thumb: thumbUrl, size: image.size });
}
