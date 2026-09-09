import "server-only";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type {
  CartItem,
  CatalogProduct,
  Customer,
  Order,
  OrderCustomer,
  OrderFile,
  OrderFileKind,
  OrderStatus,
  PaymentMethod,
  ProductQuery,
  ProductQueryResult,
  ShopCategory,
  ShippingCarrier,
  ShippingMethod,
  ShippingZone,
  StaticPage,
  BlogPost,
  UserRole,
} from "@/types/shop";
import { descendantSlugs } from "./categories";
import { getDb, getSchemaInfo, getSetting, setSetting, withTransaction } from "./sqlite";

/** Synchronous category list for use inside transactions. */
function await0(db: ReturnType<typeof getDb>): ShopCategory[] {
  return (db.prepare("SELECT slug, name, description, image, parent_slug, 0 AS count FROM categories").all() as unknown as CategoryRow[]).map(rowToCategory);
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
  currency: string;
  sku: string | null;
  stock: number | null;
  stock_status: "instock" | "outofstock";
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
    supplierUrl: r.supplier_url ?? null,
    minStock: r.min_stock ?? null,
    weightG: r.weight_g ?? null,
    dimsCm: r.dims_cm ?? null,
    currency: r.currency,
    sku: r.sku,
    stock: r.stock,
    stockStatus: r.stock_status,
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
}

const CATEGORY_SELECT = `SELECT c.slug, c.name, c.description, c.image, c.parent_slug,
  (SELECT COUNT(*) FROM product_categories pc JOIN products p ON p.id = pc.product_id
    WHERE pc.category_slug = c.slug AND p.status = 'publish') AS count
  FROM categories c`;

const rowToCategory = (r: CategoryRow): ShopCategory => ({ slug: r.slug, name: r.name, description: r.description, image: r.image, count: r.count, parentSlug: r.parent_slug ?? null });

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
  created_at: string;
  updated_at: string;
}

interface OrderItemRow {
  order_id: string;
  product_id: number;
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
    .prepare(`SELECT order_id, product_id, slug, name, price, image, quantity FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id`)
    .all(...rows.map((r) => r.id)) as unknown as OrderItemRow[];
  const byOrder = new Map<string, CartItem[]>();
  for (const it of items) {
    const list = byOrder.get(it.order_id) ?? [];
    list.push({ productId: it.product_id, slug: it.slug, name: it.name, price: it.price, image: it.image, quantity: it.quantity });
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
  username: r.username ?? "",
  role: r.role === "admin" || r.role === "staff" ? r.role : "customer",
  permissions: parseArr(r.permissions ?? "[]"),
  active: (r.active ?? 1) === 1,
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
    default:
      // "popularity": the original lists newest ids first
      items = [...items].sort((a, b) => b.id - a.id);
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
      db.prepare(`UPDATE products SET slug = ?, name = ?, price = ?, regular_price = ?, cost_price = ?, supplier_url = ?, min_stock = ?, currency = ?, sku = ?, stock = ?, stock_status = ?,
        tags = ?, images = ?, thumb = ?, short_description = ?, description = ?, related = ?, rating = ?, review_count = ?, status = ?, updated_at = ?, weight_g = ?, dims_cm = ?
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
        id,
      );
      db.prepare("DELETE FROM product_categories WHERE product_id = ?").run(id);
    } else {
      const res = db.prepare(`INSERT INTO products (slug, name, price, regular_price, cost_price, supplier_url, min_stock, currency, sku, stock, stock_status, tags, images, thumb,
        short_description, description, related, rating, review_count, status, created_at, updated_at, weight_g, dims_cm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
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
      db.prepare("UPDATE categories SET slug = ?, name = ?, description = ?, image = ?, parent_slug = ? WHERE slug = ?").run(
        input.slug,
        input.name,
        input.description,
        input.image,
        parent,
        cat.slug,
      );
    } else {
      if (db.prepare("SELECT 1 FROM categories WHERE slug = ?").get(input.slug)) throw new Error("Đường dẫn đã tồn tại.");
      const next = (db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM categories").get() as { n: number }).n;
      db.prepare("INSERT INTO categories (slug, name, description, image, sort_order, parent_slug) VALUES (?, ?, ?, ?, ?, ?)").run(
        input.slug,
        input.name,
        input.description,
        input.image,
        next,
        input.parentSlug && input.parentSlug !== input.slug ? input.parentSlug : null,
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
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const db = getDb();
  return withTransaction(db, () => {
    const now = new Date().toISOString();
    // Re-price items from the catalogue so the client cannot tamper with prices.
    const items: CartItem[] = [];
    for (const it of input.items) {
      const row = db.prepare("SELECT id, slug, name, price, thumb FROM products WHERE id = ? AND status = 'publish'").get(it.productId) as
        | { id: number; slug: string; name: string; price: number; thumb: string }
        | undefined;
      if (!row) continue;
      items.push({ productId: row.id, slug: row.slug, name: row.name, price: row.price, image: row.thumb, quantity: Math.max(1, Math.floor(it.quantity)) });
    }
    if (items.length === 0) throw new Error("Giỏ hàng trống");
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const number = Number(getSetting(db, "next_order_number") ?? "1001");
    setSetting(db, "next_order_number", String(number + 1));
    const id = randomUUID();
    const c = input.customer;
    db.prepare(`INSERT INTO orders (id, number, customer_id, status, payment_method, first_name, last_name, address, phone, email, note,
      subtotal, total, currency, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VNĐ', ?, ?)`).run(
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
      subtotal,
      now,
      now,
    );
    const insItem = db.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, image, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const decStock = db.prepare(`UPDATE products SET stock = MAX(0, stock - ?),
      stock_status = CASE WHEN MAX(0, stock - ?) = 0 THEN 'outofstock' ELSE 'instock' END, updated_at = ?
      WHERE id = ? AND stock IS NOT NULL`);
    for (const it of items) {
      insItem.run(id, it.productId, it.slug, it.name, it.price, it.image, it.quantity);
      decStock.run(it.quantity, it.quantity, now, it.productId);
    }
    return {
      id,
      number,
      ...(input.customerId ? { customerId: input.customerId } : {}),
      createdAt: now,
      updatedAt: now,
      status: "pending",
      paymentMethod: input.paymentMethod,
      customer: c,
      items,
      subtotal,
      total: subtotal,
      currency: "VNĐ",
      adminNote: "",
    };
  });
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
  const row = getDb().prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
  return row ? hydrateOrders([row])[0] : null;
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
      c = { key, registered: false, customerId: null, name: `${o.last_name} ${o.first_name}`.trim(), email: o.email, phone: o.phone, address: o.address, ordersCount: 0, totalSpent: 0, lastOrderAt: null, createdAt: null };
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

/** Placeholder domain for staff accounts created without an email (they sign in with their login ID). */
export const NO_EMAIL_DOMAIN = "no-email.lienstore.local";

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
  const customer: Customer = {
    id: randomUUID(),
    email,
    passwordHash: hashPassword(input.password, salt),
    salt,
    firstName: input.firstName ?? "",
    lastName: input.lastName ?? "",
    phone: input.phone ?? "",
    address: input.address ?? "",
    username,
    role: input.role ?? "customer",
    permissions: input.permissions ?? [],
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`INSERT INTO customers (id, email, password_hash, salt, first_name, last_name, phone, address, role, permissions, active, username, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
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
  return (getDb().prepare("SELECT * FROM customers ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END, created_at DESC").all() as unknown as CustomerRow[]).map(rowToCustomer);
}

export async function countActiveAdmins(): Promise<number> {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM customers WHERE role = 'admin' AND active = 1").get() as { n: number }).n;
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

export async function verifyCustomer(email: string, password: string): Promise<Customer | null> {
  const c = await findCustomerByEmail(email);
  if (!c || !c.active) return null;
  const a = Buffer.from(hashPassword(password, c.salt), "hex");
  const b = Buffer.from(c.passwordHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? c : null;
}

export async function updateCustomer(
  id: string,
  patch: Partial<Pick<Customer, "firstName" | "lastName" | "phone" | "address">> & { password?: string },
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
    if (patch.password) {
      c.salt = randomBytes(16).toString("hex");
      c.passwordHash = hashPassword(patch.password, c.salt);
    }
    c.updatedAt = new Date().toISOString();
    db.prepare(`UPDATE customers SET first_name = ?, last_name = ?, phone = ?, address = ?, password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`).run(
      c.firstName,
      c.lastName,
      c.phone,
      c.address,
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

export async function getPosts(): Promise<BlogPost[]> {
  return getDb().prepare("SELECT slug, title, content, excerpt, date FROM posts ORDER BY date DESC").all() as unknown as BlogPost[];
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  return (getDb().prepare("SELECT slug, title, content, excerpt, date FROM posts WHERE slug = ?").get(slug) as BlogPost | undefined) ?? null;
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
  includes_both_ends: number | null;
  warehouse: string | null;
  home_delivery: number | null;
  notes: string | null;
}

interface ShippingCarrierRow {
  id: number;
  name: string;
  phone: string;
  website: string;
  note: string;
  position: number;
}
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
}

const rowToZone = (r: ShippingZoneRow): ShippingZone => ({
  id: r.id,
  methodId: r.method_id,
  name: r.name,
  fee: r.fee,
  unit: r.unit,
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
  const db = getDb();
  const where = activeOnly ? "WHERE active = 1" : "";
  const methods = db
    .prepare(`SELECT m.*, c.name AS carrier_name FROM shipping_methods m LEFT JOIN shipping_carriers c ON c.id = m.carrier_id ${where.replace("active", "m.active")} ORDER BY m.position, m.id`)
    .all() as unknown as ShippingMethodRow[];
  const zones = db.prepare(`SELECT * FROM shipping_zones ${where} ORDER BY position, id`).all() as unknown as ShippingZoneRow[];
  return methods.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    extraLabel: m.extra_label,
    currency: m.currency,
    position: m.position,
    active: m.active === 1,
    leg: m.leg === "jp_domestic" || m.leg === "vn_domestic" ? m.leg : "jp_vn",
    carrierId: m.carrier_id ?? null,
    carrierName: m.carrier_name ?? null,
    includesBothEnds: (m.includes_both_ends ?? 0) === 1,
    warehouse: m.warehouse ?? "",
    homeDelivery: (m.home_delivery ?? 1) === 1,
    notes: m.notes ?? "",
    zones: zones.filter((z) => z.method_id === m.id).map(rowToZone),
  }));
}

export async function getShippingCarriers(): Promise<ShippingCarrier[]> {
  return (getDb().prepare("SELECT * FROM shipping_carriers ORDER BY position, id").all() as unknown as ShippingCarrierRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    website: r.website,
    note: r.note,
    position: r.position,
  }));
}

export async function saveShippingCarrier(input: { id?: number; name: string; phone?: string; website?: string; note?: string }): Promise<number> {
  const db = getDb();
  if (input.id) {
    db.prepare("UPDATE shipping_carriers SET name = ?, phone = ?, website = ?, note = ? WHERE id = ?").run(input.name, input.phone ?? "", input.website ?? "", input.note ?? "", input.id);
    return input.id;
  }
  const pos = (db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS n FROM shipping_carriers").get() as { n: number }).n;
  const r = db.prepare("INSERT INTO shipping_carriers (name, phone, website, note, position) VALUES (?, ?, ?, ?, ?)").run(input.name, input.phone ?? "", input.website ?? "", input.note ?? "", pos);
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
}

export async function saveShippingMethod(input: ShippingMethodInput): Promise<number> {
  const db = getDb();
  if (input.id) {
    db.prepare(
      "UPDATE shipping_methods SET name = ?, description = ?, extra_label = ?, currency = ?, position = ?, active = ?, leg = ?, carrier_id = ?, includes_both_ends = ?, warehouse = ?, home_delivery = ?, notes = ? WHERE id = ?",
    ).run(input.name, input.description, input.extraLabel, input.currency, input.position, input.active ? 1 : 0, input.leg, input.carrierId, input.includesBothEnds ? 1 : 0, input.warehouse, input.homeDelivery ? 1 : 0, input.notes, input.id);
    return input.id;
  }
  const r = db
    .prepare(
      "INSERT INTO shipping_methods (name, description, extra_label, currency, position, active, leg, carrier_id, includes_both_ends, warehouse, home_delivery, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(input.name, input.description, input.extraLabel, input.currency, input.position, input.active ? 1 : 0, input.leg, input.carrierId, input.includesBothEnds ? 1 : 0, input.warehouse, input.homeDelivery ? 1 : 0, input.notes);
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
  const args = [input.name, input.fee, input.unit, input.freeOver, input.extraFee, input.extraFreeOver, input.areas, input.eta, input.position, input.active ? 1 : 0];
  if (input.id) {
    db.prepare(
      "UPDATE shipping_zones SET name = ?, fee = ?, unit = ?, free_over = ?, extra_fee = ?, extra_free_over = ?, areas = ?, eta = ?, position = ?, active = ? WHERE id = ?",
    ).run(...args, input.id);
    return input.id;
  }
  const r = db
    .prepare(
      "INSERT INTO shipping_zones (method_id, name, fee, unit, free_over, extra_fee, extra_free_over, areas, eta, position, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(input.methodId, ...args);
  return Number(r.lastInsertRowid);
}

export async function deleteShippingZone(id: number): Promise<boolean> {
  return Number(getDb().prepare("DELETE FROM shipping_zones WHERE id = ?").run(id).changes) > 0;
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
  const categories = (db.prepare("SELECT slug, name, description, image, parent_slug AS parent FROM categories ORDER BY sort_order, slug").all() as unknown as Array<{ slug: string; name: string; description: string; image: string | null; parent: string | null }>);
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
