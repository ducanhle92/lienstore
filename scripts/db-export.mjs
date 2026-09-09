#!/usr/bin/env node
// Export the live SQLite database to the seed JSON format.
//   npm run db:export                       → data/seed.json  (catalogue only: products, categories, pages, posts)
//   npm run db:export -- --all backup.json  → includes customers (hashed passwords) and orders
// Env: LIEN_DB_PATH (default data/lienstore.db)
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = process.argv.slice(2);
const all = args.includes("--all");
const out = args.find((a) => !a.startsWith("--")) ?? path.join("data", "seed.json");
const dbPath = process.env.LIEN_DB_PATH ?? path.join("data", "lienstore.db");
if (!fs.existsSync(dbPath)) {
  console.error(`database not found: ${dbPath}`);
  process.exit(1);
}
const db = new DatabaseSync(dbPath, { readOnly: true });
const q = (sql, ...p) => db.prepare(sql).all(...p);
const j = (s) => JSON.parse(s ?? "[]");

const categories = q("SELECT slug, name, description, image, parent_slug AS parent FROM categories ORDER BY sort_order, slug");
const products = q(
  `SELECT p.*, (SELECT json_group_array(category_slug) FROM (SELECT category_slug FROM product_categories WHERE product_id = p.id ORDER BY position)) AS categories
   FROM products p ORDER BY p.id`,
).map((r) => ({
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
  dimsConfidence: r.dims_confidence ?? null,
  dimsSource: r.dims_source ?? "",
  nameJa: r.name_ja ?? "",
  shortDescriptionJa: r.short_description_ja ?? "",
  descriptionJa: r.description_ja ?? "",
  currency: r.currency,
  sku: r.sku,
  stock: r.stock,
  stockStatus: r.stock_status,
  categories: j(r.categories),
  tags: j(r.tags),
  images: j(r.images),
  thumb: r.thumb,
  shortDescription: r.short_description,
  description: r.description,
  related: j(r.related),
  rating: r.rating,
  reviewCount: r.review_count,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
}));
const pages = q("SELECT slug, title, content, date FROM pages ORDER BY slug");
const posts = q("SELECT slug, title, content, excerpt, date FROM posts ORDER BY date DESC");
const nextOrderNumber = Number(db.prepare("SELECT value FROM settings WHERE key = 'next_order_number'").get()?.value ?? 1001);

const seed = {
  version: 1,
  note: all
    ? "Full backup (includes customers with hashed passwords and orders)."
    : "Seed catalogue imported into SQLite on first start (see src/lib/sqlite.ts). Regenerate with `npm run db:export`.",
  meta: { nextOrderNumber: all ? nextOrderNumber : 1001, seededAt: new Date().toISOString() },
  categories,
  products,
  pages,
  posts,
};
if (all) {
  seed.customers = q("SELECT * FROM customers ORDER BY created_at").map((r) => ({
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    salt: r.salt,
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone,
    address: r.address,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  const items = q("SELECT * FROM order_items ORDER BY id");
  seed.orders = q("SELECT * FROM orders ORDER BY number").map((r) => ({
    id: r.id,
    number: r.number,
    ...(r.customer_id ? { customerId: r.customer_id } : {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    status: r.status,
    paymentMethod: r.payment_method,
    customer: { firstName: r.first_name, lastName: r.last_name, address: r.address, phone: r.phone, email: r.email, note: r.note },
    items: items
      .filter((i) => i.order_id === r.id)
      .map((i) => ({ productId: i.product_id, slug: i.slug, name: i.name, price: i.price, image: i.image, quantity: i.quantity })),
    subtotal: r.subtotal,
    total: r.total,
    currency: r.currency,
  }));
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(seed, null, 1) + "\n", "utf8");
console.log(`exported ${products.length} products, ${categories.length} categories${all ? `, ${seed.customers.length} customers, ${seed.orders.length} orders` : ""} → ${out}`);
