import "server-only";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type {
  CustomerAddress,
  Banner,
  BlogPost,
  CartItem,
  CatalogProduct,
  Customer,
  Order,
  OrderCustomer,
  OrderFile,
  OrderFileKind,
  OrderLeg,
  OrderMessage,
  OrderStatus,
  PaymentMethod,
  ProductQuery,
  ProductQueryResult,
  ProductReview,
  ShipFeePayment,
  ShippingCarrier,
  ShippingMethod,
  ShippingZone,
  ShopCategory,
  StaticPage,
  UserRole,
  Voucher,
} from "@/types/shop";
import { descendantSlugs } from "./categories";
import { NO_EMAIL_DOMAIN, displayEmail } from "./customer-email";
import { packageDims, quoteGhn, type GhnQuote } from "./ghn";
import { applyShipPolicy, parseShipPolicy, policyFreeOver, type ShipPolicy } from "./ship-policy";
import { billableProductWeightG, buildQuoteConfig, isDimsConfidence, isShippingLeg, isShipStage, isSpecialHandling, quoteJpLegs, type ShipStage, type ShippingPricingMode, type ShippingQuoteConfig, zoneFeeForWeight } from "./shipping";
import { parsePricing, type PricingConfig } from "./pricing";
import { isPurchaseStatus, PIPELINE_STATUSES, type PurchaseStatus, purchaseIndex, STAGE_TO_PURCHASE } from "./purchase";
import { parseTheme, type SiteTheme } from "./theme";
import type { DatabaseSync } from "node:sqlite";
import { getDb, getSchemaInfo, getSetting, setSetting, withTransaction } from "./sqlite";

/** Synchronous category list for use inside transactions. */
function await0(db: ReturnType<typeof getDb>): ShopCategory[] {
  return (db.prepare("SELECT slug, name, description, image, parent_slug, name_ja, 0 AS count FROM categories").all() as unknown as CategoryRow[]).map(rowToCategory);
}

/**
 * Data-access layer on top of SQLite (see `sqlite.ts` for schema + migrations).
 * Every function is async so callers do not change if the backend moves to Postgres later.
 */

// ---------- Row mappers ----------

interface ProductRow {
  id: number;
  slug: string;
  name: string;
  price: number;
  regular_price: number | null;
  cost_price: number | null;
  supplier_url: string | null;
  min_stock: number | null;
  weight_g: number | null;
  dims_cm: string | null;
  dims_confidence: string | null;
  dims_source: string | null;
  name_ja: string | null;
  short_description_ja: string | null;
  description_ja: string | null;
  currency: string;
  sku: string | null;
  stock: number | null;
  stock_status: "instock" | "outofstock";
  fulfillment: string | null;
  cost_jpy: number | null;
  cost_source: string | null;
  cost_url: string | null;
  cost_checked_at: string | null;
  tags: string;
  images: string;
  thumb: string;
  short_description: string;
  description: string;
  related: string;
  rating: number | null;
  review_count: number;
  status: "publish" | "draft";
  created_at: string;
  updated_at: string;
  categories: string | null;
}

const PRODUCT_SELECT = `SELECT p.*,
  (SELECT json_group_array(category_slug) FROM (SELECT category_slug FROM product_categories WHERE product_id = p.id ORDER BY position)) AS categories
  FROM products p`;

function parseArr(s: string | null): string[] {
  try {
    const v = JSON.parse(s ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function rowToProduct(r: ProductRow): CatalogProduct {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    price: r.price,
    regularPrice: r.regular_price,
    costPrice: r.cost_price ?? null,
    costJpy: r.cost_jpy ?? null,
    costSource: r.cost_source ?? "",
    costUrl: r.cost_url ?? "",
    costCheckedAt: r.cost_checked_at ?? null,
    supplierUrl: r.supplier_url ?? null,
    minStock: r.min_stock ?? null,
    weightG: r.weight_g ?? null,
    dimsCm: r.dims_cm ?? null,
    dimsConfidence: isDimsConfidence(r.dims_confidence) ? r.dims_confidence : null,
    dimsSource: r.dims_source ?? "",
    nameJa: r.name_ja ?? "",
    shortDescriptionJa: r.short_description_ja ?? "",
    descriptionJa: r.description_ja ?? "",
    currency: r.currency,
    sku: r.sku,
    stock: r.stock,
    stockStatus: r.stock_status,
    fulfillment: r.fulfillment === "stock" ? "stock" : "order",
    categories: parseArr(r.categories),
    tags: parseArr(r.tags),
    images: parseArr(r.images),
    thumb: r.thumb,
    shortDescription: r.short_description,
    description: r.description,
    related: parseArr(r.related),
    rating: r.rating,
    reviewCount: r.review_count,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface CategoryRow {
  slug: string;
  name: string;
  description: string;
  image: string | null;
  parent_slug: string | null;
  count: number;
  name_ja?: string | null;
}

const CATEGORY_SELECT = `SELECT c.slug, c.name, c.description, c.image, c.parent_slug, c.name_ja,
  (SELECT COUNT(*) FROM product_categories pc JOIN products p ON p.id = pc.product_id
    WHERE pc.category_slug = c.slug AND p.status = 'publish') AS count
  FROM categories c`;

const rowToCategory = (r: CategoryRow): ShopCategory => ({ slug: r.slug, name: r.name, description: r.description, image: r.image, count: r.count, parentSlug: r.parent_slug ?? null, nameJa: r.name_ja ?? "" });

interface OrderRow {
  id: string;
  number: number;
  customer_id: string | null;
  status: OrderStatus;
  payment_method: PaymentMethod;
  first_name: string;
  last_name: string;
  address: string;
  phone: string;
  email: string;
  note: string;
  subtotal: number;
  total: number;
  currency: string;
  admin_note: string | null;
  shipping_fee: number | null;
  shipping_label: string | null;
  delivery: string | null;
  prepaid_required: number | null;
  discount: number | null;
  voucher_code: string | null;
  ship_stage: string | null;
  ship_fee_payment: string | null;
  ship_quote_json: string | null;
  created_at: string;
  updated_at: string;
}

interface OrderItemRow {
  id: number;
  order_id: string;
  product_id: number;
  purchase_status: string | null;
  purchase_note: string | null;
  slug: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
}

function hydrateOrders(rows: OrderRow[]): Order[] {
  if (rows.length === 0) return [];
  const db = getDb();
  const placeholders = rows.map(() => "?").join(",");
  const items = db
    .prepare(`SELECT id, order_id, product_id, slug, name, price, image, quantity, purchase_status, purchase_note FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id`)
    .all(...rows.map((r) => r.id)) as unknown as OrderItemRow[];
  const byOrder = new Map<string, CartItem[]>();
  for (const it of items) {
    const list = byOrder.get(it.order_id) ?? [];
    list.push({ productId: it.product_id, slug: it.slug, name: it.name, price: it.price, image: it.image, quantity: it.quantity, itemId: it.id, purchaseStatus: isPurchaseStatus(it.purchase_status) ? it.purchase_status : "not_bought", purchaseNote: it.purchase_note ?? "" });
    byOrder.set(it.order_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    ...(r.customer_id ? { customerId: r.customer_id } : {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    status: r.status,
    paymentMethod: r.payment_method,
    customer: { firstName: r.first_name, lastName: r.last_name, address: r.address, phone: r.phone, email: r.email, note: r.note },
    items: byOrder.get(r.id) ?? [],
    subtotal: r.subtotal,
    shippingFee: r.shipping_fee ?? 0,
    shippingLabel: r.shipping_label ?? "",
    delivery: r.delivery === "pickup" ? "pickup" : "ship",
    prepaidRequired: (r.prepaid_required ?? 0) === 1,
    discount: r.discount ?? 0,
    shipFeePayment: r.ship_fee_payment === "on_delivery" ? "on_delivery" : "prepaid",
    shipQuote: r.ship_quote_json ?? null,
    voucherCode: r.voucher_code ?? "",
    shipStage: isShipStage(r.ship_stage) ? r.ship_stage : "ordered",
    stageLog: [],
    total: r.total,
    currency: r.currency,
    adminNote: r.admin_note ?? "",
  }));
}

interface CustomerRow {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  role: string | null;
  permissions: string | null;
  active: number | null;
  username: string | null;
  customer_no: number | null;
  avatar: string | null;
  created_at: string;
  updated_at: string;
}

const rowToCustomer = (r: CustomerRow): Customer => ({
  id: r.id,
  email: r.email,
  passwordHash: r.password_hash,
  salt: r.salt,
  firstName: r.first_name,
  lastName: r.last_name,
  phone: r.phone,
  address: r.address,
  customerNo: r.customer_no ?? null,
  username: r.username ?? "",
  role: r.role === "owner" || r.role === "admin" || r.role === "staff" ? r.role : "customer",
  permissions: parseArr(r.permissions ?? "[]"),
  active: (r.active ?? 1) === 1,
  avatar: r.avatar ?? "",
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// ---------- Products ----------

export async function getAllProducts(includeDrafts = false): Promise<CatalogProduct[]> {
  const db = getDb();
  const sql = includeDrafts ? `${PRODUCT_SELECT} ORDER BY p.id` : `${PRODUCT_SELECT} WHERE p.status = 'publish' ORDER BY p.id`;
  return (db.prepare(sql).all() as unknown as ProductRow[]).map(rowToProduct);
}

export async function getProductBySlug(slug: string): Promise<CatalogProduct | null> {
  const row = getDb().prepare(`${PRODUCT_SELECT} WHERE p.slug = ?`).get(slug) as ProductRow | undefined;
  return row ? rowToProduct(row) : null;
}

export async function getProductById(id: number): Promise<CatalogProduct | null> {
  const row = getDb().prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(id) as ProductRow | undefined;
  return row ? rowToProduct(row) : null;
}

export async function getProductsBySlugs(slugs: string[]): Promise<CatalogProduct[]> {
  if (slugs.length === 0) return [];
  const placeholders = slugs.map(() => "?").join(",");
  const rows = getDb().prepare(`${PRODUCT_SELECT} WHERE p.status = 'publish' AND p.slug IN (${placeholders})`).all(...slugs) as unknown as ProductRow[];
  const bySlug = new Map(rows.map((r) => [r.slug, rowToProduct(r)] as const));
  return slugs.map((s) => bySlug.get(s)).filter((p): p is CatalogProduct => !!p);
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/**
 * Listing query. Filtering/sorting happens in JS after a single SELECT: the catalogue is small (hundreds of rows)
 * and Vietnamese accent-insensitive search is simpler here than in SQL. Move to FTS5 when the catalogue grows.
 */
/** Units bought per product across all orders that were not cancelled — the "bán chạy" ranking (no revenue shown). */
export function getUnitsSold(): Map<number, number> {
  const rows = getDb()
    .prepare("SELECT oi.product_id AS id, SUM(oi.quantity) AS n FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status != 'cancelled' GROUP BY oi.product_id")
    .all() as unknown as Array<{ id: number; n: number }>;
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

export async function queryProducts(q: ProductQuery = {}): Promise<ProductQueryResult> {
  const perPage = q.perPage ?? 32;
  const page = Math.max(1, q.page ?? 1);
  let items = await getAllProducts(q.includeDrafts);
  if (q.category) {
    // a category page lists its own products plus everything in its sub-categories
    const slugs = new Set(descendantSlugs(await getCategories(), q.category));
    items = items.filter((p) => p.categories.some((c) => slugs.has(c)));
  }
  if (q.tag) {
    const tag = normalise(q.tag).replace(/-/g, " ");
    items = items.filter((p) => p.tags.some((t) => normalise(t) === tag));
  }
  if (q.search) {
    const terms = normalise(q.search).split(/\s+/).filter(Boolean);
    items = items.filter((p) => {
      const hay = normalise(`${p.name} ${p.tags.join(" ")} ${p.shortDescription}`);
      return terms.every((t) => hay.includes(t));
    });
  }
  if (q.onSale) items = items.filter((p) => (p.regularPrice ?? 0) > p.price);
  switch (q.orderby) {
    case "price":
      items = [...items].sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      items = [...items].sort((a, b) => b.price - a.price);
      break;
    case "date":
      items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
    case "rating":
      items = [...items].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      break;
    default: {
      // "popularity" = units bought (orders that were not cancelled), newest id first among equals
      const sold = getUnitsSold();
      items = [...items].sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0) || b.id - a.id);
    }
  }
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;
  return { items: items.slice(start, start + perPage), total, page, perPage, totalPages };
}

export async function getRelatedProducts(product: CatalogProduct, limit = 4): Promise<CatalogProduct[]> {
  const explicit = await getProductsBySlugs(product.related);
  if (explicit.length >= limit) return explicit.slice(0, limit);
  const all = await getAllProducts();
  const sameCat = all.filter(
    (p) => p.id !== product.id && !explicit.some((e) => e.id === p.id) && p.categories.some((c) => product.categories.includes(c)),
  );
  return [...explicit, ...sameCat].slice(0, limit);
}

export type ProductInput = Omit<CatalogProduct, "id" | "createdAt" | "updatedAt"> & { id?: number };

export async function saveProduct(input: ProductInput): Promise<CatalogProduct> {
  const db = getDb();
  return withTransaction(db, () => {
    const now = new Date().toISOString();
    let id = input.id;
    if (id) {
      const exists = db.prepare("SELECT id FROM products WHERE id = ?").get(id);
      if (!exists) throw new Error(`Product ${id} not found`);
      db.prepare(`UPDATE products SET slug = ?, name = ?, price = ?, regular_price = ?, cost_price = ?, supplier_url = ?, min_stock = ?, currency = ?, sku = ?, stock = ?, stock_status = ?, fulfillment = ?,
        cost_jpy = ?, cost_source = ?, cost_url = ?, cost_checked_at = ?,
        tags = ?, images = ?, thumb = ?, short_description = ?, description = ?, related = ?, rating = ?, review_count = ?, status = ?, updated_at = ?, weight_g = ?, dims_cm = ?, dims_confidence = ?, dims_source = ?, name_ja = ?, short_description_ja = ?, description_ja = ?
        WHERE id = ?`).run(
        input.slug,
        input.name,
        input.price,
        input.regularPrice,
        input.costPrice,
        input.supplierUrl,
        input.minStock,
        input.currency,
        input.sku,
        input.stock,
        input.stockStatus,
        input.fulfillment ?? (input.stock !== null ? "stock" : "order"),
        input.costJpy ?? null,
        input.costSource ?? "",
        input.costUrl ?? "",
        input.costCheckedAt ?? null,
        JSON.stringify(input.tags),
        JSON.stringify(input.images),
        input.thumb,
        input.shortDescription,
        input.description,
        JSON.stringify(input.related),
        input.rating,
        input.reviewCount,
        input.status,
        now,
        input.weightG,
        input.dimsCm,
        input.dimsConfidence,
        input.dimsSource,
        input.nameJa,
        input.shortDescriptionJa,
        input.descriptionJa,
        id,
      );
      db.prepare("DELETE FROM product_categories WHERE product_id = ?").run(id);
    } else {
      const res = db.prepare(`INSERT INTO products (slug, name, price, regular_price, cost_price, supplier_url, min_stock, currency, sku, stock, stock_status, fulfillment, cost_jpy, cost_source, cost_url, cost_checked_at, tags, images, thumb,
        short_description, description, related, rating, review_count, status, created_at, updated_at, weight_g, dims_cm, dims_confidence, dims_source, name_ja, short_description_ja, description_ja)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        input.slug,
        input.name,
        input.price,
        input.regularPrice,
        input.costPrice,
        input.supplierUrl,
        input.minStock,
        input.currency,
        input.sku,
        input.stock,
        input.stockStatus,
        input.fulfillment ?? (input.stock !== null ? "stock" : "order"),
        input.costJpy ?? null,
        input.costSource ?? "",
        input.costUrl ?? "",
        input.costCheckedAt ?? null,
        JSON.stringify(input.tags),
        JSON.stringify(input.images),
        input.thumb,
        input.shortDescription,
        input.description,
        JSON.stringify(input.related),
        input.rating,
        input.reviewCount,
        input.status,
        now,
        now,
        input.weightG,
        input.dimsCm,
      );
      id = Number(res.lastInsertRowid);
    }
    const insPC = db.prepare("INSERT OR IGNORE INTO product_categories (product_id, category_slug, position) VALUES (?, ?, ?)");
    input.categories.forEach((slug, i) => insPC.run(id, slug, i));
    const row = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(id) as unknown as ProductRow;
    return rowToProduct(row);
  });
}

export async function deleteProduct(id: number): Promise<boolean> {
  const res = getDb().prepare("DELETE FROM products WHERE id = ?").run(id);
  return Number(res.changes) > 0;
}

export async function slugExists(slug: string, exceptId?: number): Promise<boolean> {
  const row = getDb()
    .prepare("SELECT 1 FROM products WHERE slug = ? AND id IS NOT ?")
    .get(slug, exceptId ?? null);
  return !!row;
}

// ---------- Categories ----------

export async function getCategories(): Promise<ShopCategory[]> {
  const rows = getDb().prepare(CATEGORY_SELECT).all() as unknown as CategoryRow[];
  return rows.map(rowToCategory).sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

export interface CategoryInput {
  slug: string;
  name: string;
  description: string;
  image: string | null;
  parentSlug?: string | null;
  nameJa?: string;
  /** Slug of the category being edited (omit when creating). */
  originalSlug?: string;
}

export async function categorySlugExists(slug: string, except?: string): Promise<boolean> {
  const row = getDb().prepare("SELECT 1 FROM categories WHERE slug = ? AND slug IS NOT ?").get(slug, except ?? null);
  return !!row;
}

export async function saveCategory(input: CategoryInput): Promise<ShopCategory> {
  const db = getDb();
  return withTransaction(db, () => {
    if (input.originalSlug) {
      const cat = db.prepare("SELECT slug FROM categories WHERE slug = ?").get(input.originalSlug) as { slug: string } | undefined;
      if (!cat) throw new Error("Danh mục không tồn tại.");
      if (input.slug !== cat.slug) {
        if (db.prepare("SELECT 1 FROM categories WHERE slug = ?").get(input.slug)) throw new Error("Đường dẫn đã tồn tại.");
        db.prepare("UPDATE product_categories SET category_slug = ? WHERE category_slug = ?").run(input.slug, cat.slug);
      }
      if (input.slug !== cat.slug) db.prepare("UPDATE categories SET parent_slug = ? WHERE parent_slug = ?").run(input.slug, cat.slug);
      const parent = input.parentSlug && input.parentSlug !== input.slug ? input.parentSlug : null;
      if (parent && descendantSlugs(await0(db), input.slug).includes(parent)) throw new Error("Không thể đặt danh mục cha là danh mục con của chính nó.");
      db.prepare("UPDATE categories SET slug = ?, name = ?, description = ?, image = ?, parent_slug = ?, name_ja = COALESCE(?, name_ja) WHERE slug = ?").run(
        input.slug,
        input.name,
        input.description,
        input.image,
        parent,
        input.nameJa ?? null,
        cat.slug,
      );
    } else {
      if (db.prepare("SELECT 1 FROM categories WHERE slug = ?").get(input.slug)) throw new Error("Đường dẫn đã tồn tại.");
      const next = (db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM categories").get() as { n: number }).n;
      db.prepare("INSERT INTO categories (slug, name, description, image, sort_order, parent_slug, name_ja) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        input.slug,
        input.name,
        input.description,
        input.image,
        next,
        input.parentSlug && input.parentSlug !== input.slug ? input.parentSlug : null,
        input.nameJa ?? "",
      );
    }
    const row = db.prepare(`${CATEGORY_SELECT} WHERE c.slug = ?`).get(input.slug) as unknown as CategoryRow;
    return rowToCategory(row);
  });
}

/** Deletes a category and detaches it from every product. */
export async function deleteCategory(slug: string): Promise<boolean> {
  const db = getDb();
  return withTransaction(db, () => {
    const parent = (db.prepare("SELECT parent_slug FROM categories WHERE slug = ?").get(slug) as { parent_slug: string | null } | undefined)?.parent_slug ?? null;
    db.prepare("UPDATE categories SET parent_slug = ? WHERE parent_slug = ?").run(parent, slug); // children move up one level
    const res = db.prepare("DELETE FROM categories WHERE slug = ?").run(slug);
    db.prepare("DELETE FROM product_categories WHERE category_slug = ?").run(slug);
    return Number(res.changes) > 0;
  });
}

export async function getCategoryBySlug(slug: string): Promise<ShopCategory | null> {
  const row = getDb().prepare(`${CATEGORY_SELECT} WHERE c.slug = ?`).get(slug) as CategoryRow | undefined;
  return row ? rowToCategory(row) : null;
}

// ---------- Orders ----------

export interface CreateOrderInput {
  customer: OrderCustomer;
  items: CartItem[];
  paymentMethod: PaymentMethod;
  customerId?: string;
  /** "pickup" = collect at the warehouse (free); "ship" = domestic delivery priced by the chosen zone. */
  delivery?: "ship" | "pickup";
  /** shipping_zones.id of a VN-domestic method (required for "ship" when zones exist). */
  shippingZoneId?: number | null;
  /** Discount code typed at checkout; validated again here. */
  voucherCode?: string;
  /** Who pays the domestic delivery fee: with the order (default) or to the courier on delivery. */
  shipFeePayment?: ShipFeePayment;
  /** GHN 3-level address when the customer chose the live-quoted GHN option. */
  ghn?: { districtId: number; wardCode: string; provinceName: string; districtName: string; wardName: string } | null;
}

/** Billable weight, parcel size and subtotal of a set of cart lines, from the catalogue (never from the browser). */
function parcelOf(db: DatabaseSync, lines: Array<{ productId: number; quantity: number }>): { weightG: number; dims: ReturnType<typeof packageDims>; subtotal: number } {
  let weightG = 0;
  let subtotal = 0;
  const parcel: Array<{ dims: string | null; quantity: number }> = [];
  for (const it of lines) {
    const row = db.prepare("SELECT price, weight_g, dims_cm, dims_confidence FROM products WHERE id = ? AND status = 'publish'").get(it.productId) as { price: number; weight_g: number | null; dims_cm: string | null; dims_confidence: string | null } | undefined;
    if (!row) continue;
    const qty = Math.max(1, Math.floor(it.quantity));
    weightG += billableProductWeightG(row.weight_g, row.dims_cm, isDimsConfidence(row.dims_confidence) ? row.dims_confidence : null) * qty;
    subtotal += row.price * qty;
    parcel.push({ dims: row.dims_cm, quantity: qty });
  }
  return { weightG: Math.max(1, weightG), dims: packageDims(parcel), subtotal };
}

/** Live GHN quote for a cart (checkout preview and order creation share this). */
export async function quoteCartGhn(lines: Array<{ productId: number; quantity: number }>, to: { districtId: number; wardCode: string }, cod: boolean): Promise<{ quote: GhnQuote; weightG: number; dims: ReturnType<typeof packageDims> }> {
  const { weightG, dims, subtotal } = parcelOf(getDb(), lines);
  const quote = await quoteGhn({ toDistrictId: to.districtId, toWardCode: to.wardCode, weight: weightG, length: dims.length, width: dims.width, height: dims.height, insuranceValue: 0, codValue: cod ? subtotal : 0 });
  return { quote, weightG, dims };
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const db = getDb();
  // The live carrier quote is fetched before the transaction (network); it is re-quoted here, never trusted from the browser.
  const live = input.delivery !== "pickup" && input.ghn ? await quoteCartGhn(input.items, input.ghn, input.paymentMethod === "cod") : null;
  const ghnMethod = live ? (db.prepare("SELECT id, name FROM shipping_methods WHERE live_quote = 'ghn' AND active = 1 ORDER BY position LIMIT 1").get() as { id: number; name: string } | undefined) : undefined;
  return withTransaction(db, () => {
    const now = new Date().toISOString();
    // Re-price items from the catalogue so the client cannot tamper with prices.
    const items: CartItem[] = [];
    let prepaidRequired = false;
    let weightG = 0;
    let special = false;
    for (const it of input.items) {
      const row = db.prepare("SELECT id, slug, name, price, thumb, stock, weight_g, dims_cm, dims_confidence, tags FROM products WHERE id = ? AND status = 'publish'").get(it.productId) as
        | { id: number; slug: string; name: string; price: number; thumb: string; stock: number | null; weight_g: number | null; dims_cm: string | null; dims_confidence: string | null; tags: string | null }
        | undefined;
      if (!row) continue;
      if (isSpecialHandling(parseArr(row.tags ?? "[]"))) special = true;
      const qty = Math.max(1, Math.floor(it.quantity));
      // made-to-order: no tracked stock, or not enough on hand
      if (row.stock === null || row.stock < qty) prepaidRequired = true;
      weightG += billableProductWeightG(row.weight_g, row.dims_cm, isDimsConfidence(row.dims_confidence) ? row.dims_confidence : null) * qty;
      items.push({ productId: row.id, slug: row.slug, name: row.name, price: row.price, image: row.thumb, quantity: qty });
    }
    if (items.length === 0) throw new Error("Giỏ hàng trống");
    if (prepaidRequired && input.paymentMethod === "cod") throw new Error("Đơn có hàng order (đặt mua theo yêu cầu) cần thanh toán trước 100% bằng chuyển khoản.");
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);

    // Delivery: pickup is free; home delivery uses the chosen VN-domestic zone (per-order or per-kg fee, free above a threshold).
    const delivery: "ship" | "pickup" = input.delivery === "pickup" ? "pickup" : "ship";
    let shippingFee = 0;
    let shippingLabel = "Nhận tại kho";
    if (delivery === "ship" && live && input.ghn) {
      shippingFee = live.quote.fee.total;
      shippingLabel = `${ghnMethod?.name ?? "Giao Hàng Nhanh (GHN)"} · ${live.quote.service.name} · ${[input.ghn.wardName, input.ghn.districtName, input.ghn.provinceName].filter(Boolean).join(", ")}`;
    } else if (delivery === "ship") {
      const zone = input.shippingZoneId
        ? (db
            .prepare(
              `SELECT z.name, z.fee, z.unit, z.free_over, z.base_g, z.step_g, z.step_fee, z.extra_fee, m.name AS method, c.name AS carrier FROM shipping_zones z
               JOIN shipping_methods m ON m.id = z.method_id LEFT JOIN shipping_carriers c ON c.id = m.carrier_id
               WHERE z.id = ? AND z.active = 1 AND m.active = 1 AND m.leg = 'vn_domestic'`,
            )
            .get(input.shippingZoneId) as { name: string; fee: number; unit: string; free_over: number | null; base_g: number | null; step_g: number | null; step_fee: number | null; extra_fee: number | null; method: string; carrier: string | null } | undefined)
        : undefined;
      const anyZone = db.prepare("SELECT 1 FROM shipping_zones z JOIN shipping_methods m ON m.id = z.method_id WHERE z.active = 1 AND m.active = 1 AND m.leg = 'vn_domestic'").get();
      if (!zone && anyZone) throw new Error("Vui lòng chọn khu vực giao hàng.");
      if (zone) {
        // carrier tariff by billable weight + surcharge for liquids / bulky items; the shop covers it above free_over
        const base = zoneFeeForWeight({ fee: zone.fee, unit: zone.unit, baseG: zone.base_g, stepG: zone.step_g, stepFee: zone.step_fee }, weightG || 1000) + (special && zone.extra_fee ? zone.extra_fee : 0);
        const freeOver = policyFreeOver(parseShipPolicy(getSetting(db, "ship_policy")), zone.name);
        shippingFee = freeOver !== null && subtotal >= freeOver ? 0 : base;
        shippingLabel = `${zone.name}${zone.carrier ? ` · ${zone.carrier}` : ""}`;
      } else {
        shippingLabel = "Giao tận nhà (phí báo sau)";
      }
    }
    // Voucher (validated against the live table inside the same transaction; usage counted here).
    let discount = 0;
    let voucherCode = "";
    if (input.voucherCode?.trim()) {
      const check = checkVoucher(db, input.voucherCode, subtotal, input.customerId ?? null);
      if (!check.ok) throw new Error(check.message);
      discount = check.discount;
      voucherCode = check.voucher.code;
      db.prepare("UPDATE vouchers SET used_count = used_count + 1, updated_at = ? WHERE id = ?").run(now, check.voucher.id);
    }
    // Japan-side legs (per-order pricing mode): default method per leg, tier by billable weight, ¥ → VND.
    const mode: ShippingPricingMode = getSetting(db, "shipping_pricing_mode") === "included" ? "included" : "per_order";
    const rateRaw = Number.parseFloat(getSetting(db, "jpy_vnd_rate") ?? "175");
    const jpyRate = Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : 175;
    const jpLegs = mode === "per_order" ? quoteJpLegs(buildQuoteConfig(loadShippingMethods(db, true), mode, jpyRate), weightG || 1000, subtotal) : [];
    const jpFee = jpLegs.reduce((s, l) => s + l.fee, 0);
    const vnFee = shippingFee;
    const vnLabel = shippingLabel;
    shippingFee = vnFee + jpFee;
    if (jpLegs.length) shippingLabel = [...jpLegs.map((l) => l.label), vnLabel].filter(Boolean).join(" + ");
    // Fee paid to the courier on delivery stays out of the amount the shop collects.
    const shipFeePayment: ShipFeePayment = delivery === "ship" && input.shipFeePayment === "on_delivery" ? "on_delivery" : "prepaid";
    const total = Math.max(0, subtotal - discount) + (shipFeePayment === "prepaid" ? shippingFee : 0);
    const number = Number(getSetting(db, "next_order_number") ?? "1001");
    setSetting(db, "next_order_number", String(number + 1));
    const id = randomUUID();
    const c = { ...input.customer };
    if (input.ghn) {
      const tail = [input.ghn.wardName, input.ghn.districtName, input.ghn.provinceName].filter(Boolean).join(", ");
      if (tail && !c.address.toLowerCase().includes(input.ghn.districtName.toLowerCase())) c.address = `${c.address}, ${tail}`;
    }
    db.prepare(`INSERT INTO orders (id, number, customer_id, status, payment_method, first_name, last_name, address, phone, email, note,
      subtotal, total, currency, created_at, updated_at, shipping_fee, shipping_label, delivery, prepaid_required, discount, voucher_code, ship_fee_payment, ship_quote_json) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VNĐ', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      number,
      input.customerId ?? null,
      input.paymentMethod,
      c.firstName,
      c.lastName,
      c.address,
      c.phone,
      c.email,
      c.note,
      subtotal,
      total,
      now,
      now,
      shippingFee,
      shippingLabel,
      delivery,
      prepaidRequired ? 1 : 0,
      discount,
      voucherCode,
      shipFeePayment,
      live ? JSON.stringify({ ...live.quote, weightG: live.weightG, dims: live.dims, to: input.ghn }) : null,
    );
    db.prepare("INSERT INTO order_stage_log (order_id, stage, note, created_at) VALUES (?, 'ordered', '', ?)").run(id, now);
    const insItem = db.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, image, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const decStock = db.prepare(`UPDATE products SET stock = MAX(0, stock - ?),
      stock_status = CASE WHEN MAX(0, stock - ?) = 0 THEN 'outofstock' ELSE 'instock' END, updated_at = ?
      WHERE id = ? AND stock IS NOT NULL`);
    for (const it of items) {
      insItem.run(id, it.productId, it.slug, it.name, it.price, it.image, it.quantity);
      decStock.run(it.quantity, it.quantity, now, it.productId);
    }
    // Pre-fill the per-leg table so the admin sees what was quoted (editable later).
    const insLeg = db.prepare("INSERT OR REPLACE INTO order_legs (order_id, leg, method_id, zone_id, label, fee, tracking, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)");
    for (const l of jpLegs) insLeg.run(id, l.leg, l.methodId, l.zoneId, l.label, l.fee, `Báo giá khi đặt: ${l.feeRaw.toLocaleString("vi-VN")}${l.currency}`, now);
    if (delivery === "pickup") insLeg.run(id, "vn_domestic", null, null, "Khách tự tới kho lấy", 0, "", now);
    else if (live) insLeg.run(id, "vn_domestic", ghnMethod?.id ?? null, null, vnLabel, vnFee, `Báo giá GHN ${live.quote.service.name} lúc đặt · kiện ${live.weightG} g ${live.dims.length}×${live.dims.width}×${live.dims.height} cm${shipFeePayment === "on_delivery" ? " · khách trả phí cho shipper" : ""}`, now);
    else if (vnLabel) insLeg.run(id, "vn_domestic", null, input.shippingZoneId ?? null, vnLabel, vnFee, shipFeePayment === "on_delivery" ? "Khách trả phí ship cho shipper khi nhận" : "", now);
    // The account's saved contact details follow the latest checkout, so "Địa chỉ" in my-account matches the order;
    // an ID-only account also adopts the email typed at checkout when no other account owns it.
    if (input.customerId) {
      const cust = db.prepare("SELECT email FROM customers WHERE id = ?").get(input.customerId) as { email: string } | undefined;
      if (cust) {
        db.prepare("UPDATE customers SET first_name = ?, last_name = ?, phone = ?, address = ?, updated_at = ? WHERE id = ?").run(c.firstName, c.lastName, c.phone, c.address, now, input.customerId);
        rememberAddress(db, input.customerId, `${c.lastName} ${c.firstName}`.trim(), c.phone, c.address);
        const typed = c.email.trim().toLowerCase();
        if (typed && cust.email.endsWith(`@${NO_EMAIL_DOMAIN}`)) {
          const taken = db.prepare("SELECT 1 FROM customers WHERE lower(email) = ? AND id != ?").get(typed, input.customerId);
          if (!taken) db.prepare("UPDATE customers SET email = ?, updated_at = ? WHERE id = ?").run(typed, now, input.customerId);
        }
      }
    }
    return {
      id,
      number,
      ...(input.customerId ? { customerId: input.customerId } : {}),
      createdAt: now,
      updatedAt: now,
      status: "pending",
      paymentMethod: input.paymentMethod,
      shipFeePayment,
      shipQuote: live ? JSON.stringify(live.quote) : null,
      customer: c,
      items,
      subtotal,
      shippingFee,
      shippingLabel,
      delivery,
      prepaidRequired,
      discount,
      voucherCode,
      shipStage: "ordered",
      stageLog: [{ stage: "ordered", note: "", at: now }],
      total,
      currency: "VNĐ",
      adminNote: "",
    };
  });
}

/** Warehouse address shown for the "Nhận tại kho" delivery option (settings.pickup_address). */
export async function getPickupAddress(): Promise<string> {
  return getSetting(getDb(), "pickup_address") ?? "";
}

export async function setPickupAddress(value: string): Promise<void> {
  setSetting(getDb(), "pickup_address", value.trim());
}

/** "per_order": customer pays JP domestic + JP→VN + VN delivery per order; "included": only VN delivery. */
export async function getShippingPricingMode(): Promise<ShippingPricingMode> {
  return getSetting(getDb(), "shipping_pricing_mode") === "included" ? "included" : "per_order";
}
export async function setShippingPricingMode(mode: ShippingPricingMode): Promise<void> {
  setSetting(getDb(), "shipping_pricing_mode", mode);
}
/** VND per JPY used to convert ¥-priced methods at checkout. */
export async function getJpyRate(): Promise<number> {
  const v = Number.parseFloat(getSetting(getDb(), "jpy_vnd_rate") ?? "175");
  return Number.isFinite(v) && v > 0 ? v : 175;
}
export async function setJpyRate(rate: number): Promise<void> {
  setSetting(getDb(), "jpy_vnd_rate", String(rate));
}

const ORDER_ORDER = "ORDER BY created_at DESC, number DESC";

export async function getOrders(status?: OrderStatus): Promise<Order[]> {
  const db = getDb();
  const rows = (status
    ? db.prepare(`SELECT * FROM orders WHERE status = ? ${ORDER_ORDER}`).all(status)
    : db.prepare(`SELECT * FROM orders ${ORDER_ORDER}`).all()) as unknown as OrderRow[];
  return hydrateOrders(rows);
}

export async function getOrderById(id: string): Promise<Order | null> {
  const db = getDb();
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
  if (!row) return null;
  const order = hydrateOrders([row])[0];
  const log = db.prepare("SELECT stage, note, created_at FROM order_stage_log WHERE order_id = ? ORDER BY id").all(id) as unknown as Array<{ stage: string; note: string; created_at: string }>;
  order.stageLog = log.filter((l) => isShipStage(l.stage)).map((l) => ({ stage: l.stage as ShipStage, note: l.note, at: l.created_at }));
  if (order.stageLog.length === 0) order.stageLog = [{ stage: "ordered", note: "", at: order.createdAt }];
  return order;
}

/** Move an order to a logistics stage (recorded in the log so the customer sees dates). */
export async function setOrderStage(id: string, stage: ShipStage, note = ""): Promise<boolean> {
  const db = getDb();
  const now = new Date().toISOString();
  const r = db.prepare("UPDATE orders SET ship_stage = ?, updated_at = ? WHERE id = ?").run(stage, now, id);
  if (r.changes === 0) return false;
  db.prepare("INSERT INTO order_stage_log (order_id, stage, note, created_at) VALUES (?, ?, ?, ?)").run(id, stage, note, now);
  // every line of the order has at least reached the purchase status implied by the logistics stage (never lowered)
  const minStatus = STAGE_TO_PURCHASE[stage];
  if (minStatus) {
    const lines = db.prepare("SELECT id, purchase_status FROM order_items WHERE order_id = ?").all(id) as unknown as Array<{ id: number; purchase_status: string | null }>;
    const upd = db.prepare("UPDATE order_items SET purchase_status = ?, purchase_updated_at = ? WHERE id = ?");
    for (const l of lines) {
      const cur = isPurchaseStatus(l.purchase_status) ? l.purchase_status : "not_bought";
      if (purchaseIndex(cur) < purchaseIndex(minStatus)) upd.run(minStatus, now, l.id);
    }
  }
  // arriving at the end also completes the order; anything before keeps it "processing"
  if (stage === "delivered") db.prepare("UPDATE orders SET status = 'completed' WHERE id = ? AND status <> 'cancelled'").run(id);
  else if (stage !== "ordered") db.prepare("UPDATE orders SET status = 'processing' WHERE id = ? AND status = 'pending'").run(id);
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// Order conversation (customer ↔ shop)

interface OrderMessageRow {
  id: number;
  order_id: string;
  sender: string;
  sender_name: string;
  body: string;
  read_by_customer: number;
  read_by_admin: number;
  created_at: string;
}
const rowToMessage = (r: OrderMessageRow): OrderMessage => ({
  id: r.id,
  orderId: r.order_id,
  sender: r.sender === "admin" ? "admin" : "customer",
  senderName: r.sender_name,
  body: r.body,
  readByCustomer: r.read_by_customer === 1,
  readByAdmin: r.read_by_admin === 1,
  createdAt: r.created_at,
});

export async function getOrderMessages(orderId: string): Promise<OrderMessage[]> {
  return (getDb().prepare("SELECT * FROM order_messages WHERE order_id = ? ORDER BY id").all(orderId) as unknown as OrderMessageRow[]).map(rowToMessage);
}

export async function addOrderMessage(input: { orderId: string; sender: "customer" | "admin"; senderName: string; body: string }): Promise<OrderMessage> {
  const db = getDb();
  const now = new Date().toISOString();
  const body = input.body.trim().slice(0, 2000);
  if (!body) throw new Error("Tin nhắn trống.");
  const r = db
    .prepare("INSERT INTO order_messages (order_id, sender, sender_name, body, read_by_customer, read_by_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(input.orderId, input.sender, input.senderName.slice(0, 80), body, input.sender === "customer" ? 1 : 0, input.sender === "admin" ? 1 : 0, now);
  db.prepare("UPDATE orders SET updated_at = ? WHERE id = ?").run(now, input.orderId);
  return { id: Number(r.lastInsertRowid), orderId: input.orderId, sender: input.sender, senderName: input.senderName, body, readByCustomer: input.sender === "customer", readByAdmin: input.sender === "admin", createdAt: now };
}

/** Mark the other side's messages as read by whoever is looking at the order now. */
export async function markOrderMessagesRead(orderId: string, reader: "customer" | "admin"): Promise<void> {
  const col = reader === "admin" ? "read_by_admin" : "read_by_customer";
  getDb().prepare(`UPDATE order_messages SET ${col} = 1 WHERE order_id = ? AND ${col} = 0`).run(orderId);
}

/** Unread customer messages per order (admin list badge). */
export async function getUnreadMessageCounts(reader: "customer" | "admin"): Promise<Map<string, number>> {
  const col = reader === "admin" ? "read_by_admin" : "read_by_customer";
  const other = reader === "admin" ? "customer" : "admin";
  const rows = getDb().prepare(`SELECT order_id, COUNT(*) AS n FROM order_messages WHERE ${col} = 0 AND sender = ? GROUP BY order_id`).all(other) as unknown as Array<{ order_id: string; n: number }>;
  return new Map(rows.map((r) => [r.order_id, r.n]));
}

export async function findOrder(number: number, phone: string): Promise<Order | null> {
  const digits = phone.replace(/\D/g, "");
  const row = getDb().prepare("SELECT * FROM orders WHERE number = ?").get(number) as OrderRow | undefined;
  if (!row || row.phone.replace(/\D/g, "") !== digits) return null;
  return hydrateOrders([row])[0];
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null> {
  const res = getDb().prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(status, new Date().toISOString(), id);
  return Number(res.changes) > 0 ? getOrderById(id) : null;
}

/** Admin override of what the customer pays for delivery; total is recomputed. */
export async function updateOrderShipping(id: string, patch: { fee: number; label: string; delivery: "ship" | "pickup" }): Promise<boolean> {
  const db = getDb();
  const row = db.prepare("SELECT subtotal, discount FROM orders WHERE id = ?").get(id) as { subtotal: number; discount: number | null } | undefined;
  if (!row) return false;
  const fee = Math.max(0, Math.round(patch.fee));
  const total = Math.max(0, row.subtotal - (row.discount ?? 0)) + fee;
  db.prepare("UPDATE orders SET shipping_fee = ?, shipping_label = ?, delivery = ?, total = ?, updated_at = ? WHERE id = ?").run(fee, patch.label, patch.delivery, total, new Date().toISOString(), id);
  return true;
}

/** Sum of chargeable weight (max of actual and volumetric) × quantity over the order's lines, in grams. */
export async function getOrderChargeableWeightG(orderId: string): Promise<number> {
  const rows = getDb()
    .prepare("SELECT oi.quantity, p.weight_g, p.dims_cm, p.dims_confidence FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?")
    .all(orderId) as unknown as Array<{ quantity: number; weight_g: number | null; dims_cm: string | null; dims_confidence: string | null }>;
  return rows.reduce((s, r) => s + billableProductWeightG(r.weight_g ?? null, r.dims_cm ?? null, isDimsConfidence(r.dims_confidence) ? r.dims_confidence : null) * r.quantity, 0);
}

interface OrderLegRow {
  order_id: string;
  leg: string;
  method_id: number | null;
  zone_id: number | null;
  label: string;
  fee: number;
  tracking: string;
  note: string;
  updated_at: string;
}
const rowToOrderLeg = (r: OrderLegRow): OrderLeg => ({
  orderId: r.order_id,
  leg: isShippingLeg(r.leg) ? r.leg : "jp_vn",
  methodId: r.method_id,
  zoneId: r.zone_id,
  label: r.label,
  fee: r.fee,
  tracking: r.tracking,
  note: r.note,
  updatedAt: r.updated_at,
});

/** Leg assignments for many orders at once (admin tables). */
export async function getOrderLegs(orderIds: string[]): Promise<Map<string, OrderLeg[]>> {
  const out = new Map<string, OrderLeg[]>();
  if (orderIds.length === 0) return out;
  const rows = getDb().prepare(`SELECT * FROM order_legs WHERE order_id IN (${orderIds.map(() => "?").join(",")})`).all(...orderIds) as unknown as OrderLegRow[];
  for (const r of rows) {
    const l = rowToOrderLeg(r);
    out.set(l.orderId, [...(out.get(l.orderId) ?? []), l]);
  }
  return out;
}

export async function saveOrderLeg(input: Omit<OrderLeg, "updatedAt">): Promise<void> {
  getDb()
    .prepare(
      `INSERT INTO order_legs (order_id, leg, method_id, zone_id, label, fee, tracking, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(order_id, leg) DO UPDATE SET method_id = excluded.method_id, zone_id = excluded.zone_id, label = excluded.label, fee = excluded.fee, tracking = excluded.tracking, note = excluded.note, updated_at = excluded.updated_at`,
    )
    .run(input.orderId, input.leg, input.methodId, input.zoneId, input.label, Math.max(0, Math.round(input.fee)), input.tracking, input.note, new Date().toISOString());
}

// ---------------------------------------------------------------------------------------------------------------------
// Vouchers & product sale prices (Admin › Sales)

interface VoucherRow {
  id: number;
  code: string;
  kind: string;
  value: number;
  min_subtotal: number;
  max_discount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  used_count: number;
  active: number;
  note: string;
  show_home: number | null;
  created_at: string;
  updated_at: string;
}
const rowToVoucher = (r: VoucherRow): Voucher => ({
  id: r.id,
  code: r.code,
  kind: r.kind === "fixed" ? "fixed" : "percent",
  value: r.value,
  minSubtotal: r.min_subtotal,
  maxDiscount: r.max_discount,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  usageLimit: r.usage_limit,
  usedCount: r.used_count,
  active: r.active === 1,
  note: r.note,
  showHome: (r.show_home ?? 1) !== 0,
  customerIds: [],
  customerLabels: [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Accounts a voucher was given to: `{ voucherId → [{ id, label }] }`. */
function voucherOwners(db: DatabaseSync): Map<number, Array<{ id: string; label: string }>> {
  const rows = db
    .prepare("SELECT vc.voucher_id, vc.customer_id, c.customer_no, c.username, c.email FROM voucher_customers vc LEFT JOIN customers c ON c.id = vc.customer_id ORDER BY c.customer_no")
    .all() as unknown as Array<{ voucher_id: number; customer_id: string; customer_no: number | null; username: string | null; email: string | null }>;
  const map = new Map<number, Array<{ id: string; label: string }>>();
  for (const r of rows) {
    const label = r.customer_no ? String(r.customer_no) : r.username || (r.email ? displayEmail(r.email) : "") || r.customer_id;
    map.set(r.voucher_id, [...(map.get(r.voucher_id) ?? []), { id: r.customer_id, label }]);
  }
  return map;
}

export async function getVouchers(): Promise<Voucher[]> {
  const db = getDb();
  const owners = voucherOwners(db);
  return (db.prepare("SELECT * FROM vouchers ORDER BY active DESC, created_at DESC").all() as unknown as VoucherRow[]).map((r) => {
    const v = rowToVoucher(r);
    const o = owners.get(v.id) ?? [];
    return { ...v, customerIds: o.map((x) => x.id), customerLabels: o.map((x) => x.label) };
  });
}

export async function saveVoucher(input: Omit<Voucher, "id" | "usedCount" | "createdAt" | "updatedAt" | "customerLabels"> & { id?: number }): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error("Cần mã voucher.");
  const dup = db.prepare("SELECT id FROM vouchers WHERE code = ? COLLATE NOCASE").get(code) as { id: number } | undefined;
  if (dup && dup.id !== input.id) throw new Error(`Mã "${code}" đã tồn tại.`);
  const params = [code, input.kind, Math.max(0, Math.round(input.value)), Math.max(0, Math.round(input.minSubtotal)), input.maxDiscount, input.startsAt, input.endsAt, input.usageLimit, input.active ? 1 : 0, input.note, input.showHome ? 1 : 0, now];
  return withTransaction(db, () => {
    let id = input.id;
    if (id) {
      db.prepare("UPDATE vouchers SET code = ?, kind = ?, value = ?, min_subtotal = ?, max_discount = ?, starts_at = ?, ends_at = ?, usage_limit = ?, active = ?, note = ?, show_home = ?, updated_at = ? WHERE id = ?").run(...params, id);
    } else {
      const r = db.prepare("INSERT INTO vouchers (code, kind, value, min_subtotal, max_discount, starts_at, ends_at, usage_limit, active, note, show_home, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(...params, now);
      id = Number(r.lastInsertRowid);
    }
    db.prepare("DELETE FROM voucher_customers WHERE voucher_id = ?").run(id);
    const ins = db.prepare("INSERT OR IGNORE INTO voucher_customers (voucher_id, customer_id) VALUES (?, ?)");
    for (const cid of new Set(input.customerIds ?? [])) ins.run(id, cid);
    return id;
  });
}

/**
 * Turn what the admin typed / uploaded (customer numbers, login IDs or emails — one per line or comma separated)
 * into customer ids. Unknown tokens are returned so the admin can fix the list.
 */
export async function resolveCustomerRefs(tokens: string[]): Promise<{ ids: string[]; unresolved: string[] }> {
  const db = getDb();
  const byNo = db.prepare("SELECT id FROM customers WHERE customer_no = ?");
  const byUser = db.prepare("SELECT id FROM customers WHERE username = ? COLLATE NOCASE");
  const byEmail = db.prepare("SELECT id FROM customers WHERE lower(email) = ?");
  const ids = new Set<string>();
  const unresolved: string[] = [];
  for (const raw of tokens) {
    const t = raw.trim().replace(/^#/, "");
    if (!t) continue;
    let row: { id: string } | undefined;
    if (/^\d{4,}$/.test(t)) row = byNo.get(Number(t)) as { id: string } | undefined;
    if (!row && t.includes("@")) row = byEmail.get(t.toLowerCase()) as { id: string } | undefined;
    if (!row) row = byUser.get(t) as { id: string } | undefined;
    if (!row && /^[0-9a-f-]{36}$/i.test(t) && db.prepare("SELECT 1 FROM customers WHERE id = ?").get(t)) row = { id: t };
    if (row) ids.add(row.id);
    else unresolved.push(t);
  }
  return { ids: [...ids], unresolved };
}

/** Vouchers a shopper can see on the home page: public ones flagged for the strip, plus those given to this account. */
export async function getHomeVouchers(customerId?: string | null): Promise<Array<Voucher & { personal: boolean }>> {
  const db = getDb();
  const owners = voucherOwners(db);
  const now = new Date().toISOString();
  const out: Array<Voucher & { personal: boolean }> = [];
  for (const r of db.prepare("SELECT * FROM vouchers WHERE active = 1 ORDER BY created_at DESC").all() as unknown as VoucherRow[]) {
    const v = rowToVoucher(r);
    if (v.startsAt && now < v.startsAt) continue;
    if (v.endsAt && now > v.endsAt) continue;
    if (v.usageLimit !== null && v.usedCount >= v.usageLimit) continue;
    const o = owners.get(v.id) ?? [];
    if (o.length === 0) {
      if (v.showHome) out.push({ ...v, personal: false });
    } else if (customerId && o.some((x) => x.id === customerId)) {
      out.push({ ...v, customerIds: o.map((x) => x.id), personal: true });
    }
  }
  return out.sort((a, b) => Number(b.personal) - Number(a.personal));
}

export async function deleteVoucher(id: number): Promise<void> {
  getDb().prepare("DELETE FROM vouchers WHERE id = ?").run(id);
}

export type VoucherCheck = { ok: true; voucher: Voucher; discount: number } | { ok: false; message: string };

/** Validate a code against a subtotal (active, window, usage limit, minimum) and compute the discount. */
function checkVoucher(db: DatabaseSync, codeRaw: string, subtotal: number, customerId?: string | null): VoucherCheck {
  const code = codeRaw.trim();
  const row = db.prepare("SELECT * FROM vouchers WHERE code = ? COLLATE NOCASE").get(code) as VoucherRow | undefined;
  if (!row) return { ok: false, message: "Mã giảm giá không tồn tại." };
  const v = rowToVoucher(row);
  const now = new Date().toISOString();
  if (!v.active) return { ok: false, message: "Mã giảm giá đã tắt." };
  const owners = db.prepare("SELECT customer_id FROM voucher_customers WHERE voucher_id = ?").all(v.id) as unknown as Array<{ customer_id: string }>;
  if (owners.length && !(customerId && owners.some((o) => o.customer_id === customerId))) {
    return { ok: false, message: customerId ? "Mã này được tặng riêng cho tài khoản khác." : "Mã này được tặng riêng cho tài khoản của bạn — vui lòng đăng nhập để dùng." };
  }
  if (v.startsAt && now < v.startsAt) return { ok: false, message: "Mã giảm giá chưa tới ngày áp dụng." };
  if (v.endsAt && now > v.endsAt) return { ok: false, message: "Mã giảm giá đã hết hạn." };
  if (v.usageLimit !== null && v.usedCount >= v.usageLimit) return { ok: false, message: "Mã giảm giá đã hết lượt dùng." };
  if (subtotal < v.minSubtotal) return { ok: false, message: `Đơn tối thiểu ${v.minSubtotal.toLocaleString("vi-VN")}đ để dùng mã này.` };
  let discount = v.kind === "percent" ? Math.round((subtotal * v.value) / 100) : v.value;
  if (v.maxDiscount !== null) discount = Math.min(discount, v.maxDiscount);
  discount = Math.min(discount, subtotal);
  if (discount <= 0) return { ok: false, message: "Mã giảm giá không áp dụng cho đơn này." };
  return { ok: true, voucher: v, discount };
}

export async function validateVoucher(code: string, subtotal: number, customerId?: string | null): Promise<VoucherCheck> {
  return checkVoucher(getDb(), code, subtotal, customerId);
}

/** Set / clear a sale price. `regularPrice` null = no sale (price is the only price). */
export async function updateProductPricing(id: number, price: number, regularPrice: number | null): Promise<boolean> {
  const r = getDb().prepare("UPDATE products SET price = ?, regular_price = ?, updated_at = ? WHERE id = ?").run(Math.max(0, Math.round(price)), regularPrice === null ? null : Math.max(0, Math.round(regularPrice)), new Date().toISOString(), id);
  return r.changes > 0;
}

export async function updateOrderAdminNote(id: string, note: string): Promise<boolean> {
  const res = getDb().prepare("UPDATE orders SET admin_note = ?, updated_at = ? WHERE id = ?").run(note, new Date().toISOString(), id);
  return Number(res.changes) > 0;
}

// ---------- Order files (receipts from Japan etc.) ----------

interface OrderFileRow {
  id: number;
  order_id: string;
  kind: OrderFileKind;
  file_name: string;
  path: string;
  mime: string;
  size: number;
  note: string;
  amount_jpy: number | null;
  created_at: string;
}

const rowToOrderFile = (r: OrderFileRow): OrderFile => ({
  id: r.id,
  orderId: r.order_id,
  kind: r.kind,
  fileName: r.file_name,
  path: r.path,
  mime: r.mime,
  size: r.size,
  note: r.note,
  amountJpy: r.amount_jpy,
  createdAt: r.created_at,
});

export async function getOrderFiles(orderId: string): Promise<OrderFile[]> {
  return (getDb().prepare("SELECT * FROM order_files WHERE order_id = ? ORDER BY id").all(orderId) as unknown as OrderFileRow[]).map(rowToOrderFile);
}

export async function getOrderFileByPath(path: string): Promise<OrderFile | null> {
  const row = getDb().prepare("SELECT * FROM order_files WHERE path = ?").get(path) as OrderFileRow | undefined;
  return row ? rowToOrderFile(row) : null;
}

export async function addOrderFile(input: Omit<OrderFile, "id" | "createdAt">): Promise<OrderFile> {
  const db = getDb();
  const now = new Date().toISOString();
  const res = db
    .prepare("INSERT INTO order_files (order_id, kind, file_name, path, mime, size, note, amount_jpy, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(input.orderId, input.kind, input.fileName, input.path, input.mime, input.size, input.note, input.amountJpy, now);
  return { ...input, id: Number(res.lastInsertRowid), createdAt: now };
}

export async function deleteOrderFile(id: number): Promise<OrderFile | null> {
  const db = getDb();
  const row = db.prepare("SELECT * FROM order_files WHERE id = ?").get(id) as OrderFileRow | undefined;
  if (!row) return null;
  db.prepare("DELETE FROM order_files WHERE id = ?").run(id);
  return rowToOrderFile(row);
}

/** Number of attached files per order (for list badges). */
export async function countOrderFiles(): Promise<Map<string, number>> {
  const rows = getDb().prepare("SELECT order_id, COUNT(*) AS n FROM order_files GROUP BY order_id").all() as unknown as Array<{ order_id: string; n: number }>;
  return new Map(rows.map((r) => [r.order_id, r.n]));
}

// ---------- Inventory ----------

export async function updateProductStock(id: number, stock: number | null, minStock?: number | null): Promise<boolean> {
  const db = getDb();
  const status = stock === 0 ? "outofstock" : stock === null ? null : "instock";
  const res =
    minStock === undefined
      ? db.prepare("UPDATE products SET stock = ?, stock_status = COALESCE(?, stock_status), updated_at = ? WHERE id = ?").run(stock, status, new Date().toISOString(), id)
      : db
          .prepare("UPDATE products SET stock = ?, stock_status = COALESCE(?, stock_status), min_stock = ?, updated_at = ? WHERE id = ?")
          .run(stock, status, minStock, new Date().toISOString(), id);
  return Number(res.changes) > 0;
}

export interface DemandLine {
  productId: number;
  needed: number;
  orders: Array<{ id: string; number: number; status: OrderStatus; quantity: number }>;
}

/** Quantities still to be sourced for open (pending/processing) orders, grouped by product. */
export async function getOpenOrderDemand(): Promise<Map<number, DemandLine>> {
  const rows = getDb()
    .prepare(
      `SELECT oi.product_id, oi.quantity, o.id, o.number, o.status FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.status IN ('pending','processing') ORDER BY o.number`,
    )
    .all() as unknown as Array<{ product_id: number; quantity: number; id: string; number: number; status: OrderStatus }>;
  const map = new Map<number, DemandLine>();
  for (const r of rows) {
    const line = map.get(r.product_id) ?? { productId: r.product_id, needed: 0, orders: [] };
    line.needed += r.quantity;
    line.orders.push({ id: r.id, number: r.number, status: r.status, quantity: r.quantity });
    map.set(r.product_id, line);
  }
  return map;
}

// ---------- Customers overview (registered + guests from orders) ----------

export interface CustomerOverview {
  /** `c:<customerId>` for registered accounts, `g:<email or phone>` for guests. */
  key: string;
  registered: boolean;
  customerId: string | null;
  customerNo: number | null;
  name: string;
  email: string;
  phone: string;
  address: string;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  createdAt: string | null;
}

export async function getCustomerOverview(): Promise<CustomerOverview[]> {
  const db = getDb();
  const map = new Map<string, CustomerOverview>();
  for (const c of (db.prepare("SELECT * FROM customers ORDER BY created_at").all() as unknown as CustomerRow[]).map(rowToCustomer)) {
    map.set(`c:${c.id}`, {
      key: `c:${c.id}`,
      registered: true,
      customerId: c.id,
      customerNo: c.customerNo,
      name: `${c.lastName} ${c.firstName}`.trim(),
      email: c.email,
      phone: c.phone,
      address: c.address,
      ordersCount: 0,
      totalSpent: 0,
      lastOrderAt: null,
      createdAt: c.createdAt,
    });
  }
  const emailToKey = new Map([...map.values()].map((c) => [c.email.toLowerCase(), c.key] as const));
  const orders = (db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all() as unknown as OrderRow[]);
  for (const o of orders) {
    const email = o.email.trim().toLowerCase();
    const key = (o.customer_id && map.has(`c:${o.customer_id}`) ? `c:${o.customer_id}` : null) ?? emailToKey.get(email) ?? `g:${email || o.phone.replace(/\D/g, "")}`;
    let c = map.get(key);
    if (!c) {
      c = { key, registered: false, customerId: null, customerNo: null, name: `${o.last_name} ${o.first_name}`.trim(), email: o.email, phone: o.phone, address: o.address, ordersCount: 0, totalSpent: 0, lastOrderAt: null, createdAt: null };
      map.set(key, c);
    }
    c.ordersCount += 1;
    if (o.status !== "cancelled") c.totalSpent += o.total;
    if (!c.lastOrderAt || o.created_at > c.lastOrderAt) c.lastOrderAt = o.created_at;
    if (!c.phone && o.phone) c.phone = o.phone;
    if (!c.address && o.address) c.address = o.address;
  }
  return [...map.values()].sort((a, b) => (b.lastOrderAt ?? b.createdAt ?? "").localeCompare(a.lastOrderAt ?? a.createdAt ?? ""));
}

export async function getOrdersForCustomerKey(key: string): Promise<Order[]> {
  const db = getDb();
  if (key.startsWith("c:")) {
    const c = await getCustomerById(key.slice(2));
    if (!c) return [];
    return getOrdersForCustomer({ id: c.id, email: c.email });
  }
  const ident = key.slice(2);
  const rows = (ident.includes("@")
    ? db.prepare(`SELECT * FROM orders WHERE LOWER(TRIM(email)) = ? ${ORDER_ORDER}`).all(ident)
    : db.prepare(`SELECT * FROM orders WHERE REPLACE(REPLACE(phone, ' ', ''), '.', '') = ? ${ORDER_ORDER}`).all(ident)) as unknown as OrderRow[];
  return hydrateOrders(rows);
}

// ---------- Customers ----------

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export type PublicCustomer = Omit<Customer, "passwordHash" | "salt">;

export function toPublicCustomer(c: Customer): PublicCustomer {
  const { passwordHash: _hash, salt: _salt, ...rest } = c;
  void _hash;
  void _salt;
  return rest;
}

export interface CreateCustomerInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  role?: UserRole;
  permissions?: string[];
  active?: boolean;
  username?: string;
}

export { NO_EMAIL_DOMAIN, displayEmail } from "./customer-email";

export async function findCustomerByLogin(login: string): Promise<Customer | null> {
  const v = login.trim();
  if (!v) return null;
  if (v.includes("@")) return findCustomerByEmail(v);
  const row = getDb().prepare("SELECT * FROM customers WHERE username = ? COLLATE NOCASE").get(v) as CustomerRow | undefined;
  return row ? rowToCustomer(row) : null;
}

/** Verify a login ID or email + password (admin sign-in). */
export async function verifyCustomerLogin(login: string, password: string): Promise<Customer | null> {
  const c = await findCustomerByLogin(login);
  if (!c || !c.active) return null;
  const a = Buffer.from(hashPassword(password, c.salt), "hex");
  const b = Buffer.from(c.passwordHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? c : null;
}

export async function findCustomerByEmail(email: string): Promise<Customer | null> {
  const row = getDb().prepare("SELECT * FROM customers WHERE email = ?").get(email.trim().toLowerCase()) as CustomerRow | undefined;
  return row ? rowToCustomer(row) : null;
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const row = getDb().prepare("SELECT * FROM customers WHERE id = ?").get(id) as CustomerRow | undefined;
  return row ? rowToCustomer(row) : null;
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const db = getDb();
  const username = (input.username ?? "").trim();
  const email = (input.email.trim() || (username ? `${username.toLowerCase()}@${NO_EMAIL_DOMAIN}` : "")).toLowerCase();
  if (!email) throw new Error("Cần email hoặc tên đăng nhập.");
  if (db.prepare("SELECT 1 FROM customers WHERE email = ?").get(email)) throw new Error("Email này đã được đăng ký. Vui lòng đăng nhập.");
  if (username && db.prepare("SELECT 1 FROM customers WHERE username = ? COLLATE NOCASE").get(username)) throw new Error("Tên đăng nhập này đã được dùng.");
  const salt = randomBytes(16).toString("hex");
  const now = new Date().toISOString();
  const nextNo = (db.prepare("SELECT COALESCE(MAX(customer_no), 10000) + 1 AS n FROM customers").get() as { n: number }).n;
  const customer: Customer = {
    id: randomUUID(),
    email,
    passwordHash: hashPassword(input.password, salt),
    salt,
    firstName: input.firstName ?? "",
    lastName: input.lastName ?? "",
    avatar: "",
    phone: input.phone ?? "",
    address: input.address ?? "",
    customerNo: nextNo,
    username,
    role: input.role ?? "customer",
    permissions: input.permissions ?? [],
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`INSERT INTO customers (id, email, password_hash, salt, first_name, last_name, phone, address, role, permissions, active, username, customer_no, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    customer.id,
    customer.email,
    customer.passwordHash,
    customer.salt,
    customer.firstName,
    customer.lastName,
    customer.phone,
    customer.address,
    customer.role,
    JSON.stringify(customer.permissions),
    customer.active ? 1 : 0,
    customer.username || null,
    customer.customerNo,
    now,
    now,
  );
  return customer;
}

/** Admin: create any account (customer / staff / admin). */
export async function adminCreateUser(input: CreateCustomerInput & { role: UserRole }): Promise<Customer> {
  return createCustomer(input);
}

/** Every account, newest first (admin user list). */
export async function listCustomers(): Promise<Customer[]> {
  return (getDb().prepare("SELECT * FROM customers ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'staff' THEN 2 ELSE 3 END, created_at DESC").all() as unknown as CustomerRow[]).map(rowToCustomer);
}

export async function countActiveAdmins(): Promise<number> {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM customers WHERE role IN ('owner', 'admin') AND active = 1").get() as { n: number }).n;
}

/** True once the shop-owner account (role `owner`) exists — the env bootstrap login then retires. */
export async function hasOwnerAccount(): Promise<boolean> {
  return !!getDb().prepare("SELECT 1 FROM customers WHERE role = 'owner' AND active = 1 LIMIT 1").get();
}

export interface AdminUserPatch {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  role?: UserRole;
  permissions?: string[];
  active?: boolean;
  password?: string;
  username?: string;
}

/** Admin: update any field of an account, including email, role, permissions and active flag. */
export async function adminUpdateUser(id: string, patch: AdminUserPatch): Promise<Customer | null> {
  const db = getDb();
  return withTransaction(db, () => {
    const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as CustomerRow | undefined;
    if (!row) return null;
    const c = rowToCustomer(row);
    if (patch.username !== undefined) {
      const username = patch.username.trim();
      if (username && username.toLowerCase() !== c.username.toLowerCase() && db.prepare("SELECT 1 FROM customers WHERE username = ? COLLATE NOCASE AND id != ?").get(username, id))
        throw new Error("Tên đăng nhập này đã được dùng cho tài khoản khác.");
      c.username = username;
    }
    if (patch.email !== undefined) {
      const email = (patch.email.trim() || (c.username ? `${c.username.toLowerCase()}@${NO_EMAIL_DOMAIN}` : "")).toLowerCase();
      if (!email) throw new Error("Cần email hoặc tên đăng nhập.");
      if (email !== c.email && db.prepare("SELECT 1 FROM customers WHERE email = ? AND id != ?").get(email, id)) throw new Error("Email này đã được dùng cho tài khoản khác.");
      c.email = email;
    }
    if (patch.firstName !== undefined) c.firstName = patch.firstName;
    if (patch.lastName !== undefined) c.lastName = patch.lastName;
    if (patch.phone !== undefined) c.phone = patch.phone;
    if (patch.address !== undefined) c.address = patch.address;
    if (patch.role !== undefined) c.role = patch.role;
    if (patch.permissions !== undefined) c.permissions = patch.permissions;
    if (patch.active !== undefined) c.active = patch.active;
    if (patch.password) {
      c.salt = randomBytes(16).toString("hex");
      c.passwordHash = hashPassword(patch.password, c.salt);
    }
    c.updatedAt = new Date().toISOString();
    db.prepare(
      `UPDATE customers SET email = ?, first_name = ?, last_name = ?, phone = ?, address = ?, role = ?, permissions = ?, active = ?, username = ?, password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`,
    ).run(c.email, c.firstName, c.lastName, c.phone, c.address, c.role, JSON.stringify(c.permissions), c.active ? 1 : 0, c.username || null, c.passwordHash, c.salt, c.updatedAt, id);
    return c;
  });
}

/** Delete an account. Orders keep their snapshot (customer_id becomes NULL via ON DELETE SET NULL). */
export async function deleteCustomer(id: string): Promise<boolean> {
  return Number(getDb().prepare("DELETE FROM customers WHERE id = ?").run(id).changes) > 0;
}

export async function verifyCustomer(login: string, password: string): Promise<Customer | null> {
  const c = await findCustomerByLogin(login);
  if (!c || !c.active) return null;
  const a = Buffer.from(hashPassword(password, c.salt), "hex");
  const b = Buffer.from(c.passwordHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? c : null;
}

export async function updateCustomer(
  id: string,
  patch: Partial<Pick<Customer, "firstName" | "lastName" | "phone" | "address" | "avatar" | "email">> & { password?: string },
): Promise<Customer | null> {
  const db = getDb();
  return withTransaction(db, () => {
    const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as CustomerRow | undefined;
    if (!row) return null;
    const c = rowToCustomer(row);
    if (patch.firstName !== undefined) c.firstName = patch.firstName;
    if (patch.lastName !== undefined) c.lastName = patch.lastName;
    if (patch.phone !== undefined) c.phone = patch.phone;
    if (patch.address !== undefined) c.address = patch.address;
    if (patch.avatar !== undefined) c.avatar = patch.avatar;
    if (patch.email !== undefined) {
      const next = patch.email.trim().toLowerCase() || (c.username ? `${c.username.toLowerCase()}@${NO_EMAIL_DOMAIN}` : c.email);
      if (next !== c.email) {
        if (db.prepare("SELECT 1 FROM customers WHERE email = ? AND id <> ?").get(next, id)) throw new Error("Email này đã được tài khoản khác sử dụng.");
        c.email = next;
      }
    }
    if (patch.password) {
      c.salt = randomBytes(16).toString("hex");
      c.passwordHash = hashPassword(patch.password, c.salt);
    }
    c.updatedAt = new Date().toISOString();
    db.prepare(`UPDATE customers SET email = ?, first_name = ?, last_name = ?, phone = ?, address = ?, avatar = ?, password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`).run(
      c.email,
      c.firstName,
      c.lastName,
      c.phone,
      c.address,
      c.avatar,
      c.passwordHash,
      c.salt,
      c.updatedAt,
      id,
    );
    return c;
  });
}

export async function getOrdersForCustomer(customer: Pick<Customer, "id" | "email">): Promise<Order[]> {
  const rows = getDb()
    .prepare(`SELECT * FROM orders WHERE customer_id = ? OR LOWER(TRIM(email)) = ? ${ORDER_ORDER}`)
    .all(customer.id, customer.email.toLowerCase()) as unknown as OrderRow[];
  return hydrateOrders(rows);
}

// ---------- Pages & posts ----------

export async function getPageBySlug(slug: string): Promise<StaticPage | null> {
  return (getDb().prepare("SELECT slug, title, content, date FROM pages WHERE slug = ?").get(slug) as StaticPage | undefined) ?? null;
}

interface PostRow {
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  date: string;
  status: string | null;
  image: string | null;
  updated_at: string | null;
}
const rowToPost = (r: PostRow): BlogPost => ({ slug: r.slug, title: r.title, content: r.content, excerpt: r.excerpt, date: r.date, status: r.status === "draft" ? "draft" : "publish", image: r.image ?? "", updatedAt: r.updated_at });

/** Published posts, newest first (storefront). */
export async function getPosts(): Promise<BlogPost[]> {
  return (getDb().prepare("SELECT * FROM posts WHERE status IS NULL OR status <> 'draft' ORDER BY date DESC").all() as unknown as PostRow[]).map(rowToPost);
}

/** Every post including drafts (admin). */
export async function getAllPosts(): Promise<BlogPost[]> {
  return (getDb().prepare("SELECT * FROM posts ORDER BY date DESC").all() as unknown as PostRow[]).map(rowToPost);
}

/** A published post by slug (storefront); drafts are invisible here. */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const r = getDb().prepare("SELECT * FROM posts WHERE slug = ? AND (status IS NULL OR status <> 'draft')").get(slug) as PostRow | undefined;
  return r ? rowToPost(r) : null;
}

export async function getPostBySlugAdmin(slug: string): Promise<BlogPost | null> {
  const r = getDb().prepare("SELECT * FROM posts WHERE slug = ?").get(slug) as PostRow | undefined;
  return r ? rowToPost(r) : null;
}

/** Create or update a post; `originalSlug` set = update (the slug may change). */
export async function savePost(input: { originalSlug?: string; slug: string; title: string; content: string; excerpt: string; date: string; status: "publish" | "draft"; image: string }): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  if (input.originalSlug) {
    db.prepare("UPDATE posts SET slug = ?, title = ?, content = ?, excerpt = ?, date = ?, status = ?, image = ?, updated_at = ? WHERE slug = ?").run(input.slug, input.title, input.content, input.excerpt, input.date, input.status, input.image, now, input.originalSlug);
  } else {
    db.prepare("INSERT INTO posts (slug, title, content, excerpt, date, status, image, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(input.slug, input.title, input.content, input.excerpt, input.date, input.status, input.image, now);
  }
}

export async function setPostStatus(slug: string, status: "publish" | "draft"): Promise<void> {
  getDb().prepare("UPDATE posts SET status = ?, updated_at = ? WHERE slug = ?").run(status, new Date().toISOString(), slug);
}

export async function deletePost(slug: string): Promise<void> {
  getDb().prepare("DELETE FROM posts WHERE slug = ?").run(slug);
}

/** Active shipping methods for quote building outside db.ts (nightly pricing job). */
export function loadShippingMethodsForQuote(db: DatabaseSync): ShippingMethod[] {
  return loadShippingMethods(db, true);
}

// ---------- Social proof ----------

export interface RecentPurchase {
  slug: string;
  name: string;
  image: string;
  /** Province / city guessed from the shipping address (last comma-separated part). */
  city: string;
  status: OrderStatus;
  createdAt: string;
}

/** Most recent confirmed order lines (processing / completed), one per product, for the "khách vừa mua" popup. */
export async function getRecentPurchases(limit = 12): Promise<RecentPurchase[]> {
  const rows = getDb()
    .prepare(
      `SELECT oi.slug, oi.name, oi.image, o.address, o.status, o.created_at
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status IN ('processing', 'completed')
        ORDER BY o.created_at DESC, oi.id DESC LIMIT ?`,
    )
    .all(limit * 3) as unknown as Array<{ slug: string; name: string; image: string; address: string; status: OrderStatus; created_at: string }>;
  const seen = new Set<string>();
  const out: RecentPurchase[] = [];
  for (const r of rows) {
    if (seen.has(r.slug)) continue;
    seen.add(r.slug);
    const parts = r.address.split(",").map((s) => s.trim()).filter(Boolean);
    const city = (parts[parts.length - 1] ?? "").replace(/^(tỉnh|tp\.?|thành phố|t\.p\.?)\s+/i, "").trim();
    out.push({ slug: r.slug, name: r.name, image: r.image, city, status: r.status, createdAt: r.created_at });
    if (out.length >= limit) break;
  }
  return out;
}

// ---------- Shipping ----------

interface ShippingMethodRow {
  id: number;
  name: string;
  description: string;
  extra_label: string;
  currency: string;
  position: number;
  active: number;
  leg: string | null;
  carrier_id: number | null;
  carrier_name: string | null;
  carrier_website: string | null;
  includes_both_ends: number | null;
  warehouse: string | null;
  home_delivery: number | null;
  notes: string | null;
  cod_ship_fee: number | null;
  live_quote: string | null;
}

interface ShippingCarrierRow {
  id: number;
  name: string;
  phone: string;
  website: string;
  note: string;
  position: number;
  legs: string | null;
}

const LEG_KEYS = ["jp_domestic", "jp_vn", "vn_transfer", "vn_domestic"] as const;
type LegKey = (typeof LEG_KEYS)[number];
const parseLegs = (v: string | null): LegKey[] => (v ?? "").split(",").map((x) => x.trim()).filter((x): x is LegKey => (LEG_KEYS as readonly string[]).includes(x));
interface ShippingZoneRow {
  id: number;
  method_id: number;
  name: string;
  fee: number;
  unit: string;
  free_over: number | null;
  extra_fee: number | null;
  extra_free_over: number | null;
  areas: string;
  eta: string;
  position: number;
  active: number;
  base_g: number | null;
  step_g: number | null;
  step_fee: number | null;
}

const rowToZone = (r: ShippingZoneRow): ShippingZone => ({
  id: r.id,
  methodId: r.method_id,
  name: r.name,
  fee: r.fee,
  unit: r.unit,
  baseG: r.base_g ?? null,
  stepG: r.step_g ?? null,
  stepFee: r.step_fee ?? null,
  freeOver: r.free_over,
  extraFee: r.extra_fee,
  extraFreeOver: r.extra_free_over,
  areas: r.areas,
  eta: r.eta,
  position: r.position,
  active: r.active === 1,
});

/** Shipping methods with their zones, ordered by position. `activeOnly` hides disabled methods/zones (storefront). */
export async function getShippingMethods(activeOnly = true): Promise<ShippingMethod[]> {
  return loadShippingMethods(getDb(), activeOnly);
}

function loadShippingMethods(db: DatabaseSync, activeOnly = true): ShippingMethod[] {
  const where = activeOnly ? "WHERE active = 1" : "";
  const methods = db
    .prepare(`SELECT m.*, c.name AS carrier_name, c.website AS carrier_website FROM shipping_methods m LEFT JOIN shipping_carriers c ON c.id = m.carrier_id ${where.replace("active", "m.active")} ORDER BY m.position, m.id`)
    .all() as unknown as ShippingMethodRow[];
  const zones = db.prepare(`SELECT * FROM shipping_zones ${where} ORDER BY position, id`).all() as unknown as ShippingZoneRow[];
  // the free-shipping threshold of Vietnam zones comes from the shop policy, never from the zone row
  const policy = parseShipPolicy(getSetting(db, "ship_policy"));
  return applyShipPolicy(methods.map((m): ShippingMethod => ({
    id: m.id,
    name: m.name,
    description: m.description,
    extraLabel: m.extra_label,
    currency: m.currency,
    position: m.position,
    active: m.active === 1,
    leg: isShippingLeg(m.leg) ? m.leg : "jp_vn",
    carrierId: m.carrier_id ?? null,
    carrierName: m.carrier_name ?? null,
    carrierWebsite: m.carrier_website || null,
    includesBothEnds: (m.includes_both_ends ?? 0) === 1,
    warehouse: m.warehouse ?? "",
    homeDelivery: (m.home_delivery ?? 1) === 1,
    codShipFee: (m.cod_ship_fee ?? 1) === 1,
    liveQuote: m.live_quote === "ghn" ? "ghn" : "",
    notes: m.notes ?? "",
    zones: zones.filter((z) => z.method_id === m.id).map(rowToZone),
  })), policy);
}

export async function getShippingCarriers(): Promise<ShippingCarrier[]> {
  return (getDb().prepare("SELECT * FROM shipping_carriers ORDER BY position, id").all() as unknown as ShippingCarrierRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    website: r.website,
    note: r.note,
    position: r.position,
    legs: parseLegs(r.legs),
  }));
}

export async function saveShippingCarrier(input: { id?: number; name: string; phone?: string; website?: string; note?: string; legs?: string[] }): Promise<number> {
  const db = getDb();
  const legs = (input.legs ?? []).filter((l): l is LegKey => (LEG_KEYS as readonly string[]).includes(l));
  if (input.id) {
    const current = db.prepare("SELECT legs FROM shipping_carriers WHERE id = ?").get(input.id) as { legs: string | null } | undefined;
    const legsValue = input.legs === undefined ? (current?.legs ?? "jp_vn") : legs.join(",") || "jp_vn";
    db.prepare("UPDATE shipping_carriers SET name = ?, phone = ?, website = ?, note = ?, legs = ? WHERE id = ?").run(input.name, input.phone ?? "", input.website ?? "", input.note ?? "", legsValue, input.id);
    return input.id;
  }
  const pos = (db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS n FROM shipping_carriers").get() as { n: number }).n;
  const r = db
    .prepare("INSERT INTO shipping_carriers (name, phone, website, note, position, legs) VALUES (?, ?, ?, ?, ?, ?)")
    .run(input.name, input.phone ?? "", input.website ?? "", input.note ?? "", pos, legs.join(",") || "jp_vn");
  return Number(r.lastInsertRowid);
}

export async function deleteShippingCarrier(id: number): Promise<boolean> {
  const db = getDb();
  db.prepare("UPDATE shipping_methods SET carrier_id = NULL WHERE carrier_id = ?").run(id);
  return Number(db.prepare("DELETE FROM shipping_carriers WHERE id = ?").run(id).changes) > 0;
}

export interface ShippingMethodInput {
  id?: number;
  name: string;
  description: string;
  extraLabel: string;
  currency: string;
  position: number;
  active: boolean;
  leg: ShippingMethod["leg"];
  carrierId: number | null;
  includesBothEnds: boolean;
  warehouse: string;
  homeDelivery: boolean;
  notes: string;
  codShipFee?: boolean;
}

export async function saveShippingMethod(input: ShippingMethodInput): Promise<number> {
  const db = getDb();
  const codShip = input.codShipFee === false ? 0 : 1;
  if (input.id) {
    db.prepare(
      "UPDATE shipping_methods SET name = ?, description = ?, extra_label = ?, currency = ?, position = ?, active = ?, leg = ?, carrier_id = ?, includes_both_ends = ?, warehouse = ?, home_delivery = ?, notes = ?, cod_ship_fee = ? WHERE id = ?",
    ).run(input.name, input.description, input.extraLabel, input.currency, input.position, input.active ? 1 : 0, input.leg, input.carrierId, input.includesBothEnds ? 1 : 0, input.warehouse, input.homeDelivery ? 1 : 0, input.notes, codShip, input.id);
    return input.id;
  }
  const r = db
    .prepare(
      "INSERT INTO shipping_methods (name, description, extra_label, currency, position, active, leg, carrier_id, includes_both_ends, warehouse, home_delivery, notes, cod_ship_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(input.name, input.description, input.extraLabel, input.currency, input.position, input.active ? 1 : 0, input.leg, input.carrierId, input.includesBothEnds ? 1 : 0, input.warehouse, input.homeDelivery ? 1 : 0, input.notes, codShip);
  return Number(r.lastInsertRowid);
}

export async function deleteShippingMethod(id: number): Promise<boolean> {
  const db = getDb();
  db.prepare("DELETE FROM shipping_zones WHERE method_id = ?").run(id);
  return Number(db.prepare("DELETE FROM shipping_methods WHERE id = ?").run(id).changes) > 0;
}

export type ShippingZoneInput = Omit<ShippingZone, "id"> & { id?: number };

export async function saveShippingZone(input: ShippingZoneInput): Promise<number> {
  const db = getDb();
  const args = [input.name, input.fee, input.unit, input.freeOver, input.extraFee, input.extraFreeOver, input.areas, input.eta, input.position, input.active ? 1 : 0, input.baseG, input.stepG, input.stepFee];
  if (input.id) {
    db.prepare(
      "UPDATE shipping_zones SET name = ?, fee = ?, unit = ?, free_over = ?, extra_fee = ?, extra_free_over = ?, areas = ?, eta = ?, position = ?, active = ?, base_g = ?, step_g = ?, step_fee = ? WHERE id = ?",
    ).run(...args, input.id);
    return input.id;
  }
  const r = db
    .prepare(
      "INSERT INTO shipping_zones (method_id, name, fee, unit, free_over, extra_fee, extra_free_over, areas, eta, position, active, base_g, step_g, step_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(input.methodId, ...args);
  return Number(r.lastInsertRowid);
}

export async function deleteShippingZone(id: number): Promise<boolean> {
  return Number(getDb().prepare("DELETE FROM shipping_zones WHERE id = ?").run(id).changes) > 0;
}

/** Shop free-shipping policy (Sales › Chính sách vận chuyển); off unless the owner switched it on. */
export async function getShipPolicy(): Promise<ShipPolicy> {
  return parseShipPolicy(getSetting(getDb(), "ship_policy"));
}

export async function setShipPolicy(policy: ShipPolicy): Promise<void> {
  setSetting(getDb(), "ship_policy", JSON.stringify(policy));
}

/** Storefront look & feel (Admin › Sales › Giao diện & Logo). */
export async function getSiteTheme(): Promise<SiteTheme> {
  return parseTheme(getSetting(getDb(), "site_theme"));
}

export async function setSiteTheme(theme: SiteTheme): Promise<void> {
  setSetting(getDb(), "site_theme", JSON.stringify(theme));
}

/** Selling-price formula parameters (Admin › Kho hàng › Công thức giá). */
export async function getPricingConfig(): Promise<PricingConfig> {
  return parsePricing(getSetting(getDb(), "pricing_config"));
}

export async function setPricingConfig(cfg: PricingConfig): Promise<void> {
  setSetting(getDb(), "pricing_config", JSON.stringify(cfg));
}

/** Active methods of the import legs + current ¥ rate, for the selling-price formula (independent of the checkout pricing mode). */
export async function getImportQuoteConfig(): Promise<ShippingQuoteConfig> {
  const db = getDb();
  const rate = Number.parseFloat(getSetting(db, "jpy_vnd_rate") ?? "175");
  return buildQuoteConfig(loadShippingMethods(db, true), "per_order", Number.isFinite(rate) && rate > 0 ? rate : 175);
}

/** Free-text notes shown under the shipping tables (one per line in admin). */
export async function getShippingNotes(): Promise<string[]> {
  try {
    const v = JSON.parse(getSetting(getDb(), "shipping_notes") ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  } catch {
    return [];
  }
}

export async function setShippingNotes(notes: string[]): Promise<void> {
  setSetting(getDb(), "shipping_notes", JSON.stringify(notes.map((n) => n.trim()).filter(Boolean)));
}

// ---------- Export ----------

/** The catalogue in data/seed.json format (products incl. drafts, categories, pages, posts). */
export async function exportCatalogue() {
  const db = getDb();
  const products = (await getAllProducts(true)).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    regularPrice: p.regularPrice,
    costPrice: p.costPrice,
    supplierUrl: p.supplierUrl,
    minStock: p.minStock,
    weightG: p.weightG,
    dimsCm: p.dimsCm,
    dimsConfidence: p.dimsConfidence,
    dimsSource: p.dimsSource,
    nameJa: p.nameJa,
    shortDescriptionJa: p.shortDescriptionJa,
    descriptionJa: p.descriptionJa,
    currency: p.currency,
    sku: p.sku,
    stock: p.stock,
    stockStatus: p.stockStatus,
    categories: p.categories,
    tags: p.tags,
    images: p.images,
    thumb: p.thumb,
    shortDescription: p.shortDescription,
    description: p.description,
    related: p.related,
    rating: p.rating,
    reviewCount: p.reviewCount,
    status: p.status,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
  const categories = (db.prepare("SELECT slug, name, description, image, parent_slug AS parent, name_ja AS nameJa FROM categories ORDER BY sort_order, slug").all() as unknown as Array<{ slug: string; name: string; description: string; image: string | null; parent: string | null; nameJa: string }>);
  const pages = db.prepare("SELECT slug, title, content, date FROM pages ORDER BY date").all();
  const posts = db.prepare("SELECT slug, title, content, excerpt, date FROM posts ORDER BY date DESC").all();
  return {
    version: 1,
    note: `Exported from the live catalogue (${process.env.NEXT_PUBLIC_SITE_URL ?? "server"}). Catalogue only — no customers/orders.`,
    meta: { nextOrderNumber: 1001, seededAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") },
    categories,
    products,
    pages,
    posts,
  };
}

// ---------- Stats / health ----------

export async function getStats() {
  const db = getDb();
  const one = <T>(sql: string) => db.prepare(sql).get() as T;
  return {
    customers: one<{ n: number }>("SELECT COUNT(*) AS n FROM customers").n,
    products: one<{ n: number }>("SELECT COUNT(*) AS n FROM products").n,
    published: one<{ n: number }>("SELECT COUNT(*) AS n FROM products WHERE status = 'publish'").n,
    outOfStock: one<{ n: number }>("SELECT COUNT(*) AS n FROM products WHERE stock_status = 'outofstock'").n,
    orders: one<{ n: number }>("SELECT COUNT(*) AS n FROM orders").n,
    pending: one<{ n: number }>("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'").n,
    revenue: one<{ n: number | null }>("SELECT SUM(total) AS n FROM orders WHERE status != 'cancelled'").n ?? 0,
    schema: getSchemaInfo(db),
  };
}

// ---- reviews ------------------------------------------------------------------------------------------------------

interface ReviewRow {
  id: number;
  product_id: number;
  product_name: string;
  product_slug: string;
  customer_id: string;
  author: string;
  rating: number;
  comment: string;
  status: ProductReview["status"];
  created_at: string;
}

const REVIEW_SELECT = `SELECT r.*, p.name AS product_name, p.slug AS product_slug FROM reviews r JOIN products p ON p.id = r.product_id`;

const rowToReview = (r: ReviewRow): ProductReview => ({
  id: r.id,
  productId: r.product_id,
  productName: r.product_name,
  productSlug: r.product_slug,
  customerId: r.customer_id,
  author: r.author,
  rating: r.rating,
  comment: r.comment,
  status: r.status,
  createdAt: r.created_at,
});

/** Approved reviews of one product, newest first. */
export async function getProductReviews(productId: number): Promise<ProductReview[]> {
  const rows = getDb()
    .prepare(
      `SELECT r.*, p.name AS product_name, p.slug AS product_slug,
              EXISTS(SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.customer_id = r.customer_id AND oi.product_id = r.product_id AND o.status <> 'cancelled') AS verified
       FROM reviews r JOIN products p ON p.id = r.product_id WHERE r.product_id = ? AND r.status = 'approved' ORDER BY r.created_at DESC`,
    )
    .all(productId) as unknown as Array<ReviewRow & { product_name: string; product_slug: string; verified: number }>;
  return rows.map((r) => ({ ...rowToReview(r), verified: r.verified === 1 }));
}

export async function hasPendingReview(productId: number, customerId: string): Promise<boolean> {
  return !!getDb().prepare("SELECT 1 FROM reviews WHERE product_id = ? AND customer_id = ? AND status = 'pending'").get(productId, customerId);
}

export async function addReview(input: { productId: number; customerId: string; author: string; rating: number; comment: string }): Promise<number> {
  const now = new Date().toISOString();
  const r = getDb()
    .prepare("INSERT INTO reviews (product_id, customer_id, author, rating, comment, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)")
    .run(input.productId, input.customerId, input.author, input.rating, input.comment, now, now);
  return Number(r.lastInsertRowid);
}

/** Every review for the admin screen (pending first, then newest). */
export async function getReviewsForAdmin(): Promise<ProductReview[]> {
  const rows = getDb().prepare(`${REVIEW_SELECT} ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC`).all() as unknown as ReviewRow[];
  return rows.map(rowToReview);
}

/** Average rating / count on the product follow its approved reviews (the seeded values stay while there are none). */
function refreshProductRating(db: DatabaseSync, productId: number) {
  const agg = db.prepare("SELECT AVG(rating) AS avg, COUNT(*) AS n FROM reviews WHERE product_id = ? AND status = 'approved'").get(productId) as { avg: number | null; n: number };
  if (agg.n > 0) db.prepare("UPDATE products SET rating = ?, review_count = ? WHERE id = ?").run(Math.round((agg.avg ?? 0) * 10) / 10, agg.n, productId);
}

export async function setReviewStatus(id: number, status: ProductReview["status"]): Promise<void> {
  const db = getDb();
  const row = db.prepare("SELECT product_id FROM reviews WHERE id = ?").get(id) as { product_id: number } | undefined;
  if (!row) return;
  db.prepare("UPDATE reviews SET status = ?, updated_at = ? WHERE id = ?").run(status, new Date().toISOString(), id);
  refreshProductRating(db, row.product_id);
}

export async function deleteReview(id: number): Promise<void> {
  const db = getDb();
  const row = db.prepare("SELECT product_id FROM reviews WHERE id = ?").get(id) as { product_id: number } | undefined;
  db.prepare("DELETE FROM reviews WHERE id = ?").run(id);
  if (row) refreshProductRating(db, row.product_id);
}

// ---- home banners --------------------------------------------------------------------------------------------------

interface BannerRow {
  id: number;
  image: string;
  href: string;
  alt: string;
  position: number;
  active: number;
  created_at: string;
  updated_at: string;
}
const rowToBanner = (r: BannerRow): Banner => ({ id: r.id, image: r.image, href: r.href, alt: r.alt, position: r.position, active: r.active === 1, createdAt: r.created_at, updatedAt: r.updated_at });

export async function getBanners(activeOnly = true): Promise<Banner[]> {
  const rows = getDb().prepare(`SELECT * FROM banners ${activeOnly ? "WHERE active = 1" : ""} ORDER BY position, id`).all() as unknown as BannerRow[];
  return rows.map(rowToBanner);
}

export async function saveBanner(input: Omit<Banner, "id" | "createdAt" | "updatedAt"> & { id?: number }): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();
  if (input.id) {
    db.prepare("UPDATE banners SET image = ?, href = ?, alt = ?, position = ?, active = ?, updated_at = ? WHERE id = ?").run(input.image, input.href, input.alt, input.position, input.active ? 1 : 0, now, input.id);
    return input.id;
  }
  const r = db.prepare("INSERT INTO banners (image, href, alt, position, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(input.image, input.href, input.alt, input.position, input.active ? 1 : 0, now, now);
  return Number(r.lastInsertRowid);
}

export async function deleteBanner(id: number): Promise<void> {
  getDb().prepare("DELETE FROM banners WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------------------------------------------------
// Customer address book (Trang của tôi › Thông tin cá nhân; picked at checkout)

interface AddressRow {
  id: number;
  customer_id: string;
  label: string;
  name: string;
  phone: string;
  address: string;
  is_default: number;
  created_at: string;
}
const rowToAddress = (r: AddressRow): CustomerAddress => ({ id: r.id, customerId: r.customer_id, label: r.label, name: r.name, phone: r.phone, address: r.address, isDefault: r.is_default === 1, createdAt: r.created_at });
const normAddr = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[.,;]+$/g, "").trim();

export async function listAddresses(customerId: string): Promise<CustomerAddress[]> {
  return (getDb().prepare("SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id ASC").all(customerId) as unknown as AddressRow[]).map(rowToAddress);
}

/** Add or update one address; the first address of a customer (or `isDefault`) becomes the default. */
export async function saveAddress(customerId: string, input: { id?: number; label: string; name: string; phone: string; address: string; isDefault?: boolean }): Promise<number> {
  const db = getDb();
  return withTransaction(db, () => {
    const count = (db.prepare("SELECT COUNT(*) AS n FROM customer_addresses WHERE customer_id = ?").get(customerId) as { n: number }).n;
    const makeDefault = !!input.isDefault || (count === 0 && !input.id);
    if (makeDefault) db.prepare("UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?").run(customerId);
    let id = input.id ?? 0;
    if (input.id) {
      db.prepare("UPDATE customer_addresses SET label = ?, name = ?, phone = ?, address = ?, is_default = CASE WHEN ? THEN 1 ELSE is_default END WHERE id = ? AND customer_id = ?").run(
        input.label,
        input.name,
        input.phone,
        input.address,
        makeDefault ? 1 : 0,
        input.id,
        customerId,
      );
    } else {
      const r = db.prepare("INSERT INTO customer_addresses (customer_id, label, name, phone, address, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(customerId, input.label || `Địa chỉ ${count + 1}`, input.name, input.phone, input.address, makeDefault ? 1 : 0, new Date().toISOString());
      id = Number(r.lastInsertRowid);
    }
    // keep the legacy single address column in sync with the default
    const def = db.prepare("SELECT address, phone FROM customer_addresses WHERE customer_id = ? AND is_default = 1").get(customerId) as { address: string; phone: string } | undefined;
    if (def) db.prepare("UPDATE customers SET address = ?, phone = CASE WHEN ? <> '' THEN ? ELSE phone END, updated_at = ? WHERE id = ?").run(def.address, def.phone, def.phone, new Date().toISOString(), customerId);
    return id;
  });
}

export async function deleteAddress(customerId: string, id: number): Promise<void> {
  const db = getDb();
  withTransaction(db, () => {
    const was = db.prepare("SELECT is_default FROM customer_addresses WHERE id = ? AND customer_id = ?").get(id, customerId) as { is_default: number } | undefined;
    db.prepare("DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?").run(id, customerId);
    if (was?.is_default) db.prepare("UPDATE customer_addresses SET is_default = 1 WHERE id = (SELECT id FROM customer_addresses WHERE customer_id = ? ORDER BY id LIMIT 1)").run(customerId);
  });
}

export async function setDefaultAddress(customerId: string, id: number): Promise<void> {
  const db = getDb();
  withTransaction(db, () => {
    db.prepare("UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?").run(customerId);
    db.prepare("UPDATE customer_addresses SET is_default = 1 WHERE id = ? AND customer_id = ?").run(id, customerId);
    const def = db.prepare("SELECT address FROM customer_addresses WHERE id = ?").get(id) as { address: string } | undefined;
    if (def) db.prepare("UPDATE customers SET address = ?, updated_at = ? WHERE id = ?").run(def.address, new Date().toISOString(), customerId);
  });
}

/** After an order: add the delivery address to the book when it is new (no default change). */
function rememberAddress(db: DatabaseSync, customerId: string, name: string, phone: string, address: string): void {
  const a = address.trim();
  if (!a) return;
  const rows = db.prepare("SELECT id, address FROM customer_addresses WHERE customer_id = ?").all(customerId) as unknown as Array<{ id: number; address: string }>;
  if (rows.some((r) => normAddr(r.address) === normAddr(a))) return;
  db.prepare("INSERT INTO customer_addresses (customer_id, label, name, phone, address, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(customerId, `Địa chỉ ${rows.length + 1}`, name, phone, a, rows.length === 0 ? 1 : 0, new Date().toISOString());
}

// ---------------------------------------------------------------------------------------------------------------------
// Purchase management (Kho hàng › Quản lý mua hàng)

export interface PurchaseLine {
  itemId: number;
  orderId: string;
  orderNumber: number;
  orderStatus: OrderStatus;
  orderCreatedAt: string;
  customerName: string;
  productId: number;
  name: string;
  quantity: number;
  purchaseStatus: PurchaseStatus;
  purchaseNote: string;
  purchaseUpdatedAt: string | null;
  sku: string | null;
  thumb: string | null;
  costPrice: number | null;
  supplierUrl: string | null;
}

/** Every line of the open orders (pending / processing); `includeDone` adds completed orders. Cancelled orders never. */
export async function getPurchaseLines(includeDone = false): Promise<PurchaseLine[]> {
  const statuses = includeDone ? "('pending','processing','completed')" : "('pending','processing')";
  const rows = getDb()
    .prepare(
      `SELECT oi.id, oi.order_id, o.number, o.status, o.created_at, o.first_name, o.last_name, oi.product_id, oi.name, oi.quantity,
              oi.purchase_status, oi.purchase_note, oi.purchase_updated_at, p.sku, p.thumb, p.cost_price, p.supplier_url
       FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.status IN ${statuses} ORDER BY o.created_at DESC, oi.id`,
    )
    .all() as unknown as Array<{
    id: number; order_id: string; number: number; status: OrderStatus; created_at: string; first_name: string; last_name: string; product_id: number; name: string; quantity: number;
    purchase_status: string | null; purchase_note: string | null; purchase_updated_at: string | null; sku: string | null; thumb: string | null; cost_price: number | null; supplier_url: string | null;
  }>;
  return rows.map((r) => ({
    itemId: r.id,
    orderId: r.order_id,
    orderNumber: r.number,
    orderStatus: r.status,
    orderCreatedAt: r.created_at,
    customerName: `${r.last_name} ${r.first_name}`.trim(),
    productId: r.product_id,
    name: r.name,
    quantity: r.quantity,
    purchaseStatus: isPurchaseStatus(r.purchase_status) ? r.purchase_status : "not_bought",
    purchaseNote: r.purchase_note ?? "",
    purchaseUpdatedAt: r.purchase_updated_at,
    sku: r.sku,
    thumb: r.thumb,
    costPrice: r.cost_price,
    supplierUrl: r.supplier_url,
  }));
}

/** Set the purchase status (and optionally the note) of order lines; returns the number of rows changed. */
export async function setOrderItemsPurchase(itemIds: number[], status: PurchaseStatus, note?: string): Promise<number> {
  if (itemIds.length === 0) return 0;
  const db = getDb();
  const now = new Date().toISOString();
  const ph = itemIds.map(() => "?").join(",");
  const r =
    note === undefined
      ? db.prepare(`UPDATE order_items SET purchase_status = ?, purchase_updated_at = ? WHERE id IN (${ph})`).run(status, now, ...itemIds)
      : db.prepare(`UPDATE order_items SET purchase_status = ?, purchase_note = ?, purchase_updated_at = ? WHERE id IN (${ph})`).run(status, note, now, ...itemIds);
  return Number(r.changes);
}

export interface PipelineUnits {
  /** Bought in Japan or on the way (bought · NB→VN · về kho shop). */
  inTransit: number;
  /** Received at the shop warehouse, not yet handed to the customer. */
  atShop: number;
  /** inTransit + atShop — units the shop has paid for and still holds. */
  pipeline: number;
}

/** Per product: units of non-cancelled orders that are bought but not yet delivered, split by where they are. */
export async function getPipelineUnits(): Promise<Map<number, PipelineUnits>> {
  const ph = PIPELINE_STATUSES.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT oi.product_id, oi.purchase_status, SUM(oi.quantity) AS n FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.status <> 'cancelled' AND oi.purchase_status IN (${ph}) GROUP BY oi.product_id, oi.purchase_status`,
    )
    .all(...PIPELINE_STATUSES) as unknown as Array<{ product_id: number; purchase_status: string; n: number }>;
  const out = new Map<number, PipelineUnits>();
  for (const r of rows) {
    const u = out.get(r.product_id) ?? { inTransit: 0, atShop: 0, pipeline: 0 };
    if (r.purchase_status === "at_shop") u.atShop += r.n;
    else u.inTransit += r.n;
    u.pipeline = u.inTransit + u.atShop;
    out.set(r.product_id, u);
  }
  return out;
}

/** Set the SKU of one product (bulk generator). */
export async function updateProductSku(id: number, sku: string): Promise<boolean> {
  const r = getDb().prepare("UPDATE products SET sku = ?, updated_at = ? WHERE id = ?").run(sku, new Date().toISOString(), id);
  return r.changes > 0;
}
