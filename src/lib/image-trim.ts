import "server-only";
import sharp, { type OutputInfo } from "sharp";

/**
 * Product pictures come on white backgrounds with uneven margins, so the same watch looks big in one card and tiny in
 * the next. `trimToFrame` cuts the white border away and pads the object into a square with a small even margin, so
 * `object-fit: contain` makes every product touch the top/bottom (or left/right) of its frame without cropping it.
 */
export interface TrimOptions {
  /** Output side in px for square thumbnails; omit to keep the trimmed size (padded square). */
  size?: number;
  /** Even margin around the object, fraction of the longer side (default 4 %). */
  margin?: number;
  /** How far from white a pixel may be and still count as background (0–255, default 18). */
  threshold?: number;
  /** Keep the aspect ratio instead of padding to a square (gallery images). */
  square?: boolean;
}

export async function trimToFrame(input: Buffer, opts: TrimOptions = {}): Promise<{ buffer: Buffer; width: number; height: number; changed: boolean }> {
  const margin = opts.margin ?? 0.04;
  const square = opts.square ?? true;
  const base = sharp(input, { failOn: "none" }).rotate().flatten({ background: "#ffffff" });
  const meta = await base.metadata();
  let trimmed: { data: Buffer; info: OutputInfo };
  try {
    trimmed = await base.clone().trim({ background: "#ffffff", threshold: opts.threshold ?? 18 }).toBuffer({ resolveWithObject: true });
  } catch {
    // nothing to trim (uniform image) or unsupported format → keep the original
    return { buffer: input, width: meta.width ?? 0, height: meta.height ?? 0, changed: false };
  }
  const w = trimmed.info.width;
  const h = trimmed.info.height;
  if (!w || !h || w < 8 || h < 8) return { buffer: input, width: meta.width ?? 0, height: meta.height ?? 0, changed: false };
  const long = Math.max(w, h);
  const pad = Math.round(long * margin);
  const side = long + pad * 2;
  const left = square ? Math.round((side - w) / 2) : pad;
  const top = square ? Math.round((side - h) / 2) : pad;
  const outW = square ? side : w + pad * 2;
  const outH = square ? side : h + pad * 2;
  let pipeline = sharp(trimmed.data).extend({ top, bottom: outH - h - top, left, right: outW - w - left, background: "#ffffff" });
  if (opts.size) pipeline = pipeline.resize(opts.size, opts.size, { fit: "contain", background: "#ffffff" });
  const format = meta.format === "png" ? "png" : meta.format === "webp" ? "webp" : "jpeg";
  pipeline = format === "png" ? pipeline.png({ compressionLevel: 9 }) : format === "webp" ? pipeline.webp({ quality: 88 }) : pipeline.jpeg({ quality: 88, mozjpeg: true });
  const out = await pipeline.toBuffer({ resolveWithObject: true });
  const changed = Math.abs(w - (meta.width ?? 0)) > 2 || Math.abs(h - (meta.height ?? 0)) > 2 || !!opts.size;
  return { buffer: out.data, width: out.info.width, height: out.info.height, changed };
}
