/** Browser-side image resizing shared by the admin upload widgets (products, categories). */

const MAX_FULL = 1200;
const THUMB = 300;

/** Draw a File onto a canvas: full size capped at MAX_FULL, and a 300×300 white-padded square thumb. */
export async function resizeImage(file: File): Promise<{ image: Blob; thumb: Blob }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_FULL / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const toBlob = (canvas: HTMLCanvasElement) =>
    new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.88));

  const full = document.createElement("canvas");
  full.width = w;
  full.height = h;
  const fctx = full.getContext("2d")!;
  fctx.fillStyle = "#ffffff";
  fctx.fillRect(0, 0, w, h);
  fctx.drawImage(bitmap, 0, 0, w, h);

  const th = document.createElement("canvas");
  th.width = THUMB;
  th.height = THUMB;
  const tctx = th.getContext("2d")!;
  tctx.fillStyle = "#ffffff";
  tctx.fillRect(0, 0, THUMB, THUMB);
  const s = Math.min(THUMB / bitmap.width, THUMB / bitmap.height);
  const tw = Math.round(bitmap.width * s);
  const thh = Math.round(bitmap.height * s);
  tctx.drawImage(bitmap, Math.round((THUMB - tw) / 2), Math.round((THUMB - thh) / 2), tw, thh);
  bitmap.close();
  return { image: await toBlob(full), thumb: await toBlob(th) };
}

/** POST a resized image to /api/admin/upload; returns the public URLs. */
export async function uploadImage(file: File, folder: "products" | "categories" = "products"): Promise<{ image: string; thumb: string }> {
  const { image, thumb } = await resizeImage(file);
  const fd = new FormData();
  fd.append("image", image, file.name.replace(/\.[^.]+$/, "") + ".jpg");
  fd.append("thumb", thumb, "thumb.jpg");
  fd.append("name", file.name);
  fd.append("folder", folder);
  const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
  const json = (await res.json()) as { image?: string; thumb?: string; error?: string };
  if (!res.ok || !json.image) throw new Error(json.error || `Lỗi tải ảnh (${res.status})`);
  return { image: json.image, thumb: json.thumb ?? json.image };
}
