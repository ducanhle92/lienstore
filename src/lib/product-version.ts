import { createHash } from "node:crypto";

/**
 * Optimistic concurrency for product writes (Admin API v1, CLI `lienstore`).
 * The version is a short hash of the stored product as read from the database, so ANY change to the row — an admin
 * edit, a stock movement, a pricing job — gives a new version. A writer that read version X passes it back as
 * `expectedVersion`; `saveProduct` compares it with the row inside its transaction and refuses to overwrite newer data.
 */
export function productVersion(product: object): string {
  return createHash("sha256").update(stableJson(product)).digest("hex").slice(0, 16);
}

function stableJson(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
    .join(",")}}`;
}

/** Thrown by `saveProduct` when the row changed after the caller read it. */
export class ProductVersionConflictError extends Error {
  constructor(
    readonly productId: number,
    readonly expectedVersion: string,
    readonly currentVersion: string,
  ) {
    super(`Sản phẩm #${productId} đã thay đổi sau khi bạn đọc (phiên bản ${expectedVersion} → ${currentVersion}).`);
    this.name = "ProductVersionConflictError";
  }
}
