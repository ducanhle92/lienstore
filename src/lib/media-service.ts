import "server-only";
import sharp from "sharp";
import { trimToFrame } from "@/lib/image-trim";
import { extForMime, IMAGE_MIMES, MAX_UPLOAD_BYTES, saveUpload, slugifyFileName, uniqueName } from "@/lib/uploads";

/**
 * Image uploads shared by the admin widgets (`/api/admin/upload`, the browser already resized the picture and sends a
 * 300×300 thumb) and the Admin API v1 (`POST /api/admin/v1/media`, CLI `lienstore media upload` — the server does the
 * resizing the browser would do). Same rules everywhere: IMAGE_MIMES only, at most MAX_UPLOAD_BYTES, files stored under
 * uploads/<folder>/<yyyy-mm>/ and served by /api/files/…; product pictures get their white border trimmed.
 */

export type MediaFolder = "products" | "categories" | "posts";
export const MEDIA_FOLDERS: MediaFolder[] = ["products", "categories", "posts"];
const MAX_FULL = 1200;
const THUMB = 300;
const SHARP_FORMAT_MIME: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heif: "image/avif", avif: "image/avif" };

export class MediaError extends Error {
  constructor(
    readonly status: number,
    readonly code: "MISSING_FILE" | "UNSUPPORTED_MEDIA_TYPE" | "FILE_TOO_LARGE" | "INVALID_IMAGE",
    message: string,
  ) {
    super(message);
    this.name = "MediaError";
  }
}

export interface UploadInput {
  data: Buffer;
  mime: string;
  /** Original file name / label (only used to build a readable file name). */
  label: string;
  folder: MediaFolder;
  /** A ready-made thumbnail (admin widgets); without it `generateThumb` decides. */
  thumb?: { data: Buffer; mime: string } | null;
  /** Server-side resize to ≤1200 px + 300×300 thumb (API uploads). */
  generateThumb?: boolean;
}

export interface UploadResult {
  /** Public URL to put in a product's `images`. */
  image: string;
  /** 300×300 listing thumbnail (the "-300x300" sibling the product form picks up automatically). */
  thumb: string;
  size: number;
  mime: string;
  width: number | null;
  height: number | null;
}

/** Same checks for every caller: declared type, size, and the bytes really being that kind of image. */
export async function checkImage(data: Buffer, mime: string): Promise<{ width: number | null; height: number | null }> {
  if (!data.length) throw new MediaError(400, "MISSING_FILE", "Thiếu file ảnh.");
  if (!IMAGE_MIMES.has(mime)) throw new MediaError(415, "UNSUPPORTED_MEDIA_TYPE", `Định dạng ${mime || "không rõ"} không được hỗ trợ (chỉ JPEG, PNG, WebP, AVIF, GIF).`);
  if (data.length > MAX_UPLOAD_BYTES) throw new MediaError(413, "FILE_TOO_LARGE", "Ảnh vượt quá 10 MB.");
  try {
    const meta = await sharp(data, { failOn: "error" }).metadata();
    const actual = SHARP_FORMAT_MIME[meta.format ?? ""];
    if (!actual) throw new Error("format");
    if (actual !== mime) throw new MediaError(415, "UNSUPPORTED_MEDIA_TYPE", `Nội dung file là ${actual} nhưng khai báo ${mime}.`);
    return { width: meta.width ?? null, height: meta.height ?? null };
  } catch (e) {
    if (e instanceof MediaError) throw e;
    throw new MediaError(422, "INVALID_IMAGE", "File không phải ảnh hợp lệ.");
  }
}

export async function storeImageUpload(input: UploadInput): Promise<UploadResult> {
  const dims = await checkImage(input.data, input.mime);
  const ext = extForMime(input.mime) || ".jpg";
  const month = new Date().toISOString().slice(0, 7);
  const base = uniqueName(slugifyFileName(input.label || "anh"), "");
  const isGif = input.mime === "image/gif";
  // product pictures: cut the white border so the object fills its frame evenly (cards use object-fit: contain)
  const trimProducts = input.folder === "products" && !isGif;

  let imageBuf: Buffer = input.data;
  if (input.generateThumb && !isGif && Math.max(dims.width ?? 0, dims.height ?? 0) > MAX_FULL) {
    imageBuf = await sharp(imageBuf).rotate().resize(MAX_FULL, MAX_FULL, { fit: "inside", withoutEnlargement: true }).toBuffer();
  }
  if (trimProducts) {
    try {
      imageBuf = (await trimToFrame(imageBuf, { square: false, margin: 0.03 })).buffer;
    } catch {
      /* keep the original */
    }
  }
  const saved = await saveUpload(`${input.folder}/${month}`, `${base}${ext}`, imageBuf);

  let thumbUrl = saved.url;
  let thumbBuf: Buffer | null = null;
  let thumbExt = ext;
  if (input.thumb && IMAGE_MIMES.has(input.thumb.mime) && input.thumb.data.length <= MAX_UPLOAD_BYTES) {
    thumbBuf = input.thumb.data;
    thumbExt = extForMime(input.thumb.mime) || ".jpg";
    if (trimProducts) {
      try {
        thumbBuf = (await trimToFrame(thumbBuf, { size: THUMB })).buffer;
      } catch {
        /* keep the original */
      }
    }
  } else if (input.generateThumb && !isGif) {
    try {
      thumbBuf = trimProducts
        ? (await trimToFrame(imageBuf, { size: THUMB })).buffer
        : await sharp(imageBuf).rotate().resize(THUMB, THUMB, { fit: "contain", background: "#ffffff" }).toBuffer();
    } catch {
      thumbBuf = null;
    }
  }
  if (thumbBuf) thumbUrl = (await saveUpload(`${input.folder}/${month}`, `${base}-300x300${thumbExt}`, thumbBuf)).url;

  const finalMeta = await sharp(imageBuf).metadata().catch(() => null);
  return { image: saved.url, thumb: thumbUrl, size: imageBuf.length, mime: input.mime, width: finalMeta?.width ?? dims.width, height: finalMeta?.height ?? dims.height };
}
