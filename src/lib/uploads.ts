import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DB_PATH } from "./sqlite";

/**
 * File storage for admin uploads (product images, order receipts).
 * Files live next to the database (`<data dir>/uploads`, i.e. /app/data/uploads in the container) so they are
 * persisted by the same volume, and are served by `/api/files/<path>` (see src/app/api/files).
 */
export const UPLOAD_DIR = process.env.LIEN_UPLOAD_DIR ?? path.join(path.dirname(DB_PATH), "uploads");
export const FILES_URL_PREFIX = "/api/files/";

const SECRET = process.env.ADMIN_SESSION_SECRET ?? "lien-dev-secret-change-me";

export const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
};

export const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
export const RECEIPT_MIMES = new Set([...IMAGE_MIMES, "application/pdf"]);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function extForMime(mime: string): string {
  return Object.entries(MIME_BY_EXT).find(([, m]) => m === mime)?.[0] ?? "";
}

/** Reject anything that could escape the uploads dir; returns the normalised relative path. */
export function safeRelativePath(rel: string): string | null {
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean.includes("..") || clean.includes("\0")) return null;
  if (!/^[A-Za-z0-9._\-\/]+$/.test(clean)) return null;
  return clean;
}

export function absolutePath(rel: string): string | null {
  const clean = safeRelativePath(rel);
  if (!clean) return null;
  const abs = path.resolve(UPLOAD_DIR, clean);
  return abs.startsWith(path.resolve(UPLOAD_DIR) + path.sep) ? abs : null;
}

export function slugifyFileName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "file";
}

/** Writes a buffer under UPLOAD_DIR/<subdir>/<name> and returns the relative path + public URL. */
export async function saveUpload(subdir: string, fileName: string, data: Buffer): Promise<{ rel: string; url: string; abs: string }> {
  const rel = safeRelativePath(`${subdir}/${fileName}`);
  if (!rel) throw new Error("Tên file không hợp lệ");
  const abs = absolutePath(rel);
  if (!abs) throw new Error("Đường dẫn không hợp lệ");
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, data);
  return { rel, url: FILES_URL_PREFIX + rel, abs };
}

export async function deleteUpload(rel: string): Promise<boolean> {
  const abs = absolutePath(rel);
  if (!abs) return false;
  try {
    await fs.promises.unlink(abs);
    return true;
  } catch {
    return false;
  }
}

export function uniqueName(base: string, ext: string): string {
  return `${base}-${randomBytes(4).toString("hex")}${ext}`;
}

/** File existence per uploaded URL, cached for a minute (order lists check every line's image). */
const existsCache = new Map<string, { ok: boolean; at: number }>();
const PUBLIC_DIR = path.join(process.cwd(), "public");
/**
 * False for an /api/files/… upload or a static /sites/… image whose file is gone; anything else (http…, data:) and
 * a build without its public folder next to the server are assumed fine.
 */
export function uploadUrlExists(url: string): boolean {
  const rel = relFromUrl(url);
  const isStatic = !rel && url.startsWith("/sites/");
  if (!rel && !isStatic) return true;
  const hit = existsCache.get(url);
  if (hit && Date.now() - hit.at < 60_000) return hit.ok;
  let ok: boolean;
  if (rel) {
    const abs = absolutePath(rel);
    ok = !!abs && fs.existsSync(abs);
  } else {
    const abs = path.resolve(PUBLIC_DIR, "." + decodeURI(url.split("?")[0]));
    ok = !abs.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(path.join(PUBLIC_DIR, "sites")) || fs.existsSync(abs);
  }
  existsCache.set(url, { ok, at: Date.now() });
  return ok;
}

/**
 * Image of an order line: the photo copied onto the line when it was ordered, unless that uploaded file was removed
 * since (the product's photos were replaced) — then the product's current thumbnail.
 */
export function orderLineImage(saved: string, productThumb: string | null | undefined): string {
  const current = (productThumb ?? "").trim();
  if (!saved) return current;
  if (uploadUrlExists(saved)) return saved;
  return current && uploadUrlExists(current) ? current : saved;
}

/** Convert a public URL (/api/files/x/y.jpg) back to the storage-relative path, or null for other URLs. */
export function relFromUrl(url: string): string | null {
  return url.startsWith(FILES_URL_PREFIX) ? safeRelativePath(url.slice(FILES_URL_PREFIX.length)) : null;
}

/** Signed token that lets a customer download the receipts of one order without logging in (links on the order pages). */
export function orderFileToken(orderId: string): string {
  return createHmac("sha256", SECRET).update(`order-files:${orderId}`).digest("base64url").slice(0, 32);
}

export function verifyOrderFileToken(orderId: string, token: string | null): boolean {
  if (!token) return false;
  const a = Buffer.from(orderFileToken(orderId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Thumbnail for an image path: the "-300x300" sibling when it exists (uploads or public/), else the image itself. */
export async function resolveThumbFor(image: string): Promise<string> {
  const sibling = image.replace(/(\.[a-z0-9]+)(\?.*)?$/i, "-300x300$1");
  if (sibling === image) return image;
  const rel = relFromUrl(sibling);
  if (rel) {
    const abs = absolutePath(rel);
    if (abs && fs.existsSync(abs)) return sibling;
    return image;
  }
  if (sibling.startsWith("/") && !sibling.startsWith("//")) {
    const pub = path.join(process.cwd(), "public", sibling.split("?")[0]);
    if (fs.existsSync(pub)) return sibling;
  }
  return image;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
