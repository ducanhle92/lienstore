import { ApiError, apiRoute } from "@/lib/api-http";
import { recordAudit } from "@/lib/api-tokens";
import { MEDIA_FOLDERS, type MediaFolder, storeImageUpload } from "@/lib/media-service";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/v1/media/ — multipart/form-data: `file` (JPEG/PNG/WebP/AVIF/GIF ≤ 10 MB), optional `folder`
 * (products | categories | posts, default products) and `name`. The server resizes to ≤1200 px, trims white borders of
 * product pictures and writes the 300×300 thumb. Response `image` goes into a product's `images`.
 */
export const POST = apiRoute({ scope: "media:write", write: true, idempotent: true }, async ({ req, principal, requestId, ip }) => {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) throw new ApiError(413, "FILE_TOO_LARGE", "Ảnh vượt quá 10 MB.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Cần multipart/form-data với trường file.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "MISSING_FILE", "Thiếu trường file.");
  const folderRaw = String(form.get("folder") ?? "products");
  if (!MEDIA_FOLDERS.includes(folderRaw as MediaFolder)) throw new ApiError(400, "BAD_REQUEST", `folder: ${MEDIA_FOLDERS.join(" | ")}.`);
  const r = await storeImageUpload({ data: Buffer.from(await file.arrayBuffer()), mime: file.type, label: String(form.get("name") ?? file.name ?? "anh"), folder: folderRaw as MediaFolder, generateThumb: true });
  recordAudit({ actor: principal.actor, tokenId: principal.tokenId, action: "media.upload", target: `media:${r.image}`, changes: { folder: folderRaw, fileName: file.name, size: r.size, mime: r.mime }, requestId, ip });
  return { status: 201, data: r };
});
