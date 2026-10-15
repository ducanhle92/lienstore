import "server-only";
import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { costPriceFromJpy } from "@/lib/cost-sources";
import { NO_IMAGE } from "@/lib/contact-links";
import { descendantSlugs } from "@/lib/categories";
import { getAllProducts, getCategories, getJpyRate, getPricingConfig, getProductById, getProductBySlug, getSourceFeeMap, type ProductInput, saveProductSync, slugExists } from "@/lib/db";
import { slugify } from "@/lib/format";
import { plainToHtml } from "@/lib/plain-html";
import { expectedPriceOf, promoPriceOf } from "@/lib/price-display";
import { isValidDimsCm, isValidWeightG, normalizeDimsCm, PRODUCT_MESSAGES, resolveWebPrices } from "@/lib/product-rules";
import { ProductVersionConflictError, productVersion } from "@/lib/product-version";
import { billableProductWeightG } from "@/lib/shipping";
import { getDb, withTransaction } from "@/lib/sqlite";
import { absolutePath, deleteUpload, relFromUrl, resolveThumbFor } from "@/lib/uploads";
import { recordAudit } from "@/lib/api-tokens";
import type { CatalogProduct, ShopCategory } from "@/types/shop";

/**
 * Product business logic shared by the admin UI (Server Actions in app/admin/products/actions.ts) and the Admin API v1
 * (app/api/admin/v1/**, CLI `lienstore`). Validation messages come from `product-rules.ts`, prices are stored through
 * `storedPrices`, saves go through `saveProduct(Sync)` (change history), and every write ends with the same upload
 * clean-up + cache revalidation as the admin form.
 *
 * Concurrency: every update is applied on top of the row as read, with `expectedVersion` = that row's version, so a
 * change made in between (admin form, stock movement, pricing job) is never overwritten — the write is refused with
 * 409 VERSION_CONFLICT (or transparently re-planned when the caller did not pin a version).
 */

// ---------------------------------------------------------------------------------------------------------------------
// Errors

export type ServiceErrorCode = "VALIDATION_FAILED" | "NOT_FOUND" | "VERSION_CONFLICT" | "DUPLICATE_SLUG" | "DUPLICATE_SKU" | "BULK_REJECTED" | "BAD_REQUEST";

export class ProductServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: ServiceErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ProductServiceError";
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// API representation

export interface ApiProduct {
  id: number;
  slug: string;
  name: string;
  nameJa: string;
  sku: string | null;
  status: "publish" | "draft";
  saleStatus: "instock" | "discontinued";
  /** Giá bán trên web (giá kỳ vọng), 0 = "Liên hệ". */
  price: number;
  /** Giá khuyến mại đang chạy, null = không có. */
  promoPrice: number | null;
  marketPrice: number | null;
  /** What a shopper pays now (promo when running, else price). Read-only. */
  currentPrice: number;
  categories: string[];
  tags: string[];
  images: string[];
  thumb: string;
  shortDescription: string;
  description: string;
  shortDescriptionJa: string;
  descriptionJa: string;
  weightG: number | null;
  dimsCm: string | null;
  fulfillment: "stock" | "order";
  stock: number | null;
  stockVn: number | null;
  labelId: number | null;
  groupId: number | null;
  variantAttrs: Record<string, string>;
  url: string;
  adminUrl: string;
  createdAt: string;
  updatedAt: string;
  version: string;
  /** Only for tokens whose owner may see costs ("see_cost"). */
  costPrice?: number | null;
  costJpy?: number | null;
  costSource?: string;
  marginPct?: number | null;
}

export const API_PRODUCT_FIELDS = [
  "id", "slug", "name", "nameJa", "sku", "status", "saleStatus", "price", "promoPrice", "marketPrice", "currentPrice", "categories", "tags", "images", "thumb",
  "shortDescription", "description", "shortDescriptionJa", "descriptionJa", "weightG", "dimsCm", "fulfillment", "stock", "stockVn", "labelId", "groupId", "variantAttrs",
  "url", "adminUrl", "createdAt", "updatedAt", "version", "costPrice", "costJpy", "costSource", "marginPct",
] as const;
export const LIST_DEFAULT_FIELDS = ["id", "name", "sku", "status", "saleStatus", "price", "promoPrice", "currentPrice", "categories", "thumb", "updatedAt", "version"];
const COST_FIELDS = new Set(["costPrice", "costJpy", "costSource", "marginPct"]);

export function toApiProduct(p: CatalogProduct, opts: { includeCost?: boolean } = {}): ApiProduct {
  const out: ApiProduct = {
    id: p.id,
    slug: p.slug,
    name: p.name,
    nameJa: p.nameJa,
    sku: p.sku,
    status: p.status,
    saleStatus: p.stockStatus,
    price: expectedPriceOf(p),
    promoPrice: promoPriceOf(p),
    marketPrice: p.marketPrice,
    currentPrice: p.price,
    categories: p.categories,
    tags: p.tags,
    images: p.images,
    thumb: p.thumb,
    shortDescription: p.shortDescription,
    description: p.description,
    shortDescriptionJa: p.shortDescriptionJa,
    descriptionJa: p.descriptionJa,
    weightG: p.weightG,
    dimsCm: p.dimsCm,
    fulfillment: p.fulfillment,
    stock: p.stock,
    stockVn: p.stockVn,
    labelId: p.labelId,
    groupId: p.groupId,
    variantAttrs: p.variantAttrs,
    url: `/product/${p.slug}/`,
    adminUrl: `/admin/products/${p.id}/`,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    version: productVersion(p),
  };
  if (opts.includeCost) Object.assign(out, { costPrice: p.costPrice, costJpy: p.costJpy, costSource: p.costSource, marginPct: p.marginPct });
  return out;
}

/** Keep only the requested fields (unknown names are reported by `parseFieldList`). */
export function pickFields(p: ApiProduct, fields: string[] | null): Partial<ApiProduct> {
  if (!fields) return p;
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in p) out[f] = (p as unknown as Record<string, unknown>)[f];
  return out as Partial<ApiProduct>;
}

export function parseFieldList(raw: string | null, includeCost: boolean): { fields: string[] | null; unknown: string[] } {
  if (!raw || raw.trim() === "" || raw.trim() === "all" || raw.trim() === "*") return { fields: null, unknown: [] };
  const list = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  const known = new Set<string>(API_PRODUCT_FIELDS.filter((f) => includeCost || !COST_FIELDS.has(f)));
  return { fields: list.filter((f) => known.has(f)), unknown: list.filter((f) => !known.has(f)) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Listing

export interface ProductListQuery {
  search?: string;
  category?: string;
  status?: "publish" | "draft" | "all";
  saleStatus?: "instock" | "discontinued";
  sku?: string;
  ids?: number[];
  hasImage?: boolean;
  priceMin?: number;
  priceMax?: number;
  updatedSince?: string;
  sort?: string;
  page?: number;
  perPage?: number;
}

export const LIST_SORTS = ["id", "-id", "name", "-name", "price", "-price", "updated", "-updated", "created", "-created"] as const;
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

export async function listProducts(q: ProductListQuery): Promise<{ items: CatalogProduct[]; total: number; page: number; perPage: number; totalPages: number }> {
  const perPage = Math.min(Math.max(q.perPage ?? 20, 1), 200);
  const page = Math.max(q.page ?? 1, 1);
  let items = await getAllProducts(true);
  const status = q.status ?? "all";
  if (status !== "all") items = items.filter((p) => p.status === status);
  if (q.saleStatus) items = items.filter((p) => p.stockStatus === q.saleStatus);
  if (q.category) {
    const slugs = new Set(descendantSlugs(await getCategories(), q.category));
    items = items.filter((p) => p.categories.some((c) => slugs.has(c)));
  }
  if (q.sku) {
    const sku = q.sku.trim().toLowerCase();
    items = items.filter((p) => (p.sku ?? "").toLowerCase() === sku);
  }
  if (q.ids?.length) {
    const ids = new Set(q.ids);
    items = items.filter((p) => ids.has(p.id));
  }
  if (q.hasImage !== undefined) items = items.filter((p) => (p.thumb !== NO_IMAGE && !!p.thumb) === q.hasImage);
  if (q.priceMin !== undefined) items = items.filter((p) => p.price >= q.priceMin!);
  if (q.priceMax !== undefined) items = items.filter((p) => p.price <= q.priceMax!);
  if (q.updatedSince) items = items.filter((p) => p.updatedAt >= q.updatedSince!);
  if (q.search?.trim()) {
    const raw = q.search.trim();
    const asId = /^#?\d+$/.test(raw) ? Number.parseInt(raw.replace("#", ""), 10) : null;
    const terms = fold(raw).split(/\s+/).filter(Boolean);
    items = items.filter((p) => {
      if (asId !== null && p.id === asId) return true;
      const hay = fold(`${p.name} ${p.nameJa} ${p.sku ?? ""} ${p.slug} ${p.tags.join(" ")}`);
      return terms.every((t) => hay.includes(t));
    });
  }
  const sort = q.sort ?? "-updated";
  const dir = sort.startsWith("-") ? -1 : 1;
  const key = sort.replace(/^-/, "");
  const cmp: Record<string, (a: CatalogProduct, b: CatalogProduct) => number> = {
    id: (a, b) => a.id - b.id,
    name: (a, b) => a.name.localeCompare(b.name, "vi"),
    price: (a, b) => a.price - b.price || a.id - b.id,
    updated: (a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id - b.id,
    created: (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id,
  };
  items = [...items].sort((a, b) => dir * (cmp[key] ?? cmp.id)(a, b));
  const total = items.length;
  return { items: items.slice((page - 1) * perPage, page * perPage), total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Write input (JSON body of create / update / bulk items)

export interface ProductWriteInput {
  name?: string;
  nameJa?: string;
  slug?: string;
  sku?: string | null;
  price?: number | null;
  promoPrice?: number | null;
  marketPrice?: number | null;
  shortDescription?: string;
  description?: string;
  shortDescriptionJa?: string;
  descriptionJa?: string;
  categories?: string[];
  tags?: string[];
  images?: string[];
  thumb?: string;
  status?: "publish" | "draft";
  saleStatus?: "instock" | "discontinued";
  weightG?: number | null;
  dimsCm?: string | null;
}

type Kind = "string" | "nullableString" | "nullableInt" | "stringArray" | "status" | "saleStatus";
export const WRITABLE_FIELDS: Record<keyof ProductWriteInput, Kind> = {
  name: "string",
  nameJa: "string",
  slug: "string",
  sku: "nullableString",
  price: "nullableInt",
  promoPrice: "nullableInt",
  marketPrice: "nullableInt",
  shortDescription: "string",
  description: "string",
  shortDescriptionJa: "string",
  descriptionJa: "string",
  categories: "stringArray",
  tags: "stringArray",
  images: "stringArray",
  thumb: "string",
  status: "status",
  saleStatus: "saleStatus",
  weightG: "nullableInt",
  dimsCm: "nullableString",
};
const MAX_TEXT = 200_000;

/** Type-checks a JSON object against the writable fields. Unknown / read-only keys are errors (catches typos). */
export function parseWriteInput(body: unknown, ignore: string[] = []): { input: ProductWriteInput; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const input: Record<string, unknown> = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) return { input: {}, fields: { _: "Body phải là một JSON object." } };
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (ignore.includes(k)) continue;
    const kind = (WRITABLE_FIELDS as Record<string, Kind | undefined>)[k];
    if (!kind) {
      fields[k] = (API_PRODUCT_FIELDS as readonly string[]).includes(k) ? "Trường chỉ đọc, không sửa qua API." : "Trường không tồn tại (xem docs/ADMIN_API.md).";
      continue;
    }
    switch (kind) {
      case "string":
        if (typeof v !== "string") fields[k] = "Phải là chuỗi.";
        else if (v.length > MAX_TEXT) fields[k] = "Quá dài.";
        else input[k] = v;
        break;
      case "nullableString":
        if (v !== null && typeof v !== "string") fields[k] = "Phải là chuỗi hoặc null.";
        else input[k] = v === null ? null : (v as string).trim() || null;
        break;
      case "nullableInt":
        if (v !== null && (typeof v !== "number" || !Number.isInteger(v))) fields[k] = "Phải là số nguyên (VNĐ / gram) hoặc null.";
        else input[k] = v;
        break;
      case "stringArray":
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) fields[k] = "Phải là mảng chuỗi.";
        else input[k] = (v as string[]).map((x) => x.trim()).filter(Boolean);
        break;
      case "status":
        if (v !== "publish" && v !== "draft") fields[k] = 'Chỉ nhận "publish" (đang bán) hoặc "draft" (nháp/ẩn).';
        else input[k] = v;
        break;
      case "saleStatus":
        if (v !== "instock" && v !== "discontinued") fields[k] = 'Chỉ nhận "instock" hoặc "discontinued" (ngừng kinh doanh).';
        else input[k] = v;
        break;
    }
  }
  return { input: input as ProductWriteInput, fields };
}

// ---------------------------------------------------------------------------------------------------------------------
// Shared helpers (also used by the admin Server Action)

/** VND cost from a ¥ quote + the source's surcharges for the item's billable weight (Kho hàng › Công thức giá). */
export async function deriveCostPrice(p: Pick<CatalogProduct, "costJpy" | "costSource" | "weightG" | "dimsCm" | "dimsConfidence">): Promise<number | null> {
  if (!p.costJpy) return null;
  return costPriceFromJpy(p.costJpy, p.costSource, await getJpyRate(), getSourceFeeMap(), billableProductWeightG(p.weightG, p.dimsCm, p.dimsConfidence), (await getPricingConfig()).lotWeightG);
}

/** Delete uploaded files that were removed from a product and are not referenced by any other product. */
export async function cleanupRemovedUploads(before: string[], after: string[], productId: number): Promise<void> {
  const removed = before.filter((u) => !after.includes(u) && relFromUrl(u));
  if (removed.length === 0) return;
  const others = (await getAllProducts(true)).filter((p) => p.id !== productId);
  for (const url of removed) {
    if (others.some((p) => p.images.includes(url) || p.thumb === url)) continue;
    const rel = relFromUrl(url);
    if (!rel) continue;
    await deleteUpload(rel);
    await deleteUpload(rel.replace(/(\.[a-z0-9]+)$/i, "-300x300$1"));
  }
}

/** Storefront + admin pages read the catalogue: refresh them after a write (no-op outside a Next.js request). */
export function revalidateCatalog(): void {
  try {
    revalidatePath("/", "layout");
  } catch (e) {
    if (process.env.NEXT_RUNTIME) console.warn("[product-service] revalidatePath failed:", e instanceof Error ? e.message : e);
  }
}

/** An image path the storefront can serve: an uploaded file (/api/files/…) that exists, or a file under public/. */
function imagePathError(url: string): string | null {
  if (/^https?:\/\//i.test(url)) return `Ảnh ngoài (${url.slice(0, 60)}) không dùng được — upload trước bằng \`lienstore media upload\`.`;
  const rel = relFromUrl(url);
  if (rel) {
    const abs = absolutePath(rel);
    return abs && fs.existsSync(abs) ? null : `Không tìm thấy ảnh đã upload: ${url}`;
  }
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("..")) {
    return fs.existsSync(path.join(process.cwd(), "public", url.split("?")[0])) ? null : `Không tìm thấy ảnh: ${url}`;
  }
  return `Đường dẫn ảnh không hợp lệ: ${url}`;
}

function resolveCategories(wanted: string[], all: ShopCategory[]): { slugs: string[]; unknown: string[] } {
  const bySlug = new Set(all.map((c) => c.slug));
  const byName = new Map(all.map((c) => [fold(c.name.trim()), c.slug]));
  const slugs: string[] = [];
  const unknown: string[] = [];
  for (const w of wanted) {
    const slug = bySlug.has(w) ? w : byName.get(fold(w.trim()));
    if (slug) {
      if (!slugs.includes(slug)) slugs.push(slug);
    } else unknown.push(w);
  }
  return { slugs, unknown };
}

// ---------------------------------------------------------------------------------------------------------------------
// Planning (validation + merge, no writes)

type Base = Omit<ProductInput, "id">;

/** CatalogProduct → the ProductInput that saves it unchanged (variant family left alone). */
function inputFrom(p: CatalogProduct): ProductInput {
  const { createdAt, updatedAt, stockVn, variantSummary, groupId, variantAttrs, variantPosition, ...rest } = p;
  void createdAt;
  void updatedAt;
  void stockVn;
  void variantSummary;
  void groupId;
  void variantAttrs;
  void variantPosition;
  return { ...rest };
}

/** Applies `input` on top of `base`; returns field errors (messages as in the admin form). */
async function mergeInput(base: Base, input: ProductWriteInput, existingId: number | undefined, categories: ShopCategory[]): Promise<{ next: Base; fields: Record<string, string> }> {
  const fields: Record<string, string> = {};
  const next: Base = { ...base, categories: [...base.categories], tags: [...base.tags], images: [...base.images] };

  if (input.name !== undefined) {
    next.name = input.name.trim();
    if (!next.name) fields.name = PRODUCT_MESSAGES.nameRequired;
  }
  if (input.nameJa !== undefined) next.nameJa = input.nameJa.trim();
  if (input.slug !== undefined) {
    next.slug = slugify(input.slug);
    if (!next.slug) fields.slug = PRODUCT_MESSAGES.slugInvalid;
    else if (await slugExists(next.slug, existingId)) fields.slug = PRODUCT_MESSAGES.slugTaken;
  }
  if (input.sku !== undefined) {
    if (input.sku && input.sku.length > 64) fields.sku = "SKU tối đa 64 ký tự.";
    else next.sku = input.sku;
  }

  // prices: only re-derived when one of the three is sent, so an untouched product keeps its stored pair exactly
  if (input.price !== undefined || input.promoPrice !== undefined || input.marketPrice !== undefined) {
    const expected = input.price !== undefined ? (input.price ?? 0) : expectedPriceOf(base);
    const promo = input.promoPrice !== undefined ? input.promoPrice : promoPriceOf(base);
    const market = input.marketPrice !== undefined ? input.marketPrice : (base.marketPrice ?? null);
    const r = resolveWebPrices(expected, promo, market);
    Object.assign(fields, r.fields);
    next.price = r.price;
    next.regularPrice = r.regularPrice;
    next.marketPrice = market;
  }

  if (input.shortDescription !== undefined) next.shortDescription = plainToHtml(input.shortDescription);
  if (input.description !== undefined) next.description = input.description;
  if (input.shortDescriptionJa !== undefined) next.shortDescriptionJa = plainToHtml(input.shortDescriptionJa);
  if (input.descriptionJa !== undefined) next.descriptionJa = input.descriptionJa;

  if (input.categories !== undefined) {
    const { slugs, unknown } = resolveCategories(input.categories, categories);
    if (unknown.length) fields.categories = `Danh mục không tồn tại: ${unknown.join(", ")} (xem \`lienstore categories list\`).`;
    else if (!slugs.length) fields.categories = PRODUCT_MESSAGES.categoriesRequired;
    else next.categories = slugs;
  }
  if (input.tags !== undefined) next.tags = [...new Set(input.tags)];

  if (input.images !== undefined || input.thumb !== undefined) {
    const images = input.images ?? base.images.filter((u) => u !== NO_IMAGE);
    const bad = [...images, ...(input.thumb ? [input.thumb] : [])].map(imagePathError).filter((e): e is string => !!e);
    if (bad.length) fields.images = bad.join(" ");
    else {
      // same rule as the admin form: the listing thumb is the 300×300 sibling of the first picture, placeholder without one
      const thumb = input.thumb || (images[0] ? await resolveThumbFor(images[0]) : NO_IMAGE);
      next.images = images.length ? images : [thumb];
      next.thumb = thumb;
    }
  }

  if (input.status !== undefined) next.status = input.status;
  if (input.saleStatus !== undefined) next.stockStatus = input.saleStatus;

  let weightChanged = false;
  if (input.weightG !== undefined) {
    if (!isValidWeightG(input.weightG)) fields.weightG = PRODUCT_MESSAGES.weightG;
    else {
      weightChanged ||= input.weightG !== base.weightG;
      next.weightG = input.weightG;
    }
  }
  if (input.dimsCm !== undefined) {
    const dims = normalizeDimsCm(input.dimsCm);
    if (!isValidDimsCm(dims)) fields.dimsCm = PRODUCT_MESSAGES.dimsCm;
    else {
      weightChanged ||= dims !== base.dimsCm;
      next.dimsCm = dims;
    }
  }
  // the VND cost depends on the billable weight (source surcharges per kg) — re-derive it like the admin form does
  if (weightChanged && next.costJpy) next.costPrice = await deriveCostPrice(next);

  return { next, fields };
}

export interface FieldChange {
  before: unknown;
  after: unknown;
}

const DIFF_SKIP = new Set(["version", "updatedAt", "createdAt", "url", "adminUrl"]);
function diffApi(before: ApiProduct, after: ApiProduct): Record<string, FieldChange> {
  const out: Record<string, FieldChange> = {};
  for (const k of Object.keys(after) as Array<keyof ApiProduct>) {
    if (DIFF_SKIP.has(k)) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = { before: before[k], after: after[k] };
  }
  // the storefront path follows the slug
  if (before.slug !== after.slug) out.url = { before: before.url, after: after.url };
  return out;
}

export interface UpdatePlan {
  id: number;
  status: "ok" | "unchanged" | "invalid" | "not_found" | "conflict";
  /** Version the plan was computed from (what the write will require). */
  version: string | null;
  changes: Record<string, FieldChange>;
  errors?: Record<string, string>;
  message?: string;
  before?: CatalogProduct;
  next?: ProductInput;
}

export interface ServiceContext {
  actor: string;
  tokenId?: number | null;
  requestId?: string;
  ip?: string;
  includeCost?: boolean;
}

async function planUpdate(id: number, input: ProductWriteInput, expectedVersion: string | null, categories: ShopCategory[], includeCost: boolean): Promise<UpdatePlan> {
  const existing = await getProductById(id);
  if (!existing) return { id, status: "not_found", version: null, changes: {}, message: `Không có sản phẩm #${id}.` };
  const version = productVersion(existing);
  if (expectedVersion && expectedVersion !== version) {
    return { id, status: "conflict", version, changes: {}, message: `Sản phẩm #${id} đã thay đổi sau phiên bản ${expectedVersion} (hiện tại ${version}) — đọc lại rồi chạy lại.` };
  }
  const { next, fields } = await mergeInput(inputFrom(existing), input, id, categories);
  if (Object.keys(fields).length) return { id, status: "invalid", version, changes: {}, errors: fields, message: "Dữ liệu không hợp lệ." };
  const after = { ...existing, ...next } as CatalogProduct;
  const changes = diffApi(toApiProduct(existing, { includeCost }), toApiProduct(after, { includeCost }));
  return { id, status: Object.keys(changes).length ? "ok" : "unchanged", version, changes, before: existing, next: { ...next, id } };
}

function planResult(p: UpdatePlan) {
  return { id: p.id, status: p.status, version: p.version, changes: p.changes, ...(p.errors ? { errors: p.errors } : {}), ...(p.message ? { message: p.message } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Commands

const MAX_ATTEMPTS = 3;

export async function getProductForApi(id: number, includeCost = false): Promise<ApiProduct> {
  const p = await getProductById(id);
  if (!p) throw new ProductServiceError(404, "NOT_FOUND", `Không có sản phẩm #${id}.`);
  return toApiProduct(p, { includeCost });
}

/**
 * PATCH semantics: only the sent fields change. `expectedVersion` (If-Match) pins the version the caller saw; without
 * it the update is re-planned on the fresh row when something else wrote in between.
 */
export async function updateProduct(id: number, input: ProductWriteInput, opts: { expectedVersion?: string | null; dryRun?: boolean }, ctx: ServiceContext) {
  const categories = await getCategories();
  for (let attempt = 1; ; attempt++) {
    const plan = await planUpdate(id, input, opts.expectedVersion ?? null, categories, !!ctx.includeCost);
    if (plan.status === "not_found") throw new ProductServiceError(404, "NOT_FOUND", plan.message!);
    if (plan.status === "conflict") throw new ProductServiceError(409, "VERSION_CONFLICT", plan.message!, { id, expectedVersion: opts.expectedVersion, currentVersion: plan.version });
    if (plan.status === "invalid") throw new ProductServiceError(422, "VALIDATION_FAILED", "Dữ liệu không hợp lệ.", { fields: plan.errors });
    if (opts.dryRun || plan.status === "unchanged") {
      return { dryRun: !!opts.dryRun, unchanged: plan.status === "unchanged", changes: plan.changes, product: toApiProduct(plan.before!, { includeCost: ctx.includeCost }) };
    }
    try {
      const saved = saveProductSync(getDb(), { ...plan.next!, expectedVersion: plan.version!, changedBy: ctx.actor });
      await cleanupRemovedUploads(plan.before!.images, saved.images, saved.id);
      revalidateCatalog();
      recordAudit({ actor: ctx.actor, tokenId: ctx.tokenId, action: "products.update", target: `product:${id}`, changes: plan.changes, requestId: ctx.requestId, ip: ctx.ip });
      return { dryRun: false, unchanged: false, changes: plan.changes, product: toApiProduct(saved, { includeCost: ctx.includeCost }) };
    } catch (e) {
      if (!(e instanceof ProductVersionConflictError)) throw e;
      if (opts.expectedVersion || attempt >= MAX_ATTEMPTS) throw new ProductServiceError(409, "VERSION_CONFLICT", e.message, { id, expectedVersion: e.expectedVersion, currentVersion: e.currentVersion });
    }
  }
}

export interface BulkItem {
  id: number;
  version?: string | null;
  set: ProductWriteInput;
}

/**
 * Bulk update — ATOMIC: every item is validated and version-checked first; if any item is invalid, missing or stale
 * nothing is written (422 / 404 / 409 with the per-item report). Otherwise all items are saved in ONE transaction.
 * `dryRun` returns the same report (with `changes` before/after and the `version` each item was planned from) and an
 * `apply` body that pins those versions, so applying it later fails instead of overwriting newer edits.
 */
export async function bulkUpdateProducts(items: BulkItem[], opts: { dryRun?: boolean }, ctx: ServiceContext) {
  if (!items.length) throw new ProductServiceError(400, "BAD_REQUEST", "Danh sách cập nhật trống.");
  if (items.length > 200) throw new ProductServiceError(400, "BAD_REQUEST", "Tối đa 200 sản phẩm mỗi lần.");
  const seen = new Set<number>();
  for (const it of items) {
    if (seen.has(it.id)) throw new ProductServiceError(400, "BAD_REQUEST", `Sản phẩm #${it.id} xuất hiện hai lần.`);
    seen.add(it.id);
  }
  const categories = await getCategories();
  for (let attempt = 1; ; attempt++) {
    const plans: UpdatePlan[] = [];
    for (const it of items) plans.push(await planUpdate(it.id, it.set, it.version ?? null, categories, !!ctx.includeCost));
    const results = plans.map(planResult);
    const summary = {
      total: plans.length,
      changed: plans.filter((p) => p.status === "ok").length,
      unchanged: plans.filter((p) => p.status === "unchanged").length,
      failed: plans.filter((p) => p.status !== "ok" && p.status !== "unchanged").length,
    };
    const failing = plans.filter((p) => p.status === "invalid" || p.status === "not_found" || p.status === "conflict");
    if (opts.dryRun) {
      const apply = { items: plans.filter((p) => p.status === "ok").map((p) => ({ id: p.id, version: p.version, set: items.find((it) => it.id === p.id)!.set })) };
      return { dryRun: true, atomic: true, applied: false, summary, results, ...(failing.length ? {} : { apply }) };
    }
    if (failing.length) {
      const status = failing.some((p) => p.status === "invalid") ? 422 : failing.some((p) => p.status === "conflict") ? 409 : 404;
      throw new ProductServiceError(status, "BULK_REJECTED", `${failing.length}/${plans.length} mục lỗi — không ghi mục nào (cập nhật hàng loạt là nguyên tử).`, { summary, results });
    }
    const toWrite = plans.filter((p) => p.status === "ok");
    try {
      const db = getDb();
      const saved = withTransaction(db, () => toWrite.map((p) => saveProductSync(db, { ...p.next!, expectedVersion: p.version!, changedBy: ctx.actor })));
      for (let i = 0; i < saved.length; i++) await cleanupRemovedUploads(toWrite[i].before!.images, saved[i].images, saved[i].id);
      if (saved.length) revalidateCatalog();
      for (const p of toWrite) recordAudit({ actor: ctx.actor, tokenId: ctx.tokenId, action: "products.bulk-update", target: `product:${p.id}`, changes: p.changes, requestId: ctx.requestId, ip: ctx.ip });
      const versions = new Map(saved.map((s) => [s.id, productVersion(s)]));
      return { dryRun: false, atomic: true, applied: true, summary, results: results.map((r) => (versions.has(r.id) ? { ...r, version: versions.get(r.id)! } : r)) };
    } catch (e) {
      if (!(e instanceof ProductVersionConflictError)) throw e;
      if (items.some((it) => it.version) || attempt >= MAX_ATTEMPTS) {
        throw new ProductServiceError(409, "BULK_REJECTED", `${e.message} Không ghi mục nào.`, { summary, results: results.map((r) => (r.id === e.productId ? { ...r, status: "conflict", version: e.currentVersion } : r)) });
      }
    }
  }
}

/**
 * Create a product. Required: name + at least one category. Defaults: draft (hidden until published), price 0 = "Liên hệ",
 * bought on order (stock not tracked). Duplicates are refused: the slug (from the name when not given) must be free,
 * and a non-empty SKU already used by another product is a 409 unless `allowDuplicateSku`.
 */
export async function createProduct(input: ProductWriteInput, opts: { allowDuplicateSku?: boolean; dryRun?: boolean }, ctx: ServiceContext) {
  const fields: Record<string, string> = {};
  if (!input.name?.trim()) fields.name = PRODUCT_MESSAGES.nameRequired;
  if (!input.categories?.length) fields.categories = PRODUCT_MESSAGES.categoriesRequired;
  if (Object.keys(fields).length) throw new ProductServiceError(422, "VALIDATION_FAILED", "Dữ liệu không hợp lệ.", { fields });

  const slug = slugify(input.slug ?? input.name!);
  if (slug) {
    const clash = await getProductBySlug(slug);
    if (clash) throw new ProductServiceError(409, "DUPLICATE_SLUG", `Đã có sản phẩm #${clash.id} "${clash.name}" với đường dẫn ${slug} — có thể đã tạo rồi; dùng update hoặc đặt slug khác.`, { existingId: clash.id, slug });
  }
  if (input.sku && !opts.allowDuplicateSku) {
    const sku = input.sku.trim().toLowerCase();
    const same = (await getAllProducts(true)).filter((p) => (p.sku ?? "").trim().toLowerCase() === sku);
    if (same.length) throw new ProductServiceError(409, "DUPLICATE_SKU", `SKU ${input.sku} đã dùng cho sản phẩm #${same.map((p) => p.id).join(", #")} — có thể đã tạo rồi.`, { existingIds: same.map((p) => p.id), sku: input.sku });
  }

  const base: Base = {
    slug,
    name: "",
    nameJa: "",
    price: 0,
    regularPrice: null,
    marketPrice: null,
    costPrice: null,
    supplierUrl: null,
    minStock: null,
    weightG: null,
    dimsCm: null,
    dimsConfidence: null,
    dimsSource: "",
    currency: "VNĐ",
    sku: null,
    stock: null,
    stockStatus: "instock",
    fulfillment: "order",
    costJpy: null,
    costSource: "",
    costUrl: "",
    costCheckedAt: null,
    marginPct: null,
    categories: [],
    tags: [],
    images: [NO_IMAGE],
    hot: false,
    labelId: null,
    label: null,
    thumb: NO_IMAGE,
    shortDescription: "",
    description: "",
    shortDescriptionJa: "",
    descriptionJa: "",
    related: [],
    rating: null,
    reviewCount: 0,
    status: "draft",
  };
  const { next, fields: errs } = await mergeInput(base, { ...input, slug: undefined }, undefined, await getCategories());
  if (!slug) errs.slug = PRODUCT_MESSAGES.slugInvalid;
  if (Object.keys(errs).length) throw new ProductServiceError(422, "VALIDATION_FAILED", "Dữ liệu không hợp lệ.", { fields: errs });
  if (opts.dryRun) {
    const preview = { ...next, id: 0, createdAt: "", updatedAt: "", stockVn: null, groupId: null, variantAttrs: {}, variantPosition: 0 } as CatalogProduct;
    return { dryRun: true, created: false, product: toApiProduct(preview, { includeCost: ctx.includeCost }) };
  }
  const saved = saveProductSync(getDb(), { ...next, changedBy: ctx.actor });
  revalidateCatalog();
  const product = toApiProduct(saved, { includeCost: ctx.includeCost });
  recordAudit({ actor: ctx.actor, tokenId: ctx.tokenId, action: "products.create", target: `product:${saved.id}`, changes: { created: pickFields(product, ["name", "slug", "sku", "status", "price", "promoPrice", "marketPrice", "categories", "images"]) }, requestId: ctx.requestId, ip: ctx.ip });
  return { dryRun: false, created: true, product };
}
